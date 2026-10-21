import { generatePalette, normalizeHex } from './palette-algorithm.js';

export type Mode = 'light' | 'dark';
export type Family = 'primary' | 'gray' | 'success' | 'error' | 'warning';
export type SizeGroup = 'font-size' | 'icon-size' | 'font-weight' | 'radius' | 'control-height' | 'border' | 'padding';
export type Value = number | string;
export const families: { id: Family; label: string; default: string }[] = [
  { id: 'primary', label: '品牌色', default: '#FF6000' },
  { id: 'gray', label: '中性色', default: '#0F131A' },
  { id: 'success', label: '成功色', default: '#00B23C' },
  { id: 'error', label: '错误色', default: '#ED182A' },
  { id: 'warning', label: '警告色', default: '#E68200' },
];
export const sizeGroups: { id: SizeGroup; label: string; base: string }[] = [
  { id: 'font-size', label: '字号基准值', base: 'font-size-md' },
  { id: 'icon-size', label: '图标尺寸基准值', base: 'icon-size-md' },
  { id: 'font-weight', label: '字重基准值', base: 'font-weight-regular' },
  { id: 'radius', label: '圆角基准值', base: 'radius-md' },
  { id: 'control-height', label: '组件尺寸基准值', base: 'control-height-md' },
  { id: 'border', label: '描边粗细', base: 'border-width' },
  { id: 'padding', label: '间距', base: 'size-unit / size-step' },
];
export interface Settings {
  version: 1;
  colors: Record<Mode, Record<Family, string>>;
  sizes: {
    fontSize: number;
    fontWeight: number;
    radius: number;
    controlHeight: number;
    border: number;
    sizeUnit: number;
    sizeStep: number;
    iconOverride: number | null;
  };
  overrides: Record<string, Value>;
}
export interface Token {
  id: string;
  collection: string;
  name: string;
  label: string;
  group: Family | SizeGroup | 'seed';
  mode?: Mode;
  value: Value;
  generated: Value;
  base: boolean;
  modified: boolean;
}
export type Action =
  | { type: 'color-seed'; mode: Mode; family: Family; value: string }
  | { type: 'size-seed'; group: SizeGroup | 'size-unit' | 'size-step'; value: number }
  | { type: 'token'; id: string; value: Value }
  | { type: 'reset'; id: string }
  | { type: 'reset-icon' };
export interface Snapshot {
  settings: Settings;
  tokens: Token[];
  existing: number;
  total: number;
  complete: boolean;
}
export type UIMessage =
  | { type: 'ready' | 'generate' | 'close' }
  | { type: 'resize'; height: number }
  | { type: 'action'; action: Action; requestId: number }
  | { type: 'actions'; requests: { action: Action; requestId: number }[] };
export type HostMessage =
  | { type: 'snapshot'; snapshot: Snapshot; requestId?: number; requestIds?: number[] }
  | { type: 'error'; message: string; requestId?: number; requestIds?: number[] }
  | { type: 'generated'; count: number };

export function defaults(): Settings {
  const colors = () => Object.fromEntries(families.map(f => [f.id, f.default])) as Record<Family, string>;
  return {
    version: 1, colors: { light: colors(), dark: colors() },
    sizes: { fontSize: 14, fontWeight: 400, radius: 8, controlHeight: 32, border: 1, sizeUnit: 4, sizeStep: 4, iconOverride: null },
    overrides: {},
  };
}
export function cloneSettings(settings: Settings): Settings {
  return {
    ...settings,
    colors: { light: { ...settings.colors.light }, dark: { ...settings.colors.dark } },
    sizes: { ...settings.sizes }, overrides: { ...settings.overrides },
  };
}

