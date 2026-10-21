import { apply, channels, cloneSettings, defaults, families, fromChannels, normalizeColor, sizeGroups, tokens, validateNumber, type Action, type Family, type HostMessage, type Mode, type SizeGroup, type Snapshot, type Token, type UIMessage } from './model';
import { hexToHsl, hexToHsv, hslToHex, hsvToHex } from './palette-algorithm.js';

function element<T extends Element>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing UI element: ${selector}`);
  return result;
}
const panels = element<HTMLDivElement>('.panels'), viewport = element<HTMLElement>('.viewport');
const picker = element<HTMLDivElement>('.picker'), notice = element<HTMLDivElement>('.notice');
const square = element<HTMLDivElement>('.color-square'), hue = element<HTMLInputElement>('.hue-track input'), alpha = element<HTMLInputElement>('.alpha-track input');
const channelBox = element<HTMLDivElement>('.channels'), format = element<HTMLSelectElement>('.format-select select');
const preview = window.parent === window;
let hostReady = preview;
let initializationError: string | null = null;
let initializationTimer: ReturnType<typeof setTimeout> | undefined;
let snapshot: Snapshot = { settings: defaults(), tokens: tokens(defaults()), existing: 0, total: 176, complete: false };
let tab: 'color' | 'size' = 'color', mode: Mode = 'light';
const expanded = new Set<string>();
let requestId = 0, busy = false, noticeTimer: ReturnType<typeof setTimeout>;
let pickerTarget: Action | null = null, pickerHsv = { h: 0, s: 100, v: 100 }, pickerAlpha = 1;
let pickerHsl = { h: 0, s: 100, l: 50 };
let pickerTimer: ReturnType<typeof setTimeout> | undefined;
let activeSquarePointer: number | null = null;
let pickerLayout = '';
const pickerFormats = new Map<string, string>();
const pickerInputBindings = new Map<HTMLInputElement, () => string>();
const pendingActions = new Map<number, Action>();
const inFlightRequests = new Set<number>();
let editTimer: ReturnType<typeof setTimeout> | undefined;
let recovering = false, closeRequested = false;
const inputBindings = new Map<HTMLInputElement, Action>();
const swatchBindings = new Map<HTMLButtonElement, Action>();
const resetBindings = new Map<HTMLButtonElement, string>();
let layout = '';
function send(message: UIMessage): void {
  if (!preview && message.type === 'close' && (pendingActions.size || inFlightRequests.size)) {
    closeRequested = true; flushEdits(); render();
    showNotice('正在同步最后的修改，完成后将关闭。');
    return;
  }
  if (!preview) { window.parent.postMessage({ pluginMessage: message }, '*'); return; }
  if (message.type === 'resize') { document.documentElement.style.setProperty('--window-height', `${message.height}px`); return; }
  if (message.type === 'close') { showNotice('这是浏览器预览；导入 Figma 后可关闭插件。'); return; }
  if (message.type === 'ready') {
    showNotice('浏览器预览：不会写入 Figma 变量。');
    return;
  }
  const generated = message.type === 'generate' || snapshot.complete;
  snapshot = { ...snapshot, existing: generated ? 176 : 0, complete: generated };
  if (message.type === 'action') pendingActions.delete(message.requestId);
  busy = false;
  render();
  if (message.type === 'generate') showNotice('预览已生成 176 个变量；实际写入需在 Figma 中运行。');
}
function actionTarget(action: Action): string {
  if (action.type === 'color-seed') return `${action.type}:${action.mode}:${action.family}`;
  if (action.type === 'size-seed') return `${action.type}:${action.group}`;
  if (action.type === 'token' || action.type === 'reset') return `${action.type}:${action.id}`;
  return action.type;
}
function flushEdits(): void {
  clearTimeout(editTimer); editTimer = undefined;
  if (preview || inFlightRequests.size || recovering || !pendingActions.size) return;
  const requests = [...pendingActions].map(([requestId, action]) => ({ requestId, action }));
  for (const request of requests) inFlightRequests.add(request.requestId);
  if (requests.length === 1) send({ type: 'action', ...requests[0] });
  else send({ type: 'actions', requests });
}
function acknowledge(message: Extract<HostMessage, { type: 'snapshot' | 'error' }>): void {
  const ids = message.requestIds ?? (message.requestId !== undefined ? [message.requestId] : []);
  for (const id of ids) {
    pendingActions.delete(id); inFlightRequests.delete(id);
  }
}
function showNotice(message: string, error = false): void {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle('error', error);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, error ? 7000 : 3500);
}
function dispatch(action: Action): void {
  if (closeRequested) { showNotice('正在同步并关闭插件，请稍候。'); return; }
  if (!hostReady) {
    showNotice('插件尚未成功初始化，请先处理错误提示并重新运行。', true);
    return;
  }
  try {
    const draft = cloneSettings(snapshot.settings);
    apply(draft, action);
    const value = action.type === 'color-seed' ? draft.colors[action.mode][action.family] : action.type === 'size-seed' ? action.value : undefined;
    if (value !== undefined && value === actionValue(action)) return;
    snapshot.settings = draft;
    snapshot.tokens = tokens(draft);
    const id = ++requestId;
    let previous: [number, Action] | undefined;
    for (const entry of pendingActions) previous = entry;
    if (previous && !inFlightRequests.has(previous[0]) && actionTarget(previous[1]) === actionTarget(action)) pendingActions.delete(previous[0]);
    pendingActions.set(id, action);
    if (preview) send({ type: 'action', action, requestId: id });
    else {
      render();
      if (editTimer === undefined && !inFlightRequests.size && !recovering) editTimer = setTimeout(flushEdits, 16);
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), true);
  }
}
function asset(name: string): DocumentFragment {
  const template = element<HTMLTemplateElement>(`#${name}`);
  return template.content.cloneNode(true) as DocumentFragment;
}
function button(text: string, className: string, click: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = text; b.className = className; b.onclick = click;
  return b;
}
function currentToken(id: string): Token {
  const token = snapshot.tokens.find(t => t.id === id);
  if (!token) throw new Error('未找到对应变量。');
  return token;
}
function actionValue(action: Action): string | number {
  if (action.type === 'color-seed') return snapshot.settings.colors[action.mode][action.family];
  if (action.type === 'token') return currentToken(action.id).value;
  if (action.type === 'size-seed') {
    if (action.group === 'size-unit') return snapshot.settings.sizes.sizeUnit;
    if (action.group === 'size-step') return snapshot.settings.sizes.sizeStep;
    return baseValue(action.group);
  }
  throw new Error('输入框绑定了不支持的操作。');
}
function input(value: string | number, label: string, action: Action, numericGroup?: string, base = true, readonly = false): HTMLInputElement {
  const i = document.createElement('input');
  i.className = 'value-input'; i.type = 'text'; i.value = String(value);
  i.setAttribute('aria-label', label); i.autocomplete = 'off'; i.spellcheck = false; i.readOnly = readonly;
  i.disabled = !hostReady;
  inputBindings.set(i, action);
  if (numericGroup) {
    i.inputMode = 'numeric'; i.setAttribute('role', 'spinbutton'); i.setAttribute('aria-valuenow', String(value));
  }
  const commit = () => {
    try {
      let v: number | string;
      if (numericGroup) {
        if (!/^-?\d+$/.test(i.value.trim())) throw new Error('请输入整数。');
        v = Number(i.value); validateNumber(numericGroup, v, base);
      } else {
        v = normalizeColor(i.value);
        if (action.type === 'color-seed' && v.length === 9) throw new Error('颜色基准值不支持透明度，请设为 100%。');
      }
      i.setAttribute('aria-invalid', 'false');
      i.dataset.editing = 'false';
      if (String(v) === String(actionValue(action))) { i.value = String(v); return; }
      if (action.type === 'color-seed' && typeof v === 'string') dispatch({ ...action, value: v });
      else if (action.type === 'size-seed' && typeof v === 'number') dispatch({ ...action, value: v });
      else if (action.type === 'token') dispatch({ ...action, value: v });
    } catch (error) {
      i.setAttribute('aria-invalid', 'true');
      showNotice(error instanceof Error ? error.message : String(error), true);
    }
  };
  i.addEventListener('focus', () => i.select());
  i.addEventListener('click', () => i.select());
  i.addEventListener('input', () => {
    if (readonly) return;
    i.dataset.editing = 'true';
    try {
      if (numericGroup) {
        if (!/^-?\d+$/.test(i.value.trim())) return;
        validateNumber(numericGroup, Number(i.value), base);
      } else {
        const raw = i.value.trim().replace(/^#/, '');
        if (raw.length !== 6 && raw.length !== 8) return;
        normalizeColor(i.value);
      }
      commit();
    } catch (error) {
      i.setAttribute('aria-invalid', 'true');
      showNotice(error instanceof Error ? error.message : String(error), true);
    }
  });
  i.addEventListener('change', commit);
  i.addEventListener('blur', () => {
    if (i.dataset.editing === 'true' && i.getAttribute('aria-invalid') !== 'true') commit();
    if (i.getAttribute('aria-invalid') === 'true') { i.value = String(actionValue(action)); i.setAttribute('aria-invalid', 'false'); i.dataset.editing = 'false'; }
  });
  i.addEventListener('keydown', event => {
    if (readonly) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(); i.blur(); }
    else if (event.key === 'Escape') { i.value = String(actionValue(action)); i.setAttribute('aria-invalid', 'false'); i.dataset.editing = 'false'; i.blur(); }
    else if (numericGroup && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const n = Number(i.value);
      if (!Number.isFinite(n)) { showNotice('请输入有效整数后再调整。', true); return; }
      i.dataset.editing = 'true';
      i.value = String(n + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1));
      commit();
    }
  });
  return i;
}
function swatch(value: string, action: Action, label: string): HTMLButtonElement {
  const b = button('', 'swatch', () => openPicker(String(actionValue(action)), action, b));
  b.disabled = !hostReady;
  swatchBindings.set(b, action);
  b.setAttribute('aria-label', `${label}颜色选择器`);
  const span = document.createElement('span');
  span.style.background = value;
  b.dataset.color = value;
  b.append(span);
  return b;
}
function tokenRow(t: Token): HTMLDivElement {
  const row = document.createElement('div');
  row.className = `token-row ${t.mode ? '' : 'number-row'}`;
  const label = document.createElement('div'); label.className = 'token-label';
  const name = document.createElement('span'); name.className = 'token-name';
  name.textContent = t.collection === 'radius' ? `radius-${t.name}` : t.label;
  label.append(name);
  if (!t.base && t.name !== 'infinite') {
    const reset = button('重置', 'reset', () => dispatch({ type: 'reset', id: t.id }));
    resetBindings.set(reset, t.id);
    reset.hidden = !t.modified;
    label.append(reset);
  }
  const field = document.createElement('div'); field.className = 'field';
  const action: Action = { type: 'token', id: t.id, value: t.value };
  field.append(input(t.value, name.textContent, action, t.mode ? undefined : t.group, t.base, t.name === 'infinite'));
  if (typeof t.value === 'string') field.append(swatch(t.value, action, name.textContent));
  row.append(label, field);
  return row;
}
function expandButton(label: string, key: string, subtitle?: string): HTMLButtonElement {
  const b = button('', 'expand', () => {
    if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
    closePicker(); render(); resize();
  });
  b.setAttribute('aria-expanded', String(expanded.has(key)));
  b.setAttribute('aria-label', `${label}展开收起`);
  const arrow = document.createElement('span'); arrow.className = 'arrow';
  arrow.append(asset(tab === 'size' ? 'arrow-size' : expanded.size ? 'arrow-expanded' : 'arrow-color'));
  const title = document.createElement('span'); title.className = 'head-title'; title.textContent = label;
  if (subtitle) {
    const sub = document.createElement('span'); sub.className = 'head-subtitle'; sub.textContent = subtitle;
    title.append(sub);
  }
  b.append(arrow, title); return b;
}
function colorPanel(family: Family, label: string): HTMLDivElement {
  const key = `${mode}:${family}`, panel = document.createElement('div');
  panel.className = `panel color-panel ${expanded.has(key) ? 'expanded' : ''}`;
  const head = document.createElement('div'); head.className = 'panel-head';
  const field = document.createElement('div'); field.className = 'field';
  const value = snapshot.settings.colors[mode][family];
  const action: Action = { type: 'color-seed', mode, family, value };
  field.append(input(value, `${label}基准值`, action), swatch(value, action, `${label}基准值`));
  head.append(expandButton(`${label}基准值`, key), field); panel.append(head);
  if (expanded.has(key)) {
    const list = document.createElement('div'); list.className = 'token-list';
    snapshot.tokens.filter(t => t.group === family && t.mode === mode).forEach(t => list.append(tokenRow(t)));
    panel.append(list);
  }
  return panel;
}
function baseValue(group: SizeGroup): number {
  const s = snapshot.settings.sizes;
  return ({ 'font-size': s.fontSize, 'icon-size': s.iconOverride ?? s.fontSize + 4, 'font-weight': s.fontWeight, radius: s.radius, 'control-height': s.controlHeight, border: s.border, padding: s.sizeUnit })[group];
}
function sizePanel(group: SizeGroup, label: string, baseLabel: string): HTMLDivElement {
  const key = `size:${group}`, panel = document.createElement('div');
  panel.className = `panel size-panel ${expanded.has(key) ? 'expanded' : ''}`;
  const head = document.createElement('div'); head.className = 'panel-head';
  if (group === 'border') {
    const title = document.createElement('div'); title.className = 'head-title'; title.style.paddingLeft = '14px'; title.textContent = label;
    const sub = document.createElement('span'); sub.className = 'head-subtitle'; sub.textContent = baseLabel; title.append(sub); head.append(title);
  } else head.append(expandButton(label, key, baseLabel));
  if (group !== 'padding') {
    const field = document.createElement('div'); field.className = 'field';
    if (group === 'icon-size') {
      const reset = button('重置', 'reset', () => dispatch({ type: 'reset-icon' }));
      reset.hidden = snapshot.settings.sizes.iconOverride === null;
      resetBindings.set(reset, 'icon');
      field.append(reset);
    }
    field.append(input(baseValue(group), label, { type: 'size-seed', group, value: baseValue(group) }, group));
    head.append(field);
  }
  panel.append(head);
  if (group === 'padding') {
    for (const seed of ['size-unit', 'size-step'] as const) {
      const row = document.createElement('div'); row.className = 'seed-row';
      const text = document.createElement('span'); text.textContent = seed === 'size-unit' ? '基础单位 size-unit' : '步长单位 size-step';
      const value = seed === 'size-unit' ? snapshot.settings.sizes.sizeUnit : snapshot.settings.sizes.sizeStep;
      row.append(text, input(value, seed, { type: 'size-seed', group: seed, value }, seed)); panel.append(row);
    }
  }
  if (expanded.has(key)) {
    const list = document.createElement('div'); list.className = 'token-list';
    snapshot.tokens.filter(t => t.group === group).forEach(t => list.append(tokenRow(t)));
    panel.append(list);
    if (group === 'control-height') {
      const padding = sizePanel('padding', '间距', 'size-unit / size-step');
      padding.classList.add('padding-panel');
      panel.append(padding);
    }
  }
  return panel;
}
function render(): void {
  const focused = document.activeElement instanceof HTMLInputElement && document.activeElement.closest('.panels') ? document.activeElement : null;
  const focusLabel = focused?.getAttribute('aria-label'), selection = focused ? [focused.selectionStart, focused.selectionEnd] : null;
  const draftValue = focused?.value, editing = focused?.dataset.editing === 'true', invalid = focused?.getAttribute('aria-invalid');
  const oldScroll = viewport.scrollTop;
  const nextLayout = `${tab}:${mode}:${[...expanded].sort().join(',')}`;
  const rebuild = layout !== nextLayout;
  if (rebuild) {
    layout = nextLayout;
    inputBindings.clear(); swatchBindings.clear(); resetBindings.clear();
    panels.replaceChildren();
    panels.classList.toggle('has-expanded', [...expanded].some(key => key.startsWith(`${mode}:`)));
    if (tab === 'color') families.forEach(f => panels.append(colorPanel(f.id, f.label)));
    else sizeGroups.filter(g => g.id !== 'padding').forEach(g => panels.append(sizePanel(g.id, g.label, g.base)));
  }
  for (const [i, action] of inputBindings) {
    i.disabled = !hostReady || closeRequested;
    const value = String(actionValue(action));
    if (i.dataset.editing !== 'true' && i.value !== value) {
      const previous = i.value, start = i.selectionStart, end = i.selectionEnd;
      i.value = value;
      if (document.activeElement === i) {
        const atEnd = start === previous.length && end === previous.length;
        const all = start === 0 && end === previous.length;
        i.setSelectionRange(atEnd ? value.length : start, atEnd || all ? value.length : end);
      }
    }
    if (i.hasAttribute('aria-valuenow') && i.getAttribute('aria-valuenow') !== value) i.setAttribute('aria-valuenow', value);
  }
  for (const [b, action] of swatchBindings) {
    b.disabled = !hostReady || closeRequested;
    const span = b.firstElementChild;
    const value = String(actionValue(action));
    if (span instanceof HTMLElement && b.dataset.color !== value) { span.style.background = value; b.dataset.color = value; }
  }
  for (const [b, id] of resetBindings) {
    b.disabled = !hostReady || closeRequested;
    b.hidden = id === 'icon' ? snapshot.settings.sizes.iconOverride === null : !currentToken(id).modified;
  }
  element<HTMLElement>('.mode-wrap').hidden = tab !== 'color';
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => { b.classList.toggle('active', b.dataset.mode === mode); b.setAttribute('aria-selected', String(b.dataset.mode === mode)); });
  const generate = element<HTMLButtonElement>('.generate');
  generate.disabled = !hostReady || busy || closeRequested || snapshot.complete || pendingActions.size > 0;
  element<HTMLButtonElement>('.cancel').disabled = closeRequested;
  generate.title = !hostReady ? initializationError ?? '正在读取 Figma 变量；初始化成功后可操作' : snapshot.complete ? '全部变量已生成，修改会实时同步' : `生成全部变量（当前已有 ${snapshot.existing}/${snapshot.total}）`;
  viewport.scrollTop = oldScroll;
  if (rebuild && focusLabel) {
    const next = [...panels.querySelectorAll<HTMLInputElement>('input')].find(i => i.getAttribute('aria-label') === focusLabel);
    if (next && editing && draftValue !== undefined) {
      next.value = draftValue; next.dataset.editing = 'true';
      if (invalid) next.setAttribute('aria-invalid', invalid);
    }
    next?.focus({ preventScroll: true });
    if (next && selection) {
      const atEnd = selection[0] === draftValue?.length && selection[1] === draftValue?.length;
      const selectedAll = selection[0] === 0 && selection[1] === draftValue?.length;
      next.setSelectionRange(atEnd ? next.value.length : selection[0], atEnd || selectedAll ? next.value.length : selection[1]);
    }
  }
}
function resize(): void {
  const open = [...expanded].some(k => k.startsWith(tab === 'color' ? `${mode}:` : 'size:'));
  send({ type: 'resize', height: open ? 764 : tab === 'color' ? 580 : 626 });
}
function closePicker(): void {
  const focused = document.activeElement;
  if (focused instanceof HTMLInputElement && channelBox.contains(focused) && focused.dataset.editing === 'true') {
    focused.dispatchEvent(new Event('change'));
  }
  finishSquareDrag();
  if (pickerTimer) { clearTimeout(pickerTimer); commitPicker(); }
  picker.hidden = true; pickerTarget = null;
}
function pickerGroup(): string {
  if (pickerTarget?.type === 'color-seed') return pickerTarget.family;
  if (pickerTarget?.type === 'token') return currentToken(pickerTarget.id).group;
  throw new Error('颜色选择器没有绑定颜色变量。');
}
function setPickerHsv(value: typeof pickerHsv): void {
  pickerHsv = value;
  pickerHsl = hexToHsl(hsvToHex(value));
}
function openPicker(value: string, action: Action, anchor: HTMLElement): void {
  if (!picker.hidden && JSON.stringify(pickerTarget) === JSON.stringify(action)) { closePicker(); return; }
  if (!picker.hidden) closePicker();
  pickerTarget = action;
  setPickerHsv(hexToHsv(value.slice(0, 7))); pickerAlpha = channels(value)[3];
  const group = pickerGroup();
  format.value = pickerFormats.get(group) ?? (group === 'gray' ? 'HSL' : 'HSB');
  for (const i of pickerInputBindings.keys()) {
    i.dataset.editing = 'false'; i.setAttribute('aria-invalid', 'false');
  }
  picker.hidden = false;
  const bounds = anchor.getBoundingClientRect(), height = picker.offsetHeight;
  const viewHeight = preview ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--window-height')) || window.innerHeight : window.innerHeight;
  picker.style.left = `${Math.max(8, Math.min(window.innerWidth - 264, bounds.right - 256))}px`;
  picker.style.top = `${Math.max(8, Math.min(viewHeight - height - 8, bounds.bottom + 8))}px`;
  updatePicker();
}
function pickerColor(): string {
  const color = hsvToHex(pickerHsv);
  const [r, g, b] = channels(color);
  return fromChannels(r, g, b, pickerAlpha);
}
function pickerValues(): number[] {
  if (format.value === 'HSB') return [pickerHsv.h, pickerHsv.s, pickerHsv.v];
  if (format.value === 'HSL') return [pickerHsl.h, pickerHsl.s, pickerHsl.l];
  return channels(pickerColor()).slice(0, 3);
}
function pickerInput(label: string, read: () => string, write: (value: string) => void, maximum?: number): HTMLInputElement {
  const i = document.createElement('input');
  i.setAttribute('aria-label', label);
  i.onfocus = () => i.select();
  pickerInputBindings.set(i, read);
  if (maximum !== undefined) {
    i.inputMode = 'decimal'; i.setAttribute('role', 'spinbutton');
    i.setAttribute('aria-valuemin', '0'); i.setAttribute('aria-valuemax', String(maximum));
  }
  const commit = () => {
    if (i.readOnly) return;
    try {
      if (maximum !== undefined && (!i.value.trim() || !Number.isFinite(Number(i.value)) || Number(i.value) < 0 || Number(i.value) > maximum)) {
        throw new Error(`请输入 0–${maximum} 之间的数值。`);
      }
      i.dataset.editing = 'false'; i.setAttribute('aria-invalid', 'false');
      write(i.value);
    } catch (error) {
      i.dataset.editing = 'false'; i.setAttribute('aria-invalid', 'true');
      showNotice(error instanceof Error ? error.message : String(error), true);
      updatePicker();
    }
  };
  i.oninput = () => { i.dataset.editing = 'true'; };
  i.onchange = commit;
  i.onblur = () => { if (i.dataset.editing === 'true') commit(); };
  i.onkeydown = event => {
    if (i.readOnly) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    else if (event.key === 'Escape') {
      i.dataset.editing = 'false'; i.setAttribute('aria-invalid', 'false'); i.value = read();
    } else if (maximum !== undefined && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      if (!i.value.trim() || !Number.isFinite(Number(i.value))) { commit(); return; }
      const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
      i.value = String(Math.max(0, Math.min(maximum, Number(i.value) + step)));
      commit();
    }
  };
  return i;
}
function updatePicker(): void {
  square.style.setProperty('--hue', hsvToHex({ h: pickerHsv.h, s: 100, v: 100 }));
  const handle = element<HTMLElement>('.square-handle');
  handle.style.left = `${pickerHsv.s}%`; handle.style.top = `${100 - pickerHsv.v}%`;
  square.setAttribute('aria-valuetext', `饱和度 ${Math.round(pickerHsv.s)}%，亮度 ${Math.round(pickerHsv.v)}%`);
  hue.value = String(pickerHsv.h); alpha.value = String(pickerAlpha * 100);
  alpha.disabled = pickerTarget?.type === 'color-seed' || (pickerTarget?.type === 'token' && currentToken(pickerTarget.id).base);
  alpha.title = alpha.disabled ? '基准色透明度固定为 100%' : '';
  picker.style.setProperty('--picker-color', hsvToHex(pickerHsv));
  if (pickerLayout !== format.value) {
    pickerLayout = format.value;
    pickerInputBindings.clear(); channelBox.replaceChildren();
    if (format.value === 'HEX') {
      const i = pickerInput('HEX', () => pickerColor().slice(1, 7), value => {
        setPickerHsv(hexToHsv(normalizeColor(value).slice(0, 7))); commitPicker();
      });
      i.className = 'hex-field'; channelBox.append(i);
    } else {
      const labels = format.value === 'HSB' ? ['H', 'S', 'B'] : format.value === 'HSL' ? ['H', 'S', 'L'] : ['R', 'G', 'B'];
      labels.forEach((label, index) => {
        const maximum = format.value === 'RGB' ? 255 : index === 0 ? 360 : 100;
        channelBox.append(pickerInput(label, () => String(Math.round(pickerValues()[index])), value => {
          const n = Number(value);
          if (format.value === 'HSB') {
            const component = (['h', 's', 'v'] as const)[index];
            setPickerHsv({ ...pickerHsv, [component]: n });
          } else if (format.value === 'HSL') {
            const component = (['h', 's', 'l'] as const)[index];
            pickerHsl = { ...pickerHsl, [component]: n };
            pickerHsv = { ...hexToHsv(hslToHex(pickerHsl)), h: pickerHsl.h };
          } else {
            const values = channels(pickerColor()); values[index] = n;
            setPickerHsv(hexToHsv(fromChannels(values[0], values[1], values[2])));
          }
          commitPicker();
        }, maximum));
      });
    }
    const opacity = document.createElement('div'); opacity.className = 'opacity-field';
    const i = pickerInput('不透明度', () => String(Math.round(pickerAlpha * 100)), value => {
      pickerAlpha = Number(value) / 100; commitPicker();
    }, 100);
    const percent = document.createElement('span'); percent.textContent = '%'; opacity.append(i, percent); channelBox.append(opacity);
  }
  for (const [i, read] of pickerInputBindings) {
    i.readOnly = i.getAttribute('aria-label') === '不透明度' && alpha.disabled;
    if (i.dataset.editing !== 'true') i.value = read();
    if (i.hasAttribute('aria-valuemax')) i.setAttribute('aria-valuenow', read());
  }
}
function commitPicker(): void {
  clearTimeout(pickerTimer); pickerTimer = undefined;
  if (!pickerTarget) return;
  const value = pickerColor();
  if (pickerTarget.type === 'color-seed' || pickerTarget.type === 'token') dispatch({ ...pickerTarget, value });
  updatePicker();
}
function schedulePickerCommit(): void {
  if (!pickerTimer) pickerTimer = setTimeout(commitPicker, 40);
}
function moveSquarePointer(event: PointerEvent): void {
  const r = square.getBoundingClientRect();
  setPickerHsv({
    ...pickerHsv,
    s: Math.max(0, Math.min(100, (event.clientX - r.left) / r.width * 100)),
    v: Math.max(0, Math.min(100, (1 - (event.clientY - r.top) / r.height) * 100)),
  });
  updatePicker(); schedulePickerCommit();
}
function finishSquareDrag(): void {
  const id = activeSquarePointer;
  activeSquarePointer = null;
  if (id === null) return;
  if (square.hasPointerCapture(id)) square.releasePointerCapture(id);
  commitPicker();
}
square.addEventListener('pointerdown', event => {
  if (picker.hidden || !pickerTarget || event.button !== 0 || !event.isPrimary || activeSquarePointer !== null) return;
  event.preventDefault(); square.focus({ preventScroll: true });
  activeSquarePointer = event.pointerId;
  square.setPointerCapture(event.pointerId);
  moveSquarePointer(event);
});
square.addEventListener('pointermove', event => {
  if (event.pointerId !== activeSquarePointer) return;
  if (event.pointerType === 'mouse' && !(event.buttons & 1)) { finishSquareDrag(); return; }
  moveSquarePointer(event);
});
window.addEventListener('pointerup', event => {
  if (event.pointerId !== activeSquarePointer) return;
  moveSquarePointer(event); finishSquareDrag();
}, true);
window.addEventListener('pointercancel', event => { if (event.pointerId === activeSquarePointer) finishSquareDrag(); }, true);
square.addEventListener('lostpointercapture', event => { if (event.pointerId === activeSquarePointer) finishSquareDrag(); });
window.addEventListener('blur', finishSquareDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) finishSquareDrag(); });
square.addEventListener('keydown', event => {
  const step = event.shiftKey ? 10 : 1;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setPickerHsv({ ...pickerHsv, s: Math.max(0, Math.min(100, pickerHsv.s + (event.key === 'ArrowRight' ? step : -step))) });
  else setPickerHsv({ ...pickerHsv, v: Math.max(0, Math.min(100, pickerHsv.v + (event.key === 'ArrowUp' ? step : -step))) });
  commitPicker();
});
hue.oninput = () => { setPickerHsv({ ...pickerHsv, h: Number(hue.value) }); updatePicker(); schedulePickerCommit(); };
hue.onchange = commitPicker;
alpha.oninput = () => { pickerAlpha = Number(alpha.value) / 100; updatePicker(); schedulePickerCommit(); };
alpha.onchange = commitPicker;
format.onchange = () => { if (pickerTarget) pickerFormats.set(pickerGroup(), format.value); updatePicker(); };
interface EyeDropperResult { sRGBHex: string }
interface EyeDropperInstance { open(): Promise<EyeDropperResult> }
interface EyeDropperConstructor { new(): EyeDropperInstance }
element<HTMLButtonElement>('.eyedropper').onclick = async () => {
  const constructor = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  if (!constructor) { showNotice('当前 Figma 环境不支持屏幕取色，请使用色板或输入 HEX。', true); return; }
  try { const result = await new constructor().open(); setPickerHsv(hexToHsv(result.sRGBHex)); commitPicker(); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    showNotice(error instanceof Error ? error.message : String(error), true);
  }
};
document.addEventListener('pointerdown', event => {
  if (event.target instanceof Element && !event.target.closest('.picker') && !event.target.closest('.swatch')) closePicker();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePicker(); });
