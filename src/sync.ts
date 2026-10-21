import { apply, canonicalVariableName, channels, cloneSettings, defaults, equal, fromChannels, hydrate, readSettings, tokens, type Action, type Settings, type Snapshot, type Token, type Value } from './model';

const storageKey = 'theme-configurator-v1';
interface Inventory {
  collections: Map<string, VariableCollection>;
  variables: Map<string, Variable>;
  actual: Map<string, Value>;
  modes: Map<string, string>;
}
export class Synchronizer {
  settings: Settings = defaults();
  private readonly definitions = tokens(defaults());
  private previous?: Map<string, Value>;
  private inventory?: Inventory;
  private saved = '';
  constructor(private api: PluginAPI) {}

  private async read(): Promise<Inventory> {
    const [collections, variables] = await Promise.all([
      this.api.variables.getLocalVariableCollectionsAsync(),
      this.api.variables.getLocalVariablesAsync(),
    ]);
    const wanted = this.definitions;
    const names = new Set(wanted.map(t => t.collection));
    const collectionMap = new Map<string, VariableCollection>();
    const collectionById = new Map<string, VariableCollection>();
    const metadata = new Map<string, { id: string; modeId: string }>();
    for (const c of collections) {
      const name = c.name, id = c.id;
      collectionById.set(id, c);
      if (!names.has(name)) continue;
      if (collectionMap.has(name)) throw new Error(`存在多个“${name}”集合，请保留一个对应集合后重试。`);
      collectionMap.set(name, c);
      metadata.set(name, { id, modeId: c.defaultModeId });
    }
    const wantedKeys = new Set(wanted.flatMap(t => {
      const c = metadata.get(t.collection);
      return c ? [`${c.id}:${t.name}`] : [];
    }));
    const variableIndex = new Map<string, Variable>();
    const managedIds = new Set([...metadata.values()].map(c => c.id));
    for (const variable of variables) {
      const collectionId = variable.variableCollectionId;
      if (!managedIds.has(collectionId)) continue;
      const key = `${collectionId}:${canonicalVariableName(variable.name)}`;
      if (!wantedKeys.has(key)) continue;
      if (variableIndex.has(key)) throw new Error(`“${variable.name}”有重复变量，请先处理重名变量。`);
      variableIndex.set(key, variable);
    }
    const variableMap = new Map<string, Variable>(), actual = new Map<string, Value>();
    const resolve = async (variable: Variable, modeId: string, seen = new Set<string>()): Promise<Value> => {
      const id = variable.id;
      if (seen.has(id)) throw new Error(`变量 ${variable.name} 存在循环引用。`);
      seen.add(id);
      const value = variable.valuesByMode[modeId];
      if (value === undefined) throw new Error(`变量 ${variable.name} 的默认模式没有值。`);
      if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
        const target = await this.api.variables.getVariableByIdAsync(value.id);
        if (!target) throw new Error(`变量 ${variable.name} 的引用无法读取。`);
        const targetCollectionId = target.variableCollectionId;
        const c = collectionById.get(targetCollectionId) ?? await this.api.variables.getVariableCollectionByIdAsync(targetCollectionId);
        if (!c) throw new Error(`无法读取引用变量 ${target.name} 所在集合。`);
        return resolve(target, c.modes.some(m => m.modeId === modeId) ? modeId : c.defaultModeId, seen);
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`变量 ${variable.name} 不是有限数值。`);
        return value;
      }
      if (typeof value === 'object' && 'r' in value) return fromChannels(value.r * 255, value.g * 255, value.b * 255, 'a' in value ? value.a : 1);
      throw new Error(`变量 ${variable.name} 的类型不受支持。`);
    };
    for (const t of wanted) {
      const c = metadata.get(t.collection);
      if (!c) continue;
      const variable = variableIndex.get(`${c.id}:${t.name}`);
      if (!variable) continue;
      if (variable.resolvedType !== (typeof t.value === 'string' ? 'COLOR' : 'FLOAT')) throw new Error(`“${t.collection}/${t.name}”变量类型不匹配。`);
      variableMap.set(t.id, variable);
      actual.set(t.id, await resolve(variable, c.modeId));
    }
    return { collections: collectionMap, variables: variableMap, actual, modes: new Map([...metadata].map(([name, c]) => [name, c.modeId])) };
  }
  async initialize(): Promise<Snapshot> {
    if (!this.api.pluginId) throw new Error('插件缺少 ID，无法读取文件配置。请重新导入本地 manifest.json，再运行插件。');
    this.saved = this.api.root.getPluginData(storageKey);
    this.settings = readSettings(this.saved);
    this.inventory = await this.read();
    hydrate(this.settings, this.inventory.actual);
    this.previous = new Map(this.inventory.actual);
    this.persist();
    return this.snapshot();
  }
  private persist(): void {
    const serialized = JSON.stringify(this.settings);
    if (serialized === this.saved) return;
    this.api.root.setPluginData(storageKey, serialized);
    this.saved = serialized;
  }
  snapshot(all = tokens(this.settings)): Snapshot {
    const existing = this.inventory?.variables.size ?? 0;
    return { settings: this.settings, tokens: all, existing, total: all.length, complete: existing === all.length };
  }
  private writeToken(t: Token, variable: Variable, modeId: string): void {
    if (typeof t.value === 'number') variable.setValueForMode(modeId, t.value);
    else {
      const [r, g, b, a] = channels(t.value);
      variable.setValueForMode(modeId, { r: r / 255, g: g / 255, b: b / 255, a });
    }
  }
  private async write(create: boolean): Promise<Token[]> {
    if (!this.inventory) throw new Error('插件尚未初始化。');
    const all = tokens(this.settings);
    for (const t of all) {
      let c = this.inventory.collections.get(t.collection);
      if (!c && create) {
        c = this.api.variables.createVariableCollection(t.collection);
        this.inventory.collections.set(t.collection, c);
        this.inventory.modes.set(t.collection, c.defaultModeId);
      }
      if (!c) continue;
      let v = this.inventory.variables.get(t.id);
      if (!v && create) {
        v = this.api.variables.createVariable(t.name, c, typeof t.value === 'string' ? 'COLOR' : 'FLOAT');
        v.description = `${t.label} · 主题化配置器`;
        this.inventory.variables.set(t.id, v);
      }
      if (v && !equal(this.inventory.actual.get(t.id), t.value)) {
        const modeId = this.inventory.modes.get(t.collection);
        if (!modeId) throw new Error(`无法读取“${t.collection}”集合的默认模式。`);
        this.writeToken(t, v, modeId);
        this.inventory.actual.set(t.id, t.value);
      }
    }
    this.previous = new Map(this.inventory.actual);
    this.persist();
    return all;
  }
  async refresh(): Promise<Snapshot | null> {
    const next = await this.read();
    const changed = !this.previous || next.actual.size !== this.previous.size ||
      [...next.actual].some(([id, value]) => !equal(value, this.previous!.get(id)));
    this.inventory = next;
    if (!changed) return null;
    const candidate = cloneSettings(this.settings);
    hydrate(candidate, next.actual, this.previous);
    this.settings = candidate;
    return this.snapshot(await this.write(false));
  }
  async act(action: Action): Promise<Snapshot> {
    return this.actMany([action]);
  }
  async actMany(actions: readonly Action[]): Promise<Snapshot> {
    if (!actions.length) throw new Error('没有待同步的修改。');
    await this.refresh();
    const candidate = cloneSettings(this.settings);
    for (const action of actions) apply(candidate, action);
    this.settings = candidate;
    return this.snapshot(await this.write(false));
  }
  async generate(): Promise<Snapshot> {
    await this.refresh();
    return this.snapshot(await this.write(true));
  }
}
