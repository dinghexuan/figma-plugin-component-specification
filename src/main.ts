import { Synchronizer } from './sync';
import type { HostMessage, UIMessage } from './model';

declare const __html__: string;
figma.showUI(__html__, { width: 400, height: 580, title: '主题化配置器', themeColors: false });
const sync = new Synchronizer(figma);
let chain = Promise.resolve();
let pending = 0;
let initialized = false;
let lastError = '';
const send = (message: HostMessage) => figma.ui.postMessage(message);
function acknowledgement(requestIds?: number[]): { requestId?: number; requestIds?: number[] } {
  return requestIds?.length === 1 ? { requestId: requestIds[0] } : requestIds?.length ? { requestIds } : {};
}
function run(work: () => Promise<void>, requestIds?: number[]): void {
  pending++;
  chain = chain.then(async () => {
    try {
      await work();
      lastError = '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[主题化配置器]', error);
      send({ type: 'error', message, ...acknowledgement(requestIds) });
      if (lastError !== message) figma.notify(message, { error: true, timeout: 6000 });
      lastError = message;
    } finally {
      pending--;
    }
  });
}
figma.ui.onmessage = (message: UIMessage) => {
  if (message.type === 'close') { figma.closePlugin(); return; }
  if (message.type === 'resize') {
    if (Number.isFinite(message.height)) figma.ui.resize(400, Math.max(360, Math.min(764, message.height)));
    return;
  }
  run(async () => {
    if (!initialized) {
      const snapshot = await sync.initialize();
      initialized = true;
      if (message.type === 'ready') {
        send({ type: 'snapshot', snapshot });
        return;
      }
    }
    if (message.type === 'action') send({ type: 'snapshot', snapshot: await sync.act(message.action), requestId: message.requestId });
    else if (message.type === 'actions') send({
      type: 'snapshot', snapshot: await sync.actMany(message.requests.map(r => r.action)),
      ...acknowledgement(message.requests.map(r => r.requestId)),
    });
    else if (message.type === 'generate') {
      const snapshot = await sync.generate();
      send({ type: 'snapshot', snapshot });
      send({ type: 'generated', count: snapshot.total });
      figma.notify(`已生成全部 ${snapshot.total} 个变量，后续修改将实时同步。`);
    } else if (message.type === 'ready') send({ type: 'snapshot', snapshot: sync.snapshot() });
  }, message.type === 'action' ? [message.requestId] : message.type === 'actions' ? message.requests.map(r => r.requestId) : undefined);
};
const timer = setInterval(() => {
  if (!initialized || pending) return;
  run(async () => {
    const snapshot = await sync.refresh();
    if (snapshot) send({ type: 'snapshot', snapshot });
  });
}, 800);
figma.on('close', () => clearInterval(timer));