element<HTMLButtonElement>('.cancel').onclick = () => { closePicker(); send({ type: 'close' }); };
element<HTMLButtonElement>('.generate').onclick = () => {
  if (busy || pendingActions.size) return;
  const invalid = panels.querySelector<HTMLInputElement>('input[aria-invalid="true"]');
  if (invalid) { invalid.focus(); showNotice('请先修正输入值再生成变量。', true); return; }
  busy = true; render(); send({ type: 'generate' });
};
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.onclick = () => {
  tab = b.dataset.tab === 'size' ? 'size' : 'color'; viewport.scrollTop = 0; closePicker(); render(); resize();
});
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => {
  mode = b.dataset.mode === 'dark' ? 'dark' : 'light'; viewport.scrollTop = 0; closePicker(); render(); resize();
});
window.addEventListener('message', event => {
  if (!['snapshot', 'error', 'generated'].includes(event.data?.pluginMessage?.type)) return;
  const message: HostMessage = event.data.pluginMessage;
  clearTimeout(initializationTimer);
  if (message.type === 'snapshot') {
    if (initializationError) notice.hidden = true;
    initializationError = null;
    hostReady = true;
    acknowledge(message);
    recovering = false;
    snapshot = message.snapshot;
    if (pendingActions.size) {
      for (const action of pendingActions.values()) apply(snapshot.settings, action);
      snapshot.tokens = tokens(snapshot.settings);
    }
    busy = false; render();
    if (closeRequested && !pendingActions.size && !inFlightRequests.size) send({ type: 'close' });
    else flushEdits();
  } else if (message.type === 'error') {
    acknowledge(message);
    closeRequested = false;
    if (!hostReady) initializationError = message.message;
    busy = false; render(); showNotice(message.message, true);
    if (!hostReady) clearTimeout(noticeTimer);
    if (message.requestId !== undefined || message.requestIds?.length) {
      recovering = true; send({ type: 'ready' });
    }
  } else showNotice(`已生成全部 ${message.count} 个变量，修改将实时同步。`);
});
if (!preview) {
  initializationTimer = setTimeout(() => {
    initializationError = '未能在 5 秒内收到 Figma 的初始化结果，请关闭并重新运行插件；若仍有此提示，请查看插件控制台错误。';
    render(); showNotice(initializationError, true); clearTimeout(noticeTimer);
  }, 5000);
}
render(); resize(); send({ type: 'ready' });
