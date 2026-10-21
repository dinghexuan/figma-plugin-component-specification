import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { apply, channels, cloneSettings, defaults, fromChannels, hydrate, normalizeColor, readSettings, tokens } from '../src/model.ts';
import { generatePalette } from '../src/palette-algorithm.js';
import { Synchronizer } from '../src/sync.ts';

function mockFigma(pluginId = '1691799069719255223') {
  let id = 0, writes = 0, storage = '';
  const collections = [], variables = [];
  const api = {
    pluginId,
    root: {
      getPluginData: () => {
        if (!api.pluginId) throw new Error('Cannot get private plugin data in a plugin without an ID.');
        return storage;
      },
      setPluginData: (_, value) => {
        if (!api.pluginId) throw new Error('Cannot set private plugin data in a plugin without an ID.');
        storage = value;
      },
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => variables,
      getVariableByIdAsync: async id => variables.find(v => v.id === id) ?? null,
      getVariableCollectionByIdAsync: async id => collections.find(c => c.id === id) ?? null,
      createVariableCollection(name) {
        const c = { id: `c${++id}`, name, defaultModeId: `m${id}`, modes: [{ modeId: `m${id}`, name: 'Mode 1' }] };
        collections.push(c); return c;
      },
      createVariable(name, c, type) {
        const v = {
          id: `v${++id}`, name, variableCollectionId: c.id, resolvedType: type, valuesByMode: {},
          setValueForMode(modeId, value) { this.valuesByMode[modeId] = value; writes++; },
        };
        variables.push(v); return v;
      },
    },
  };
  return { api, collections, variables, writes: () => writes, storage: () => storage };
}
const find = (s, name, collection = '尺寸') => tokens(s).find(t => t.collection === collection && t.name === name);
function manualDocument() {
  const mock = mockFigma();
  const c = mock.api.variables.createVariableCollection('梯度色板');
  for (const t of tokens(defaults()).filter(t => t.mode)) {
    const name = t.name.replace(/^(Light|Dark)/, mode => mode.toLowerCase());
    const v = mock.api.variables.createVariable(name, c, 'COLOR');
    const [r, g, b, a] = channels(t.value);
    v.setValueForMode(c.defaultModeId, { r: r / 255, g: g / 255, b: b / 255, a });
  }
  const extras = [['colorful-gray', '#8899AA'], ['color-teal', '#008888']];
  for (const [group, hex] of extras) {
    const v = mock.api.variables.createVariable(`light/${group}/1`, c, 'COLOR');
    const [r, g, b] = channels(hex);
    v.setValueForMode(c.defaultModeId, { r: r / 255, g: g / 255, b: b / 255, a: 1 });
  }
  for (const collection of ['文字', '尺寸', 'radius']) {
    const c = mock.api.variables.createVariableCollection(collection);
    for (const t of tokens(defaults()).filter(t => t.collection === collection && t.group !== 'seed' && t.name !== 'font-weight/bold')) {
      mock.api.variables.createVariable(t.name, c, 'FLOAT').setValueForMode(c.defaultModeId, t.value);
    }
  }
  const variable = name => mock.variables.find(v => v.name === name);
  const set = (name, value) => {
    const v = variable(name), c = mock.collections.find(c => c.id === v.variableCollectionId);
    v.setValueForMode(c.defaultModeId, value);
  };
  set('font-size/4xl', 30); set('font-size/xs', 11);
  set('font-weight/semibold', 550); set('icon-size/2xl', 24); set('4xl', 20);
  const gray = ['FFFFFF', 'F5F7FA', 'EEF1F6', 'E5E9F0', 'D3D9E3', 'B0B9C9', '8A95A8', '59667D', '445064', '2F3747', '27303F', '1F2633', '0F131A'];
  gray.forEach((hex, index) => {
    const [r, g, b, a] = channels(`#${hex}`);
    set(`light/color-gray/${index + 1}`, { r: r / 255, g: g / 255, b: b / 255, a });
  });
  return { ...mock, variable, set };
}