export function normalizeColor(input: string): string {
  const result = normalizeHex(input);
  if (result) return result;
  const raw = input.trim().replace(/^#/, '');
  if (/^[\da-f]{8}$/i.test(raw)) {
    return `#${raw.slice(0, 6).toUpperCase()}${raw.slice(6).toUpperCase() === 'FF' ? '' : raw.slice(6).toUpperCase()}`;
  }
  throw new Error('请输入有效的 HEX 色值，例如 #FF6000 或 FF6000。');
}
export function channels(hex: string): [number, number, number, number] {
  const color = normalizeColor(hex);
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1];
}
export function fromChannels(r: number, g: number, b: number, alpha = 1): string {
  const hex = [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  return normalizeColor(`#${hex}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`);
}
export function equal(a: Value | undefined, b: Value | undefined): boolean {
  return a === b;
}
export function canonicalVariableName(name: string): string {
  return name.replace(/^(light|dark)\//i, mode => mode.toLowerCase());
}
export function tokenId(collection: string, name: string): string {
  return `${collection}:${canonicalVariableName(name)}`;
}
const paletteCache = new Map<string, { seed: string; neutral: string; palette: ReturnType<typeof generatePalette> }>();
export function tokens(settings: Settings, ignoreOverrides = false): Token[] {
  const result: Token[] = [];
  const add = (collection: string, name: string, group: Token['group'], generated: Value, base = false, mode?: Mode) => {
    const id = tokenId(collection, name);
    const override = ignoreOverrides ? undefined : settings.overrides[id];
    const value = override ?? generated;
    result.push({ id, collection, name, label: name.replace(/^(light|dark)\//, '').replace(/\//g, '-'), group, mode, generated, value, base, modified: !equal(value, generated) });
  };
  for (const mode of ['light', 'dark'] as const) {
    for (const family of families) {
      const key = `${mode}:${family.id}`, seed = settings.colors[mode][family.id];
      const neutral = mode === 'dark' && family.id !== 'gray' ? settings.colors[mode].gray : '';
      let cached = paletteCache.get(key);
      if (!cached || cached.seed !== seed || cached.neutral !== neutral) {
        cached = { seed, neutral, palette: generatePalette(family.id === 'gray' ? 'neutral' : 'brand', mode, seed, settings.colors[mode].gray) };
        paletteCache.set(key, cached);
      }
      const palette = cached.palette;
      for (const color of palette) {
        add('梯度色板', `${mode}/color-${family.id}/${color.index}`, family.id, color.hex,
          family.id === 'gray' ? color.index === 13 : mode === 'light' && color.index === 9, mode);
      }
    }
  }
  const s = settings.sizes;
  for (const [label, offset] of Object.entries({ '5xl': 18, '4xl': 14, '3xl': 10, '2xl': 6, xl: 4, lg: 2, md: 0, sm: -2, xs: -4 })) {
    add('文字', `font-size/${label}`, 'font-size', s.fontSize + offset, label === 'md');
  }
  for (const [label, offset] of Object.entries({ '2xl': 12, xl: 6, lg: 4, md: 4, sm: 2, xs: 0 })) {
    add('尺寸', `icon-size/${label}`, 'icon-size', s.fontSize + offset + (s.iconOverride === null ? 0 : s.iconOverride - s.fontSize - 4), label === 'md');
  }
  for (const [label, offset] of Object.entries({ bold: 200, semibold: 100, medium: 50, regular: 0, light: -50 })) {
    add('文字', `font-weight/${label}`, 'font-weight', s.fontWeight + offset, label === 'regular');
  }
  add('radius', 'infinite', 'radius', 999);
  for (const [label, offset] of Object.entries({ '4xl': 10, '3xl': 8, '2xl': 6, xl: 4, lg: 2, md: 0, sm: -2, xs: -4 })) {
    add('radius', label, 'radius', s.radius + offset, label === 'md');
  }
  for (const [label, offset] of Object.entries({ '2xl': 16, xl: 8, lg: 4, md: 0, sm: -4, xs: -8 })) {
    add('尺寸', `control-height/${label}`, 'control-height', s.controlHeight + offset, label === 'md');
  }
  add('尺寸', 'border/width', 'border', s.border, true);
  add('尺寸', 'size-unit', 'seed', s.sizeUnit, true);
  add('尺寸', 'size-step', 'seed', s.sizeStep, true);
  for (const [label, n] of Object.entries({ '2xl': 6, xl: 5, lg: 4, md: 3, sm: 2, xs: 1, '2xs': 0 })) {
    add('尺寸', `padding/${label}`, 'padding', s.sizeUnit + s.sizeStep * n);
  }
  add('尺寸', 'padding/3xs', 'padding', Math.max(0, s.sizeUnit - 2));
  return result;
}

export function validateNumber(group: string, value: number, base = true): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error('请输入有限的整数。');
  if (base && group === 'font-size' && (value < 12 || value > 24 || value % 2)) throw new Error('字号基准值必须为 12–24 之间的偶数。');
  if (base && group === 'font-weight' && (value < 300 || value > 600)) throw new Error('字重基准值必须为 300–600 之间的整数。');
  if (base && group === 'radius' && (value < 0 || value > 99)) throw new Error('圆角基准值必须为 0–99 之间的整数。');
  if ((group === 'control-height' || group === 'icon-size') && base && value <= 0) throw new Error('尺寸基准值必须为正整数。');
  if (['border', 'size-unit', 'size-step', 'padding'].includes(group) && value < 0) throw new Error('描边、基础单位、步长和间距不能为负数。');
}
const sizeKeys = {
  'font-size': 'fontSize', 'font-weight': 'fontWeight', radius: 'radius', 'control-height': 'controlHeight',
  border: 'border', 'size-unit': 'sizeUnit', 'size-step': 'sizeStep', 'icon-size': 'iconOverride',
} as const;
export function apply(settings: Settings, action: Action): void {
  if (action.type === 'color-seed') {
    if (!['light', 'dark'].includes(action.mode) || !families.some(f => f.id === action.family)) throw new Error('无效的颜色分组。');
    const color = normalizeColor(action.value);
    if (color.length === 9) throw new Error('颜色基准值不支持透明度，请设为 100%。');
    settings.colors[action.mode][action.family] = color;
  } else if (action.type === 'size-seed') {
    if (action.group !== 'padding' && !(action.group in sizeKeys)) throw new Error('无效的尺寸分组。');
    validateNumber(action.group, action.value);
    if (action.group === 'padding') throw new Error('请分别设置 size-unit 和 size-step。');
    settings.sizes[sizeKeys[action.group]] = action.value;
  } else if (action.type === 'reset-icon') {
    settings.sizes.iconOverride = null;
  } else {
    const token = tokens(settings).find(t => t.id === action.id);
    if (!token) throw new Error('未找到对应变量。');
    if (action.type === 'reset') {
      if (token.base) throw new Error('基准值不能重置。');
      delete settings.overrides[token.id];
    } else if (token.base) {
      if (token.mode) {
        if (typeof action.value !== 'string') throw new Error('颜色值类型错误。');
        apply(settings, { type: 'color-seed', mode: token.mode, family: token.group as Family, value: action.value });
      } else {
        if (typeof action.value !== 'number') throw new Error('尺寸值类型错误。');
        apply(settings, { type: 'size-seed', group: token.group === 'seed' ? token.name as 'size-unit' | 'size-step' : token.group as SizeGroup, value: action.value });
      }
    } else {
      if (typeof token.generated === 'string') {
        if (typeof action.value !== 'string') throw new Error('颜色值类型错误。');
        settings.overrides[token.id] = normalizeColor(action.value);
      } else {
        if (typeof action.value !== 'number') throw new Error('尺寸值类型错误。');
        validateNumber(token.group, action.value, false);
        if (token.name === 'infinite' && action.value !== 999) throw new Error('radius-infinite 固定为 999。');
        settings.overrides[token.id] = action.value;
      }
      if (equal(settings.overrides[token.id], token.generated)) delete settings.overrides[token.id];
    }
  }
}

export function darkSeed(color: string, neutral: string): string {
  const front = channels(color), back = channels(neutral);
  return fromChannels((front[0] - back[0] * 0.15) / 0.85, (front[1] - back[1] * 0.15) / 0.85, (front[2] - back[2] * 0.15) / 0.85);
}
export function hydrate(settings: Settings, actual: Map<string, Value>, previous?: Map<string, Value>): void {
  const changed = (id: string) => actual.has(id) && (!previous || !equal(actual.get(id), previous.get(id)));
  const before = tokens(settings);
  for (const t of before.filter(t => t.base && changed(t.id))) {
    const value = actual.get(t.id)!;
    apply(settings, { type: 'token', id: t.id, value });
  }
  const expected = tokens(settings, true);
  for (const family of families.filter(f => f.id !== 'gray')) {
    const token = expected.find(t => t.mode === 'dark' && t.group === family.id && t.name.endsWith('/9'))!;
    if (changed(token.id) && typeof actual.get(token.id) === 'string' && !equal(actual.get(token.id), token.generated)) {
      settings.colors.dark[family.id] = darkSeed(String(actual.get(token.id)), settings.colors.dark.gray);
    }
  }
  for (const t of tokens(settings, true)) {
    if (!t.base && changed(t.id)) {
      const value = actual.get(t.id)!;
      if (typeof value !== typeof t.generated) throw new Error(`${t.name} 的变量类型不正确。`);
      if (typeof value === 'number') {
        validateNumber(t.group, value, false);
        if (t.name === 'infinite' && value !== 999) throw new Error('已有 radius-infinite 必须为 999，请在 Figma 中修正。');
      }
      if (equal(value, t.generated)) delete settings.overrides[t.id];
      else settings.overrides[t.id] = value;
    }
  }
  if (!previous && settings.sizes.iconOverride === settings.sizes.fontSize + 4) settings.sizes.iconOverride = null;
}
export function readSettings(raw: string): Settings {
  if (!raw) return defaults();
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || parsed.version !== 1) throw new Error('已保存的配置格式无效。');
  const result = parsed as Settings;
  for (const mode of ['light', 'dark'] as const) {
    for (const f of families) apply(result, { type: 'color-seed', mode, family: f.id, value: result.colors[mode][f.id] });
  }
  for (const [group, key] of Object.entries(sizeKeys)) {
    if (key === 'iconOverride' && result.sizes.iconOverride === null) continue;
    const value = result.sizes[key];
    if (typeof value !== 'number') throw new Error('已保存的尺寸值无效。');
    validateNumber(group, value);
  }
  if (typeof result.overrides !== 'object' || result.overrides === null) throw new Error('已保存的覆盖值无效。');
  const savedOverrides = Object.entries(result.overrides);
  result.overrides = {};
  for (const [id, value] of savedOverrides) {
    const canonicalId = id.replace(/^(梯度色板:)(light|dark)\//i, (_, collection: string, mode: string) => `${collection}${mode.toLowerCase()}/`);
    if (canonicalId in result.overrides && !equal(result.overrides[canonicalId], value)) throw new Error('已保存的 Light/Dark 覆盖值存在大小写重名冲突。');
    result.overrides[canonicalId] = value;
  }
  for (const [id, value] of Object.entries(result.overrides)) apply(result, { type: 'token', id, value });
  return result;
}