test('generates exactly 176 unique tokens, 130 colors, with required collection/group names', () => {
  const all = tokens(defaults());
  assert.equal(all.length, 176);
  assert.equal(new Set(all.map(t => t.id)).size, 176);
  assert.equal(all.filter(t => t.mode).length, 130);
  assert.deepEqual([...new Set(all.map(t => t.collection))], ['梯度色板', '文字', '尺寸', 'radius']);
  for (const mode of ['light', 'dark']) for (const family of ['primary', 'gray', 'success', 'error', 'warning']) {
    assert.equal(all.filter(t => t.name.startsWith(`${mode}/color-${family}/`)).length, 13);
  }
});
test('supplied color algorithm is used without substitute approximations for both modes and all families', () => {
  const s = defaults();
  for (const mode of ['light', 'dark']) for (const family of ['primary', 'gray', 'success', 'error', 'warning']) {
    const expected = generatePalette(family === 'gray' ? 'neutral' : 'brand', mode, s.colors[mode][family], s.colors[mode].gray);
    assert.deepEqual(tokens(s).filter(t => t.mode === mode && t.group === family).map(t => t.value), expected.map(c => c.hex));
  }
});
test('exact typography, icon (+6 xl), weight, radius, control, border and padding outputs', () => {
  const s = defaults();
  assert.deepEqual(tokens(s).filter(t => t.group === 'font-size').map(t => t.value), [32, 28, 24, 20, 18, 16, 14, 12, 10]);
  assert.deepEqual(tokens(s).filter(t => t.group === 'icon-size').map(t => t.value), [26, 20, 18, 18, 16, 14]);
  assert.deepEqual(tokens(s).filter(t => t.group === 'font-weight').map(t => t.value), [600, 500, 450, 400, 350]);
  assert.deepEqual(tokens(s).filter(t => t.group === 'radius').map(t => t.value), [999, 18, 16, 14, 12, 10, 8, 6, 4]);
  assert.deepEqual(tokens(s).filter(t => t.group === 'control-height').map(t => t.value), [48, 40, 36, 32, 28, 24]);
  assert.deepEqual(tokens(s).filter(t => t.group === 'padding').map(t => t.value), [28, 24, 20, 16, 12, 8, 4, 2]);
  assert.equal(find(s, 'border/width').value, 1);
});
test('font constraints accept only even integers from 12 through 24', () => {
  for (const value of [12, 14, 16, 18, 20, 22, 24]) assert.doesNotThrow(() => apply(defaults(), { type: 'size-seed', group: 'font-size', value }));
  for (const value of [0, 11, 13, 23, 25, 14.5, NaN, Infinity]) assert.throws(() => apply(defaults(), { type: 'size-seed', group: 'font-size', value }));
});
test('weight and radius bounds are exact; radius is not silently clamped', () => {
  for (const value of [300, 400, 600]) assert.doesNotThrow(() => apply(defaults(), { type: 'size-seed', group: 'font-weight', value }));
  for (const value of [299, 601, 400.1]) assert.throws(() => apply(defaults(), { type: 'size-seed', group: 'font-weight', value }));
  const s = defaults(); apply(s, { type: 'size-seed', group: 'radius', value: 0 });
  assert.equal(find(s, 'xs', 'radius').value, -4);
  assert.equal(find(s, 'infinite', 'radius').value, 999);
  apply(s, { type: 'size-seed', group: 'radius', value: 99 });
  assert.equal(find(s, '4xl', 'radius').value, 109);
  assert.throws(() => apply(s, { type: 'size-seed', group: 'radius', value: 100 }));
});
test('HEX accepts hash/no hash, lowercase, shorthand, alpha and rejects invalid strings', () => {
  assert.equal(normalizeColor('ff6000'), '#FF6000');
  assert.equal(normalizeColor(' #abc '), '#AABBCC');
  assert.equal(normalizeColor('FF600080'), '#FF600080');
  assert.equal(normalizeColor('#FF6000FF'), '#FF6000');
  for (const input of ['', '#xyz', '#12345', 'orange']) assert.throws(() => normalizeColor(input));
});
test('Light and Dark seeds and overrides remain independent', () => {
  const s = defaults();
  const dark = tokens(s).filter(t => t.mode === 'dark').map(t => t.value);
  apply(s, { type: 'color-seed', mode: 'light', family: 'primary', value: '#336699' });
  assert.deepEqual(tokens(s).filter(t => t.mode === 'dark').map(t => t.value), dark);
  assert.equal(s.colors.light.primary, '#336699');
  assert.equal(s.colors.dark.primary, '#FF6000');
});
test('dark neutral seed updates all unmodified dark semantic palettes only', () => {
  const s = defaults(), before = tokens(s);
  apply(s, { type: 'color-seed', mode: 'dark', family: 'gray', value: '#202020' });
  for (const family of ['primary', 'success', 'error', 'warning']) {
    assert.notDeepEqual(tokens(s).filter(t => t.mode === 'dark' && t.group === family).map(t => t.value), before.filter(t => t.mode === 'dark' && t.group === family).map(t => t.value));
  }
  assert.deepEqual(tokens(s).filter(t => t.mode === 'light'), before.filter(t => t.mode === 'light'));
});
test('derived overrides survive seed changes and reset uses latest algorithm output', () => {
  const s = defaults(), token = find(s, 'control-height/xl');
  apply(s, { type: 'token', id: token.id, value: 55 });
  apply(s, { type: 'size-seed', group: 'control-height', value: 40 });
  assert.equal(find(s, token.name).value, 55);
  assert.equal(find(s, token.name).modified, true);
  apply(s, { type: 'reset', id: token.id });
  assert.equal(find(s, token.name).value, 48);
  assert.equal(find(s, token.name).modified, false);
});
test('icon follows font +4, optional base override shifts the whole scale and resets to linkage', () => {
  const s = defaults();
  apply(s, { type: 'size-seed', group: 'font-size', value: 16 });
  assert.equal(find(s, 'icon-size/md').value, 20);
  apply(s, { type: 'size-seed', group: 'icon-size', value: 24 });
  apply(s, { type: 'size-seed', group: 'font-size', value: 18 });
  assert.deepEqual(tokens(s).filter(t => t.group === 'icon-size').map(t => t.value), [32, 26, 24, 24, 22, 20]);
  apply(s, { type: 'reset-icon' });
  assert.equal(find(s, 'icon-size/md').value, 22);
});
test('padding obeys seed equation and only 3xs clamps to zero', () => {
  const s = defaults();
  apply(s, { type: 'size-seed', group: 'size-unit', value: 1 });
  apply(s, { type: 'size-seed', group: 'size-step', value: 3 });
  assert.deepEqual(tokens(s).filter(t => t.group === 'padding').map(t => t.value), [19, 16, 13, 10, 7, 4, 1, 0]);
});
test('fixed radius-infinite cannot be manually changed, and baseline cannot be reset', () => {
  assert.throws(() => apply(defaults(), { type: 'token', id: find(defaults(), 'infinite', 'radius').id, value: 100 }));
  assert.throws(() => apply(defaults(), { type: 'reset', id: find(defaults(), 'font-size/md', '文字').id }));
});
test('RGBA channels round-trip including transparent imported tokens', () => {
  assert.deepEqual(channels('#11223300'), [17, 34, 51, 0]);
  assert.equal(fromChannels(17, 34, 51, 0.5), '#11223380');
});
test('hydration imports existing base values and only real manual overrides', () => {
  const s = defaults(), imported = defaults();
  apply(imported, { type: 'size-seed', group: 'font-size', value: 16 });
  apply(imported, { type: 'token', id: find(imported, 'font-size/xl', '文字').id, value: 25 });
  hydrate(s, new Map(tokens(imported).map(t => [t.id, t.value])));
  assert.equal(s.sizes.fontSize, 16); assert.equal(s.sizes.iconOverride, null);
  assert.deepEqual(tokens(s).map(t => t.value), tokens(imported).map(t => t.value));
  assert.equal(Object.keys(s.overrides).length, 1);
});
test('saved settings preserve original dark seed, numeric override and color alpha', () => {
  const s = defaults();
  apply(s, { type: 'color-seed', mode: 'dark', family: 'primary', value: '#22AAFF' });
  apply(s, { type: 'token', id: tokens(s).find(t => t.mode === 'dark' && t.group === 'primary').id, value: '#12345680' });
  assert.deepEqual(readSettings(JSON.stringify(s)), s);
  assert.throws(() => readSettings('invalid'));
  assert.throws(() => readSettings('{"version":2}'));
});
test('importing dark variables without metadata infers seed and preserves all exact existing values', () => {
  const imported = defaults(), s = defaults();
  apply(imported, { type: 'color-seed', mode: 'dark', family: 'primary', value: '#22AAFF' });
  const actual = new Map(tokens(imported).map(t => [t.id, t.value]));
  hydrate(s, actual);
  assert.deepEqual(tokens(s).map(t => t.value), tokens(imported).map(t => t.value));
});
test('fresh plugin does not create variables before generate; generate creates everything and is idempotent', async () => {
  const mock = mockFigma(), sync = new Synchronizer(mock.api);
  await sync.initialize(); assert.equal(mock.variables.length, 0); assert.equal(mock.collections.length, 0);
  await sync.act({ type: 'size-seed', group: 'font-size', value: 16 });
  assert.equal(mock.variables.length, 0);
  const snapshot = await sync.generate();
  assert.equal(snapshot.complete, true); assert.equal(mock.variables.length, 176); assert.equal(mock.collections.length, 4);
  const writes = mock.writes();
  await sync.generate(); assert.equal(mock.writes(), writes); assert.equal(mock.variables.length, 176);
});
test('partial sets are imported, live-updated but only missing variables are created on Generate', async () => {
  const mock = mockFigma();
  const c = mock.api.variables.createVariableCollection('文字');
  const v = mock.api.variables.createVariable('font-size/md', c, 'FLOAT');
  v.setValueForMode(c.defaultModeId, 16);
  const sync = new Synchronizer(mock.api);
  assert.equal((await sync.initialize()).existing, 1);
  await sync.act({ type: 'size-seed', group: 'font-size', value: 18 });
  assert.equal(v.valuesByMode[c.defaultModeId], 18); assert.equal(mock.variables.length, 1);
  await sync.generate(); assert.equal(mock.variables.length, 176);
});
test('UI changes live-write existing variables, retain IDs and produce no feedback-loop writes', async () => {
  const mock = mockFigma(), sync = new Synchronizer(mock.api);
  await sync.initialize(); await sync.generate();
  const ids = mock.variables.map(v => v.id), writes = mock.writes();
  await sync.act({ type: 'size-seed', group: 'font-size', value: 16 });
  assert.equal(mock.writes() - writes, 15);
  assert.deepEqual(mock.variables.map(v => v.id), ids);
  assert.equal(await sync.refresh(), null);
});
test('external base edits regenerate untouched dependents instead of treating them as overrides', async () => {
  const mock = mockFigma(), sync = new Synchronizer(mock.api);
  await sync.initialize(); await sync.generate();
  const v = mock.variables.find(v => v.name === 'font-size/md'), c = mock.collections.find(c => c.id === v.variableCollectionId);
  v.setValueForMode(c.defaultModeId, 18);
  const snapshot = await sync.refresh();
  assert.equal(snapshot.settings.sizes.fontSize, 18);
  assert.equal(snapshot.tokens.find(t => t.name === 'font-size/5xl').value, 36);
  assert.equal(snapshot.tokens.find(t => t.name === 'icon-size/md').value, 22);
  assert.equal(Object.keys(snapshot.settings.overrides).length, 0);
});
test('external manual edits become resettable overrides, including alpha', async () => {
  const mock = mockFigma(), sync = new Synchronizer(mock.api);
  await sync.initialize(); await sync.generate();
  const v = mock.variables.find(v => v.name === 'light/color-primary/1'), c = mock.collections.find(c => c.id === v.variableCollectionId);
  v.setValueForMode(c.defaultModeId, { r: 1, g: 0, b: 0, a: 0.5 });
  const snapshot = await sync.refresh(), token = snapshot.tokens.find(t => t.name === v.name);
  assert.equal(token.value, '#FF000080'); assert.equal(token.modified, true);
  await sync.act({ type: 'reset', id: token.id });
  assert.equal(sync.snapshot().tokens.find(t => t.id === token.id).modified, false);
});
test('reopening hydrates values without writes and preserves separate mode seeds', async () => {
  const mock = mockFigma(), first = new Synchronizer(mock.api);
  await first.initialize(); await first.generate();
  await first.act({ type: 'color-seed', mode: 'dark', family: 'primary', value: '#77AA11' });
  const writes = mock.writes(), second = new Synchronizer(mock.api);
  assert.deepEqual((await second.initialize()).tokens.map(t => t.value), first.snapshot().tokens.map(t => t.value));
  assert.equal(second.settings.colors.dark.primary, '#77AA11'); assert.equal(mock.writes(), writes);
});
test('deleted variables make set incomplete and Generate repairs without duplicating collections', async () => {
  const mock = mockFigma(), sync = new Synchronizer(mock.api);
  await sync.initialize(); await sync.generate(); mock.variables.pop();
  const snapshot = await sync.refresh(); assert.equal(snapshot.complete, false); assert.equal(snapshot.existing, 175);
  await sync.generate(); assert.equal(mock.variables.length, 176); assert.equal(mock.collections.length, 4);
});
test('duplicate collections, type mismatch, invalid imported seeds and aliases fail explicitly', async () => {
  const duplicate = mockFigma(); duplicate.api.variables.createVariableCollection('文字'); duplicate.api.variables.createVariableCollection('文字');
  await assert.rejects(new Synchronizer(duplicate.api).initialize(), /多个/);
  const wrong = mockFigma(), c = wrong.api.variables.createVariableCollection('文字');
  wrong.api.variables.createVariable('font-size/md', c, 'COLOR');
  await assert.rejects(new Synchronizer(wrong.api).initialize(), /类型不匹配/);
  const invalid = mockFigma(), c2 = invalid.api.variables.createVariableCollection('文字');
  invalid.api.variables.createVariable('font-size/md', c2, 'FLOAT').setValueForMode(c2.defaultModeId, 13);
  await assert.rejects(new Synchronizer(invalid.api).initialize(), /偶数/);
  const alias = mockFigma(), c3 = alias.api.variables.createVariableCollection('文字');
  alias.api.variables.createVariable('font-size/md', c3, 'FLOAT').setValueForMode(c3.defaultModeId, { type: 'VARIABLE_ALIAS', id: 'missing' });
  await assert.rejects(new Synchronizer(alias.api).initialize(), /引用无法读取/);
});
test('valid aliases resolve for display and remain aliases until their value needs changing', async () => {
  const mock = mockFigma(), c = mock.api.variables.createVariableCollection('文字');
  const target = mock.api.variables.createVariable('custom-font-size', c, 'FLOAT'); target.setValueForMode(c.defaultModeId, 16);
  const alias = mock.api.variables.createVariable('font-size/md', c, 'FLOAT'); alias.setValueForMode(c.defaultModeId, { type: 'VARIABLE_ALIAS', id: target.id });
  const sync = new Synchronizer(mock.api);
  assert.equal((await sync.initialize()).settings.sizes.fontSize, 16);
  assert.equal(alias.valuesByMode[c.defaultModeId].type, 'VARIABLE_ALIAS');
});
test('failed invalid action does not corrupt settings or write document variables', async () => {
  const mock = mockFigma(), sync = new Synchronizer(mock.api);
  await sync.initialize(); await sync.generate(); const writes = mock.writes(), before = JSON.stringify(sync.settings);
  await assert.rejects(sync.act({ type: 'size-seed', group: 'font-size', value: 15 }));
  assert.equal(JSON.stringify(sync.settings), before); assert.equal(mock.writes(), writes);
});
test('unrelated variables and other modes are never overwritten', async () => {
  const mock = mockFigma(), c = mock.api.variables.createVariableCollection('文字');
  c.modes.push({ modeId: 'other', name: 'Other' });
  const base = mock.api.variables.createVariable('font-size/md', c, 'FLOAT');
  base.setValueForMode(c.defaultModeId, 14); base.setValueForMode('other', 100);
  const custom = mock.api.variables.createVariable('user/size', c, 'FLOAT'); custom.setValueForMode(c.defaultModeId, 99);
  const sync = new Synchronizer(mock.api); await sync.initialize(); await sync.generate();
  await sync.act({ type: 'size-seed', group: 'font-size', value: 16 });
  assert.equal(base.valuesByMode.other, 100); assert.equal(custom.valuesByMode[c.defaultModeId], 99);
});
test('invalid imported derived values and a changed infinite radius fail explicitly before persistence', () => {
  const s = defaults();
  assert.throws(() => hydrate(s, new Map([[find(s, 'icon-size/xl').id, 10.5]])), /整数/);
  assert.throws(() => hydrate(s, new Map([[find(s, 'infinite', 'radius').id, 888]])), /999/);
});
test('built manifest references existing offline artifacts and embeds every original Figma SVG', async () => {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  assert.equal(manifest.name, '主题化配置器');
  assert.equal(manifest.id, '1691799069719255223');
  assert.equal(manifest.documentAccess, 'dynamic-page');
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none']);
  const [main, html] = await Promise.all([readFile(manifest.main, 'utf8'), readFile(manifest.ui, 'utf8')]);
  assert.ok(main.length > 1000); assert.ok(html.length > 1000);
  assert.equal(/https:\/\/www\.figma\.com\/api\/mcp\/asset/.test(html), false);
  for (const name of ['arrow-color', 'arrow-expanded', 'arrow-size', 'eyedropper', 'select-down']) {
    const svg = await readFile(`assets/${name}.svg`);
    assert.ok(svg.length > 0);
    assert.ok(html.includes(`data:image/svg+xml;base64,${svg.toString('base64')}`));
  }
});
test('built plugin host initializes, queues fast edits, generates once, polls external edits and closes cleanly', async () => {
  const mock = mockFigma(), messages = [], notifications = [], handlers = {}, uiSizes = [];
  let poll, intervalDelay, cleared = false, closed = false;
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const api = {
    ...mock.api,
    pluginId: manifest.id,
    ui: { postMessage: m => messages.push(structuredClone(m)), resize: (w, h) => uiSizes.push([w, h]) },
    showUI: (_, options) => uiSizes.push([options.width, options.height]),
    notify: (...args) => notifications.push(args),
    on: (event, callback) => { handlers[event] = callback; },
    closePlugin: () => { closed = true; handlers.close(); },
  };
  const code = await readFile('dist/code.js', 'utf8');
  runInNewContext(code, {
    figma: api, __html__: '<div>test UI</div>', console,
    setInterval: (callback, delay) => { poll = callback; intervalDelay = delay; return 1; },
    clearInterval: () => { cleared = true; },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  api.ui.onmessage({ type: 'ready' }); await flush();
  assert.equal(messages.at(-1).type, 'snapshot'); assert.equal(mock.variables.length, 0);
  assert.equal(messages.filter(m => m.type === 'snapshot').length, 1);
  api.ui.onmessage({ type: 'action', requestId: 1, action: { type: 'size-seed', group: 'font-size', value: 16 } });
  api.ui.onmessage({ type: 'action', requestId: 2, action: { type: 'size-seed', group: 'font-size', value: 18 } });
  api.ui.onmessage({ type: 'generate' }); await flush();
  assert.equal(mock.variables.length, 176);
  assert.deepEqual(messages.filter(m => m.requestId).map(m => m.requestId), [1, 2]);
  assert.equal(messages.filter(m => m.type === 'generated').length, 1);
  assert.equal(messages.findLast(m => m.type === 'snapshot').snapshot.settings.sizes.fontSize, 18);
  assert.equal(intervalDelay, 800);
  const v = mock.variables.find(v => v.name === 'font-size/md'), c = mock.collections.find(c => c.id === v.variableCollectionId);
  v.setValueForMode(c.defaultModeId, 20); poll(); await flush();
  assert.equal(messages.at(-1).snapshot.settings.sizes.fontSize, 20);
  api.ui.onmessage({ type: 'resize', height: 2000 }); assert.deepEqual(uiSizes.at(-1), [400, 764]);
  api.ui.onmessage({ type: 'close' }); assert.equal(closed, true); assert.equal(cleared, true);
  assert.ok(notifications.length > 0);
});
test('manual lowercase light/dark tokens sync before Generate, with IDs and unrelated palettes preserved', async () => {
  const mock = manualDocument(), sync = new Synchronizer(mock.api);
  const before = mock.variables.map(v => v.id), count = mock.variables.length, writes = mock.writes();
  const initial = await sync.initialize();
  assert.equal(initial.existing, 173);
  assert.equal(mock.writes(), writes);
  assert.equal(initial.tokens.find(t => t.label === 'font-size-4xl').value, 30);
  assert.equal(initial.tokens.find(t => t.label === 'font-weight-semibold').value, 550);
  assert.equal(initial.tokens.find(t => t.name === 'light/color-gray/5').value, '#D3D9E3');
  await sync.act({ type: 'color-seed', mode: 'light', family: 'primary', value: '#336699' });
  const c = mock.collections.find(c => c.name === '梯度色板');
  assert.deepEqual(mock.variable('light/color-primary/9').valuesByMode[c.defaultModeId], { r: 0.2, g: 0.4, b: 0.6, a: 1 });
  assert.deepEqual(mock.variables.map(v => v.id), before);
  assert.equal(mock.variables.length, count);
  assert.equal(mock.variable('light/color-teal/1').valuesByMode[c.defaultModeId].r, 0);
  await sync.act({ type: 'size-seed', group: 'font-size', value: 16 });
  const text = mock.collections.find(c => c.name === '文字');
  assert.equal(mock.variable('font-size/md').valuesByMode[text.defaultModeId], 16);
  assert.equal(mock.variable('font-size/4xl').valuesByMode[text.defaultModeId], 30);
  const seed = mock.variable('light/color-gray/13');
  mock.set(seed.name, { r: 0.1, g: 0.1, b: 0.1, a: 1 });
  const refreshed = await sync.refresh();
  assert.equal(refreshed.settings.colors.light.gray, '#1A1A1A');
  assert.equal(mock.variables.length, count);
  await sync.generate();
  assert.equal(mock.variables.length, count + 3);
  assert.equal(mock.variables.some(v => v.name.startsWith('Light/')), false);
});
test('manifest ID gates Figma iframe initialization; real UI edits write manual tokens without Generate', async () => {
  const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
  const dom = new JSDOM('<iframe></iframe>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://www.figma.com/' });
  const frame = dom.window.document.querySelector('iframe').contentWindow;
  const mock = manualDocument(), hostMessages = [], requests = [], errors = [];
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  mock.api.pluginId = '';
  const [html, uiCode, code] = await Promise.all([readFile('dist/ui.html', 'utf8'), readFile('dist/ui.js', 'utf8'), readFile('dist/code.js', 'utf8')]);
  frame.document.open(); frame.document.write(html); frame.document.close();
  frame.structuredClone = structuredClone;
  frame.addEventListener('error', e => errors.push(e.message));
  let poll;
  const api = {
    ...mock.api,
    ui: {
      postMessage: message => {
        hostMessages.push(structuredClone(message));
        frame.dispatchEvent(new frame.MessageEvent('message', { data: { pluginMessage: structuredClone(message) }, source: frame }));
      },
      resize: () => {},
    },
    showUI: () => {}, notify: () => {}, on: () => {}, closePlugin: () => {},
  };
  runInNewContext(code, { figma: api, __html__: html, console, setInterval: callback => { poll = callback; return 1; }, clearInterval: () => {} });
  dom.window.addEventListener('message', event => {
    requests.push(event.data.pluginMessage);
    api.ui.onmessage(event.data.pluginMessage);
  });
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 10)); };
  const edit = (label, value) => {
    const input = [...frame.document.querySelectorAll('input')].find(i => i.getAttribute('aria-label') === label);
    assert.ok(input, label); input.value = value; input.dispatchEvent(new frame.Event('input', { bubbles: true }));
  };
  const click = selector => { const e = frame.document.querySelector(selector); assert.ok(e, selector); e.click(); };
  try {
    frame.eval(uiCode);
    assert.equal(frame.document.querySelector('.value-input').disabled, true);
    assert.equal(frame.document.querySelector('.generate').disabled, true);
    await settle();
    assert.equal(hostMessages.at(-1).type, 'error');
    assert.match(frame.document.querySelector('.notice').textContent, /插件缺少 ID/);
    assert.equal(frame.document.querySelector('.value-input').disabled, true);
    assert.equal(frame.document.querySelector('.generate').disabled, true);
    api.pluginId = manifest.id; mock.api.pluginId = manifest.id;
    frame.parent.postMessage({ pluginMessage: { type: 'ready' } }, '*');
    await settle();
    assert.equal(hostMessages.at(-1).snapshot.existing, 173);
    assert.equal(frame.document.querySelector('.value-input').disabled, false);
    const inputBefore = frame.document.querySelector('[aria-label="品牌色基准值"]');
    const swatchBefore = frame.document.querySelector('[aria-label="品牌色基准值颜色选择器"]');
    assert.equal(frame.document.querySelector('.generate').title, '生成全部变量（当前已有 173/176）');
    const count = mock.variables.length;
    edit('品牌色基准值', '336699'); await settle();
    const colors = mock.collections.find(c => c.name === '梯度色板');
    assert.equal(mock.variable('light/color-primary/9').valuesByMode[colors.defaultModeId].r, 0.2);
    assert.equal(frame.document.querySelector('[aria-label="品牌色基准值"]'), inputBefore);
    assert.equal(frame.document.querySelector('[aria-label="品牌色基准值颜色选择器"]'), swatchBefore);
    const mutations = [];
    const observer = new frame.MutationObserver(records => mutations.push(...records));
    observer.observe(frame.document.querySelector('.panels'), { childList: true, subtree: true });
    inputBefore.focus();
    for (let index = 0; index < 20; index++) edit('品牌色基准值', `1122${index.toString(16).padStart(2, '0')}`);
    inputBefore.setSelectionRange(3, 3);
    await settle();
    observer.disconnect();
    assert.equal(mutations.reduce((sum, record) => sum + record.removedNodes.length, 0), 0);
    assert.equal(frame.document.activeElement, inputBefore);
    assert.equal(inputBefore.selectionStart, 3);
    assert.equal(inputBefore.selectionEnd, 3);
    assert.equal(mock.variable('light/color-primary/9').valuesByMode[colors.defaultModeId].b, 19 / 255);
    inputBefore.value = '112233';
    inputBefore.dispatchEvent(new frame.Event('change', { bubbles: true }));
    swatchBefore.click();
    assert.equal(frame.document.querySelector('.picker').hidden, false, 'color swatch opens before the pending input is acknowledged');
    const format = frame.document.querySelector('.format-select select');
    format.value = 'HEX'; format.dispatchEvent(new frame.Event('change', { bubbles: true }));
    assert.equal(frame.document.querySelector('[aria-label="HEX"]').value, '112233');
    frame.document.dispatchEvent(new frame.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    inputBefore.focus(); edit('品牌色基准值', '12');
    inputBefore.setSelectionRange(1, 1);
    const requestCount = requests.filter(m => m.type === 'action').length;
    mock.set('light/color-primary/9', { r: 68 / 255, g: 85 / 255, b: 102 / 255, a: 1 });
    poll(); await settle();
    assert.equal(inputBefore.value, '12', 'external updates preserve unfinished input');
    assert.equal(frame.document.activeElement, inputBefore);
    assert.equal(inputBefore.selectionStart, 1);
    inputBefore.dispatchEvent(new frame.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(inputBefore.value, '#445566');
    assert.equal(requests.filter(m => m.type === 'action').length, requestCount);
    swatchBefore.click();
    assert.equal(frame.document.querySelector('[aria-label="HEX"]').value, '445566', 'swatch opens the latest external color');
    frame.document.dispatchEvent(new frame.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(frame.document.querySelector('.generate').disabled, false);
    click('[aria-label="中性色基准值颜色选择器"]');
    assert.equal(format.value, 'HSL');
    for (const [label, value] of [['H', '120'], ['S', '100'], ['L', '25']]) {
      const input = frame.document.querySelector(`.picker [aria-label="${label}"]`);
      input.value = value; input.dispatchEvent(new frame.Event('change', { bubbles: true }));
    }
    await settle();
    assert.equal(mock.variable('light/color-gray/13').valuesByMode[colors.defaultModeId].g, 128 / 255);
    assert.equal(frame.document.querySelector('[aria-label="中性色基准值"]').value, '#008000');
    const lightness = frame.document.querySelector('.picker [aria-label="L"]');
    lightness.focus();
    lightness.dispatchEvent(new frame.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    await settle();
    assert.equal(mock.variable('light/color-gray/13').valuesByMode[colors.defaultModeId].g, 179 / 255);
    assert.equal(frame.document.querySelector('.picker [aria-label="L"]'), lightness);
    assert.equal(frame.document.activeElement, lightness);
    frame.document.dispatchEvent(new frame.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    click('[data-tab="size"]');
    click('[aria-label="字号基准值展开收起"]');
    assert.equal(frame.document.querySelector('[aria-label="font-size-4xl"]').value, '30');
    edit('字号基准值', '16'); await settle();
    const text = mock.collections.find(c => c.name === '文字');
    assert.equal(mock.variable('font-size/md').valuesByMode[text.defaultModeId], 16);
    assert.equal(mock.variables.length, count);
    assert.equal(requests.some(m => m.type === 'generate'), false);
    mock.set('font-size/md', 18); poll(); await settle();
    assert.equal(frame.document.querySelector('[aria-label="字号基准值"]').value, '18');
    click('[aria-label="圆角基准值展开收起"]');
    const radiusInput = frame.document.querySelector('[aria-label="圆角基准值"]');
    const radiusValue = Number(radiusInput.value);
    radiusInput.focus();
    radiusInput.dispatchEvent(new frame.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await settle();
    const radius = mock.collections.find(c => c.name === 'radius');
    assert.equal(mock.variable('md').valuesByMode[radius.defaultModeId], radiusValue + 1);
    assert.equal(frame.document.querySelector('[aria-label="圆角基准值"]'), radiusInput);
    const derivedInput = frame.document.querySelector('[aria-label="radius-4xl"]');
    edit('radius-4xl', '25'); await settle();
    const reset = derivedInput.closest('.token-row').querySelector('.reset');
    assert.equal(reset.hidden, false);
    reset.click(); await settle();
    assert.equal(frame.document.querySelector('[aria-label="radius-4xl"]'), derivedInput);
    assert.equal(derivedInput.value, String(radiusValue + 11));
    assert.equal(reset.hidden, true);
    const snapshot = structuredClone(hostMessages.findLast(m => m.type === 'snapshot'));
    snapshot.snapshot.settings.sizes.fontSize = 24;
    frame.dispatchEvent(new frame.MessageEvent('message', { data: { unrelatedMessage: snapshot }, source: frame }));
    assert.equal(frame.document.querySelector('[aria-label="字号基准值"]').value, '18');
    assert.equal(frame.document.querySelector('header'), null);
    assert.equal(frame.document.querySelector('h1'), null);
    assert.equal(frame.document.querySelector('.close'), null);
    assert.ok(requests.some(m => m.type === 'resize' && m.height === 580));
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
test('iframe initialization timeout stays visible and host snapshots accept null, parent and self sources', async () => {
  const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
  const [html, uiCode] = await Promise.all([readFile('dist/ui.html', 'utf8'), readFile('dist/ui.js', 'utf8')]);
  for (const timeOut of [false, true]) {
    const dom = new JSDOM('<iframe></iframe>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://www.figma.com/' });
    const frame = dom.window.document.querySelector('iframe').contentWindow;
    const timers = new Map(), errors = [];
    let timerId = 0;
    frame.document.open(); frame.document.write(html); frame.document.close();
    frame.structuredClone = structuredClone;
    frame.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
    frame.clearTimeout = id => timers.delete(id);
    frame.addEventListener('error', e => errors.push(e.message));
    try {
      frame.eval(uiCode);
      const input = frame.document.querySelector('[aria-label="品牌色基准值"]');
      assert.equal(input.disabled, true);
      const [id, timer] = [...timers].find(([, timer]) => timer.delay === 5000);
      if (timeOut) {
        timers.delete(id); timer.callback();
        assert.equal(frame.document.querySelector('.notice').hidden, false);
        assert.match(frame.document.querySelector('.notice').textContent, /5 秒/);
        assert.equal(frame.document.querySelector('.generate').disabled, true);
        assert.equal(timers.size, 0, 'timeout error has no auto-hide timer');
      }
      for (const [index, source] of [null, frame.parent, frame].entries()) {
        const settings = defaults();
        settings.colors.light.primary = ['#112233', '#445566', '#778899'][index];
        frame.dispatchEvent(new frame.MessageEvent('message', {
          data: { pluginMessage: { type: 'snapshot', snapshot: { settings, tokens: tokens(settings), existing: 0, total: 176, complete: false } } },
          source,
        }));
        assert.equal(frame.document.querySelector('[aria-label="品牌色基准值"]'), input);
        assert.equal(input.disabled, false);
        assert.equal(input.value, settings.colors.light.primary);
        assert.equal(frame.document.querySelector('.swatch').disabled, false);
        assert.equal(frame.document.querySelector('.generate').disabled, false);
        assert.equal(frame.document.querySelector('.notice').hidden, true);
        assert.equal(timers.has(id), false);
      }
      assert.deepEqual(errors, []);
    } finally {
      dom.window.close();
    }
  }
});
async function pickerFixture() {
  const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
  const [html, uiCode] = await Promise.all([readFile('dist/ui.html', 'utf8'), readFile('dist/ui.js', 'utf8')]);
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://127.0.0.1:4178/' });
  const frame = dom.window, errors = [];
  frame.structuredClone = structuredClone;
  frame.addEventListener('error', event => errors.push(event.message));
  frame.eval(uiCode);
  const field = label => frame.document.querySelector(`.picker [aria-label="${label}"]`);
  const format = value => {
    const select = field('颜色格式'); select.value = value; select.dispatchEvent(new frame.Event('change', { bubbles: true }));
  };
  const edit = (label, value) => {
    const input = field(label); assert.ok(input, label);
    input.value = String(value); input.dispatchEvent(new frame.Event('change', { bubbles: true }));
  };
  const key = (input, key, shiftKey = false) => input.dispatchEvent(new frame.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  const click = label => {
    const button = frame.document.querySelector(`[aria-label="${label}颜色选择器"]`);
    assert.ok(button, label); button.click();
  };
  const color = label => frame.document.querySelector(`[aria-label="${label}"]`).value;
  return { dom, frame, errors, field, format, edit, key, click, color };
}
test('picker numeric shortcuts work in HSB, RGB, HSL and opacity without replacing focused fields', async () => {
  const f = await pickerFixture();
  try {
    f.click('品牌色基准值');
    for (const [format, label, initial, maximum] of [['HSB', 'H', 20, 360], ['HSB', 'S', 50, 100], ['HSB', 'B', 50, 100], ['RGB', 'R', 120, 255], ['RGB', 'G', 120, 255], ['RGB', 'B', 120, 255], ['HSL', 'H', 20, 360], ['HSL', 'S', 50, 100], ['HSL', 'L', 50, 100]]) {
      f.format(format); f.edit(label, initial);
      const input = f.field(label); input.focus();
      f.key(input, 'ArrowUp'); f.key(input, 'ArrowUp', true); f.key(input, 'ArrowDown');
      assert.equal(Number(input.value), initial + 10, `${format} ${label} shortcut increments`);
      assert.equal(f.field(label), input);
      assert.equal(f.frame.document.activeElement, input);
      f.edit(label, maximum); f.key(input, 'ArrowUp', true);
      assert.equal(Number(input.value), maximum);
      f.edit(label, 0); f.key(input, 'ArrowDown', true);
      assert.equal(Number(input.value), 0);
    }
    const opacity = f.field('不透明度');
    assert.equal(opacity.readOnly, true);
    f.key(opacity, 'ArrowDown', true); assert.equal(opacity.value, '100');
    f.frame.document.querySelector('[aria-label="品牌色基准值展开收起"]').click();
    f.click('color-primary-1');
    const editableOpacity = f.field('不透明度'); editableOpacity.focus();
    f.key(editableOpacity, 'ArrowDown', true); f.key(editableOpacity, 'ArrowDown');
    assert.equal(editableOpacity.value, '89');
    assert.equal(f.field('不透明度'), editableOpacity);
    assert.equal(f.frame.document.activeElement, editableOpacity);
    assert.equal(f.color('color-primary-1').slice(-2), 'E3');
    assert.deepEqual(f.errors, []);
  } finally { f.dom.window.close(); }
});
test('HSL defaults for neutral seeds and tokens in both modes; conversions, format changes and invalid inputs preserve colors', async () => {
  const f = await pickerFixture();
  try {
    f.click('中性色基准值');
    assert.equal(f.field('颜色格式').value, 'HSL');
    f.edit('H', 120); f.edit('S', 100); f.edit('L', 25);
    assert.equal(f.color('中性色基准值'), '#008000');
    const green = f.color('中性色基准值');
    for (const mode of ['RGB', 'HEX', 'HSB', 'HSL']) { f.format(mode); assert.equal(f.color('中性色基准值'), green); }
    f.edit('L', 100); assert.equal(f.color('中性色基准值'), '#FFFFFF');
    f.edit('L', 0); assert.equal(f.color('中性色基准值'), '#000000');
    f.edit('L', 50); assert.equal(f.color('中性色基准值'), '#00FF00');
    f.edit('S', 0); assert.equal(f.color('中性色基准值'), '#808080');
    f.edit('H', 360); f.edit('S', 100); assert.equal(f.color('中性色基准值'), '#FF0000');
    for (const invalid of ['', 'abc', '-1', '101', 'Infinity']) {
      const before = f.color('中性色基准值'); f.edit('L', invalid);
      assert.equal(f.color('中性色基准值'), before);
      assert.equal(f.frame.document.querySelector('.notice').hidden, false);
      assert.equal(f.frame.document.querySelector('.notice').classList.contains('error'), true);
    }
    f.edit('S', 0); f.edit('L', 8);
    const saturation = f.field('S');
    for (let index = 0; index < 5; index++) f.key(saturation, 'ArrowUp');
    assert.equal(saturation.value, '5', 'low-lightness HSL adjustments retain precision instead of getting stuck on RGB rounding');
    f.edit('H', 120); f.edit('S', 100); f.edit('L', 25);
    const hue = f.field('H'); hue.focus(); hue.value = '240';
    hue.dispatchEvent(new f.frame.Event('input', { bubbles: true }));
    f.click('品牌色基准值');
    assert.equal(f.color('中性色基准值'), '#000080', 'switching targets commits the active draft to the original color');
    assert.equal(f.field('H').value, '23', 'another target does not inherit the previous draft');
    f.frame.document.querySelector('[aria-label="中性色基准值展开收起"]').click();
    f.click('color-gray-1'); assert.equal(f.field('颜色格式').value, 'HSL');
    f.frame.document.querySelector('[data-mode="dark"]').click();
    f.click('中性色基准值'); assert.equal(f.field('颜色格式').value, 'HSL');
    f.frame.document.querySelector('[aria-label="中性色基准值展开收起"]').click();
    f.click('color-gray-1'); assert.equal(f.field('颜色格式').value, 'HSL');
    f.click('品牌色基准值'); assert.equal(f.field('颜色格式').value, 'HSB');
    assert.deepEqual(f.errors, []);
  } finally { f.dom.window.close(); }
});
test('color square stops selecting on release, missing mouse buttons, cancel, capture loss, blur and picker close', async () => {
  const f = await pickerFixture();
  let capture = null;
  const square = f.frame.document.querySelector('.color-square');
  const pointer = (target, type, buttons, pointerId = 1, x = 112, y = 56, button = 0) => {
    const event = new f.frame.MouseEvent(type, { clientX: x, clientY: y, buttons, button, bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: 'mouse' }, isPrimary: { value: true } });
    target.dispatchEvent(event);
  };
  square.getBoundingClientRect = () => ({ left: 0, top: 0, width: 224, height: 224 });
  square.setPointerCapture = id => { capture = id; };
  square.hasPointerCapture = id => capture === id;
  square.releasePointerCapture = id => { if (capture === id) capture = null; };
  const position = () => {
    const handle = square.querySelector('.square-handle'); return [handle.style.left, handle.style.top];
  };
  try {
    f.click('品牌色基准值');
    const initial = position();
    pointer(square, 'pointermove', 0, 1, 20, 20);
    pointer(square, 'pointerdown', 2, 1, 20, 20, 2);
    assert.deepEqual(position(), initial, 'hover and right clicks do not select');
    for (const finish of ['pointerup', 'pointercancel', 'lostpointercapture', 'buttons', 'blur', 'close']) {
      pointer(square, 'pointerdown', 1);
      assert.deepEqual(position(), ['50%', '25%']);
      pointer(square, 'pointermove', 1, 99, 10, 10);
      assert.deepEqual(position(), ['50%', '25%'], 'other pointer IDs cannot control the active drag');
      if (finish === 'buttons') pointer(square, 'pointermove', 0, 1, 200, 200);
      else if (finish === 'blur') f.frame.dispatchEvent(new f.frame.Event('blur'));
      else if (finish === 'close') {
        f.frame.document.dispatchEvent(new f.frame.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        f.click('品牌色基准值');
      } else pointer(finish === 'lostpointercapture' ? square : f.frame, finish, 0);
      const stopped = position(), color = f.color('品牌色基准值');
      pointer(square, 'pointermove', 0, 1, 20, 200);
      pointer(square, 'pointermove', 1, 1, 200, 20);
      assert.deepEqual(position(), stopped, finish);
      assert.equal(f.color('品牌色基准值'), color, finish);
      assert.equal(capture, null, finish);
    }
    assert.deepEqual(f.errors, []);
  } finally { f.dom.window.close(); }
});
test('existing uppercase and mixed-case mode groups are reused without renaming or duplicating variables', async () => {
  const mock = manualDocument();
  for (const v of mock.variables.filter(v => /^(light|dark)\//.test(v.name))) {
    v.name = v.name.replace(/^(light|dark)/, mode => mode === 'light' ? 'Light' : 'DARK');
  }
  const originalNames = mock.variables.map(v => v.name), originalIds = mock.variables.map(v => v.id);
  const sync = new Synchronizer(mock.api);
  assert.equal((await sync.initialize()).existing, 173);
  await sync.act({ type: 'color-seed', mode: 'dark', family: 'gray', value: '#222222' });
  const c = mock.collections.find(c => c.name === '梯度色板');
  assert.equal(mock.variable('DARK/color-gray/13').valuesByMode[c.defaultModeId].r, 34 / 255);
  assert.deepEqual(mock.variables.map(v => v.name), originalNames);
  assert.deepEqual(mock.variables.map(v => v.id), originalIds);
  await sync.generate();
  assert.equal(mock.variables.filter(v => /^(light|dark)\//i.test(v.name)).length, 132);
  assert.equal(mock.variables.some(v => v.name.startsWith('light/color-primary/')), false);
});
test('saved uppercase mode override IDs migrate without losing manual values', () => {
  const saved = defaults();
  saved.overrides['梯度色板:Light/color-primary/1'] = '#123456';
  saved.overrides['梯度色板:Dark/color-success/2'] = '#23456780';
  const restored = readSettings(JSON.stringify(saved));
  assert.equal(restored.overrides['梯度色板:light/color-primary/1'], '#123456');
  assert.equal(restored.overrides['梯度色板:dark/color-success/2'], '#23456780');
  assert.equal('梯度色板:Light/color-primary/1' in restored.overrides, false);
});
test('mode-case duplicate variables fail explicitly rather than writing an arbitrary token', async () => {
  const mock = manualDocument(), c = mock.collections.find(c => c.name === '梯度色板');
  mock.api.variables.createVariable('Light/color-primary/9', c, 'COLOR').setValueForMode(c.defaultModeId, { r: 1, g: 0, b: 0, a: 1 });
  await assert.rejects(new Synchronizer(mock.api).initialize(), /重复变量/);
});
test('missing plugin ID fails clearly before accessing private data or writing any variables', async () => {
  const mock = mockFigma('');
  let reads = 0;
  mock.api.root.getPluginData = () => { reads++; throw new Error('Native private data requires ID'); };
  await assert.rejects(new Synchronizer(mock.api).initialize(), /插件缺少 ID/);
  assert.equal(reads, 0); assert.equal(mock.writes(), 0);
});
test('build rejects a missing manifest ID before creating distributable artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'theme-configurator-manifest-'));
  const path = join(directory, 'manifest.json');
  try {
    await writeFile(path, JSON.stringify({ name: 'No ID' }));
    const result = spawnSync(process.execPath, [resolve('scripts/build.mjs')], { cwd: directory, encoding: 'utf8', env: process.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /stable plugin id/);
  } finally {
    await unlink(path); await rmdir(directory);
  }
});
test('large document scans read native variable metadata only once per variable, not once per token', async t => {
  const mock = manualDocument();
  const c = mock.api.variables.createVariableCollection('组件级');
  for (let index = 0; index < 2000; index++) {
    mock.api.variables.createVariable(`component/custom-${index}`, c, 'FLOAT').setValueForMode(c.defaultModeId, index);
  }
  let nativeReads = 0, collectionIdReads = 0;
  const nativeProperties = new Set(['id', 'name', 'variableCollectionId', 'valuesByMode', 'resolvedType']);
  const proxies = mock.variables.map(v => new Proxy(v, {
    get(target, property, receiver) {
      if (nativeProperties.has(property)) nativeReads++;
      if (property === 'variableCollectionId') collectionIdReads++;
      return Reflect.get(target, property, receiver);
    },
  }));
  mock.api.variables.getLocalVariablesAsync = async () => proxies;
  const sync = new Synchronizer(mock.api);
  await sync.initialize();
  assert.ok(collectionIdReads <= proxies.length + 176, `${collectionIdReads} collectionId reads for ${proxies.length} variables`);
  assert.ok(nativeReads <= proxies.length * 4 + 176 * 8, `${nativeReads} native reads`);
  t.diagnostic(`${proxies.length} variables: ${collectionIdReads} collectionId reads, ${nativeReads} total native property reads`);
  nativeReads = 0; collectionIdReads = 0;
  const writes = mock.writes();
  assert.equal(await sync.refresh(), null);
  assert.ok(collectionIdReads <= proxies.length + 176);
  assert.ok(nativeReads <= proxies.length * 4 + 176 * 8);
  assert.equal(mock.writes(), writes);
});

async function linkedPerformanceFixture() {
  const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
  const dom = new JSDOM('<iframe></iframe>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://www.figma.com/' });
  const frame = dom.window.document.querySelector('iframe').contentWindow;
  const mock = manualDocument(), messages = [], requests = [], errors = [];
  const extra = mock.api.variables.createVariableCollection('组件级变量');
  for (let i = 0; i < 2000; i++) mock.api.variables.createVariable(`component/${i}`, extra, 'FLOAT').setValueForMode(extra.defaultModeId, i);
  let scans = 0, saves = 0, writesBefore = mock.writes(), gate, closed = false, poll;
  const getVariables = mock.api.variables.getLocalVariablesAsync;
  mock.api.variables.getLocalVariablesAsync = async () => {
    scans++;
    if (gate) await gate;
    return getVariables();
  };
  const save = mock.api.root.setPluginData;
  mock.api.root.setPluginData = (...args) => { saves++; save(...args); };
  const [html, uiCode, code] = await Promise.all([readFile('dist/ui.html', 'utf8'), readFile('dist/ui.js', 'utf8'), readFile('dist/code.js', 'utf8')]);
  frame.document.open(); frame.document.write(html); frame.document.close();
  frame.structuredClone = structuredClone;
  frame.addEventListener('error', event => errors.push(event.message));
  const api = {
    ...mock.api,
    ui: { postMessage: message => {
      messages.push(structuredClone(message));
      frame.dispatchEvent(new frame.MessageEvent('message', { data: { pluginMessage: structuredClone(message) }, source: frame }));
    }, resize: () => {} },
    showUI: () => {}, notify: () => {}, on: () => {}, closePlugin: () => { closed = true; },
  };
  runInNewContext(code, {
    figma: api, __html__: html, console: { error: (...args) => errors.push(args.map(String).join(' ')) },
    setInterval: callback => { poll = callback; return 1; }, clearInterval: () => {},
  });
  dom.window.addEventListener('message', event => { requests.push(event.data.pluginMessage); api.ui.onmessage(event.data.pluginMessage); });
  const waitFor = async predicate => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('UI/host did not settle within one second');
  };
  frame.eval(uiCode);
  await waitFor(() => !frame.document.querySelector('.value-input').disabled);
  const edit = (label, value) => {
    const input = frame.document.querySelector(`[aria-label="${label}"]`);
    assert.ok(input, label); input.value = value; input.dispatchEvent(new frame.Event('input', { bubbles: true }));
  };
  return {
    dom, frame, mock, messages, requests, errors, api, edit, waitFor, poll: () => poll(), closed: () => closed,
    blockReads: () => {
      let release; gate = new Promise(resolve => { release = resolve; });
      return () => { gate = undefined; release(); };
    },
    reset: () => { scans = 0; saves = 0; writesBefore = mock.writes(); messages.length = 0; requests.length = 0; },
    metrics: () => ({ scans, saves, writes: mock.writes() - writesBefore, replies: messages.filter(m => m.type === 'snapshot').length, requests: requests.filter(m => m.type === 'action' || m.type === 'actions').length }),
  };
}
test('slow-host continuous editing uses at most two scans and write rounds for 21 inputs in a 2175-variable document', async t => {
  const f = await linkedPerformanceFixture();
  let release;
  try {
    f.reset(); release = f.blockReads();
    f.edit('品牌色基准值', '110000');
    await f.waitFor(() => f.metrics().scans === 1);
    const input = f.frame.document.querySelector('[aria-label="品牌色基准值"]');
    input.focus();
    for (let i = 0; i < 20; i++) f.edit('品牌色基准值', `1122${i.toString(16).padStart(2, '0')}`);
    assert.equal(input.value, '#112213', 'optimistic feedback does not wait for the host');
    input.setSelectionRange(3, 3);
    release(); release = undefined;
    await f.waitFor(() => !f.frame.document.querySelector('.generate').disabled);
    const colors = f.mock.collections.find(c => c.name === '梯度色板');
    assert.equal(f.mock.variable('light/color-primary/9').valuesByMode[colors.defaultModeId].b, 19 / 255);
    assert.equal(f.frame.document.activeElement, input);
    assert.equal(input.selectionStart, 3);
    const metrics = f.metrics();
    t.diagnostic(`21 inputs / ${f.mock.variables.length} variables: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.scans <= 2, `${metrics.scans} document scans`);
    assert.ok(metrics.saves <= 2, `${metrics.saves} private-file saves`);
    assert.ok(metrics.writes <= 26, `${metrics.writes} native variable writes`);
    assert.ok(metrics.replies <= 2, `${metrics.replies} full snapshot replies`);
    assert.ok(metrics.requests <= 2, `${metrics.requests} UI-to-host edit messages`);
    assert.deepEqual(f.errors, []);
  } finally {
    release?.(); f.dom.window.close();
  }
});
test('batched mixed edits preserve sequential seed, override and reset semantics and reject invalid batches before writes', async () => {
  const mock = mockFigma(), sync = new Synchronizer(mock.api);
  await sync.initialize(); await sync.generate();
  const actions = [
    { type: 'size-seed', group: 'font-size', value: 16 },
    { type: 'token', id: '文字:font-size/4xl', value: 60 },
    { type: 'size-seed', group: 'font-size', value: 18 },
    { type: 'reset', id: '文字:font-size/4xl' },
    { type: 'size-seed', group: 'icon-size', value: 30 },
    { type: 'size-seed', group: 'font-size', value: 20 },
    { type: 'reset-icon' },
    { type: 'color-seed', mode: 'dark', family: 'gray', value: '#112233' },
    { type: 'color-seed', mode: 'dark', family: 'primary', value: '#FF0000' },
    { type: 'token', id: '梯度色板:dark/color-gray/5', value: '#12345680' },
  ];
  const expected = cloneSettings(sync.settings);
  for (const action of actions) apply(expected, action);
  const snapshot = await sync.actMany(actions);
  assert.deepEqual(snapshot.settings, expected);
  assert.deepEqual(snapshot.tokens, tokens(expected));
  assert.equal(await sync.refresh(), null);
  const writes = mock.writes(), storage = mock.storage(), settings = JSON.stringify(sync.settings);
  await assert.rejects(sync.actMany([
    { type: 'size-seed', group: 'font-size', value: 22 },
    { type: 'size-seed', group: 'font-size', value: 13 },
  ]), /偶数/);
  await assert.rejects(sync.actMany([]), /没有待同步/);
  assert.equal(JSON.stringify(sync.settings), settings);
  assert.equal(mock.writes(), writes);
  assert.equal(mock.storage(), storage);
});
test('Cancel waits for in-flight and buffered edits and preserves concurrent external overrides before closing', async () => {
  const f = await linkedPerformanceFixture();
  let release;
  try {
    f.reset(); release = f.blockReads();
    f.edit('品牌色基准值', '110000');
    await f.waitFor(() => f.metrics().scans === 1);
    for (let i = 0; i < 20; i++) f.edit('品牌色基准值', `1122${i.toString(16).padStart(2, '0')}`);
    f.mock.set('font-size/4xl', 66);
    f.frame.document.querySelector('.cancel').click();
    assert.equal(f.closed(), false);
    assert.equal(f.frame.document.querySelector('.cancel').disabled, true);
    release(); release = undefined;
    await f.waitFor(f.closed);
    const colors = f.mock.collections.find(c => c.name === '梯度色板');
    assert.equal(f.mock.variable('light/color-primary/9').valuesByMode[colors.defaultModeId].b, 19 / 255);
    const stored = JSON.parse(f.mock.storage());
    assert.equal(stored.colors.light.primary, '#112213');
    assert.equal(stored.overrides['文字:font-size/4xl'], 66);
    assert.equal(f.metrics().scans, 2);
    assert.deepEqual(f.errors, []);
  } finally { release?.(); f.dom.window.close(); }
});
test('failed batched host edits acknowledge all IDs, restore authoritative state, cancel closing and permit retry', async () => {
  const f = await linkedPerformanceFixture();
  try {
    f.reset();
    const get = f.mock.api.variables.getLocalVariablesAsync;
    let fail = true;
    f.mock.api.variables.getLocalVariablesAsync = async () => {
      if (fail) { fail = false; throw new Error('模拟变量读取失败'); }
      return get();
    };
    f.edit('品牌色基准值', '123456'); f.edit('中性色基准值', '654321');
    f.frame.document.querySelector('.cancel').click();
    await f.waitFor(() => f.messages.some(m => m.type === 'error') && !f.frame.document.querySelector('.generate').disabled);
    const error = f.messages.find(m => m.type === 'error');
    assert.equal(error.requestIds.length, 2);
    assert.equal(f.frame.document.querySelector('[aria-label="品牌色基准值"]').value, '#FF6000');
    assert.equal(f.frame.document.querySelector('[aria-label="中性色基准值"]').value, '#0F131A');
    assert.match(f.frame.document.querySelector('.notice').textContent, /模拟变量读取失败/);
    assert.equal(f.frame.document.querySelector('.notice').classList.contains('error'), true);
    assert.equal(f.metrics().writes, 0);
    assert.equal(f.closed(), false);
    assert.equal(f.frame.document.querySelector('.cancel').disabled, false);
    f.edit('品牌色基准值', 'ABCDEF');
    await f.waitFor(() => !f.frame.document.querySelector('.generate').disabled);
    assert.equal(JSON.parse(f.mock.storage()).colors.light.primary, '#ABCDEF');
    assert.equal(f.errors.length, 1);
    assert.match(f.errors[0], /模拟变量读取失败/);
  } finally { f.dom.window.close(); }
});
test('palette reuse respects light/dark dependencies and settings clones never mutate existing snapshots', () => {
  const original = defaults(), originalTokens = tokens(original);
  const copy = cloneSettings(original);
  copy.colors.light.primary = '#123456'; copy.colors.dark.gray = '#334455';
  copy.sizes.fontSize = 20; copy.overrides['文字:font-size/4xl'] = 70;
  assert.deepEqual(original, defaults());
  for (let i = 0; i < 20; i++) {
    copy.sizes.radius = i;
    const all = tokens(copy);
    for (const mode of ['light', 'dark']) for (const family of ['primary', 'gray', 'success', 'error', 'warning']) {
      const expected = generatePalette(family === 'gray' ? 'neutral' : 'brand', mode, copy.colors[mode][family], copy.colors[mode].gray);
      assert.deepEqual(all.filter(t => t.mode === mode && t.group === family).map(t => t.generated), expected.map(c => c.hex));
    }
  }
  assert.deepEqual(originalTokens, tokens(defaults()));
});
test('one-frame mixed UI edits share one host scan and snapshot; boundary shortcuts send no redundant edits', async t => {
  const f = await linkedPerformanceFixture();
  try {
    f.reset();
    f.edit('品牌色基准值', '110000'); f.edit('中性色基准值', '223344');
    f.frame.document.querySelector('[data-tab="size"]').click();
    f.edit('字号基准值', '16');
    f.frame.document.querySelector('[aria-label="字号基准值展开收起"]').click();
    f.edit('font-size-4xl', '60');
    f.frame.document.querySelector('[aria-label="font-size-4xl"]').closest('.token-row').querySelector('.reset').click();
    f.edit('字号基准值', '18'); f.edit('图标尺寸基准值', '30');
    f.frame.document.querySelector('[aria-label="图标尺寸基准值"]').closest('.field').querySelector('.reset').click();
    await f.waitFor(() => !f.frame.document.querySelector('.generate').disabled);
    assert.equal(f.frame.document.querySelector('[aria-label="font-size-4xl"]').value, '32');
    assert.equal(f.frame.document.querySelector('[aria-label="图标尺寸基准值"]').value, '22');
    const batch = f.requests.find(m => m.type === 'actions');
    assert.equal(batch.requests.length, 8);
    assert.equal(f.messages.find(m => m.type === 'snapshot').requestIds.length, 8);
    const metrics = f.metrics();
    t.diagnostic(`8 mixed inputs: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.scans, 1); assert.equal(metrics.saves, 1);
    assert.equal(metrics.requests, 1); assert.equal(metrics.replies, 1);
    f.frame.document.querySelector('[data-tab="color"]').click();
    f.frame.document.querySelector('[aria-label="品牌色基准值颜色选择器"]').click();
    const saturation = f.frame.document.querySelector('.picker [aria-label="S"]');
    assert.equal(saturation.value, '100');
    f.reset();
    for (let i = 0; i < 20; i++) saturation.dispatchEvent(new f.frame.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(f.metrics(), { scans: 0, saves: 0, writes: 0, replies: 0, requests: 0 });
    assert.deepEqual(f.errors, []);
  } finally { f.dom.window.close(); }
});
