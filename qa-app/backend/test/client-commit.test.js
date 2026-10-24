const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const pinia = require('../../frontend-vue/node_modules/pinia');
const url = relative => pathToFileURL(path.resolve(__dirname, relative)).href;
global.localStorage = { getItem: () => null };
let source = fs.readFileSync(path.resolve(__dirname, '../../frontend-vue/src/store/chatStore.js'), 'utf8');
source = source.replace('"pinia"', JSON.stringify(url('../../frontend-vue/node_modules/pinia/dist/pinia.mjs')))
  .replace("'rp-core'", JSON.stringify(url('../../shared/runtime.cjs')))
  .replace("'rp-prompt'", JSON.stringify(url('../../shared/prompt.cjs')))
  .replace('"../api/chat"', JSON.stringify(url('./helpers/browser-api.mjs')));
const load = Promise.all([import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')), import(url('./helpers/browser-api.mjs'))]);
async function fixture() {
  const [{ useChatStore }, { control }] = await load;
  const store = useChatStore(pinia.createPinia());
  store.activeConversationId = 'chapter'; store.activeRelationshipId = 'relation';
  store.conversations = [{ id: 'chapter', relationshipId: 'relation', status: 'open', title: '测试' }];
  store.relationships = [{ id: 'relation', mode: 'free', chapters: store.conversations }];
  store.characterSettings = { basicInfo: { name: '林舟' }, relationshipState: { affection: 10, mood: 0, relationshipStage: 'stranger' }, memory: { longTerm: ['原始事实'] } };
  store.persistenceReady = true;
  control.failSave = false; control.writes = [];
  return { store, control };
}
test('client ignores intermediate state events if the terminal event never arrives', async () => {
  const { store, control } = await fixture();
  control.stream = async (_, cb) => { cb.onChunk('部分回复'); cb.onState?.({ relationshipState: { affection: 99 } }); throw Error('连接中断'); };
  await store.sendMessage('你好');
  assert.equal(store.characterSettings.relationshipState.affection, 10);
  assert.deepEqual(store.apiHistory, []);
  assert.deepEqual(store.characterSettings.memory.longTerm, ['原始事实']);
  assert.equal(control.writes.at(-1).snapshot.characterSettings.relationshipState.affection, 10);
});
test('terminal event atomically commits history, relationship and continuity before persisting', async () => {
  const { store, control } = await fixture();
  const history = [{ role: 'user', content: '你好' }, { role: 'assistant', content: '你好朋友' }];
  control.stream = async (_, cb) => { cb.onChunk('你好朋友'); cb.onDone({ history, relationshipState: { affection: 12, mood: 2, relationshipStage: 'stranger' }, memory: { longTerm: ['原始事实'], continuity: { location: '车站' } } }); };
  await store.sendMessage('你好');
  assert.equal(store.characterSettings.relationshipState.affection, 12);
  assert.equal(store.characterSettings.memory.continuity.location, '车站');
  assert.deepEqual(control.writes.at(-1).snapshot.apiHistory, history);
});
test('save failure prevents sending and rolls back explicit memory edits', async () => {
  const { store, control } = await fixture();
  control.failSave = true;
  let calls = 0; control.stream = async () => { calls++; };
  assert.equal(await store.sendMessage('你好'), false);
  assert.equal(calls, 0); assert.equal(store.isSending, false);
  assert.deepEqual(store.conversationHistory, []);
  await assert.rejects(store.saveMemoryAndProgress({ longTerm: ['新事实'] }), /保存/);
  assert.deepEqual(store.characterSettings.memory.longTerm, ['原始事实']);
});
test('archived and generating sessions refuse memory mutation', async () => {
  const { store } = await fixture();
  store.isSending = true;
  await assert.rejects(store.saveMemoryAndProgress({ longTerm: [] }), /暂不可修改/);
  store.isSending = false; store.conversations[0].status = 'closed';
  await assert.rejects(store.saveMemoryAndProgress({ longTerm: [] }), /暂不可修改/);
});
test('send progress distinguishes replying and memory work without committing intermediate state', async () => {
  const { store, control } = await fixture();
  control.stream = async (_, cb) => {
    assert.equal(store.sendPhase, 'preparing');
    cb.onChunk('完整回复');
    assert.equal(store.sendPhase, 'replying');
    cb.onProgress({ phase: 'organizing' });
    assert.equal(store.sendPhase, 'organizing');
    assert.equal(store.isSending, true);
    assert.equal(store.characterSettings.relationshipState.affection, 10);
    cb.onDone({ history: [], relationshipState: { affection: 12, mood: 0, relationshipStage: 'stranger' } });
  };
  await store.sendMessage('你好');
  assert.equal(store.sendPhase, '');
  assert.equal(store.isSending, false);
  assert.equal(store.characterSettings.relationshipState.affection, 12);
  control.stream = async (_, cb) => { cb.onProgress({ phase: 'organizing' }); throw Error('整理时连接中断'); };
  await store.sendMessage('再试一次');
  assert.equal(store.sendPhase, '');
  assert.equal(store.isSending, false);
});

test('stopping retains partial text without committing state; retry replaces the same round', async () => {
  const { store, control } = await fixture();
  control.stream = async (_, cb) => {
    cb.onChunk('尚未说完🌊');
    store.stopGeneration();
    assert.equal(cb.signal.aborted, true);
    throw new DOMException('已停止', 'AbortError');
  };
  await store.sendMessage('一起看海');
  assert.equal(store.conversationHistory.length, 2);
  assert.equal(store.conversationHistory[1].content, '尚未说完🌊');
  assert.equal(store.conversationHistory[1].delivery, 'stopped');
  assert.deepEqual(store.apiHistory, []);
  control.stream = async (payload, cb) => {
    assert.equal(payload.question, '一起看海');
    assert.deepEqual(payload.history, []);
    cb.onDone({ history: [{ role: 'user', content: payload.question }, { role: 'assistant', content: '走吧' }] });
  };
  await store.retryMessage(1);
  assert.equal(store.conversationHistory.length, 2);
  assert.equal(store.conversationHistory[1].content, '走吧');
  assert.equal(store.conversationHistory[1].delivery, 'complete');
  assert.equal(store.retryableMessageIndex, -1);
});

test('completed reply survives interruption of optional continuity work', async () => {
  const { store, control } = await fixture();
  const history = [{ role: 'user', content: '你好' }, { role: 'assistant', content: '你好朋友' }];
  control.stream = async (_, cb) => {
    cb.onChunk('你好');
    cb.onReply({ history, relationshipState: { affection: 12, mood: 1 } });
    cb.onProgress({ phase: 'organizing' });
    store.stopGeneration();
    throw new DOMException('已停止', 'AbortError');
  };
  await store.sendMessage('你好');
  assert.equal(store.conversationHistory[1].content, '你好朋友');
  assert.equal(store.conversationHistory[1].delivery, 'complete');
  assert.equal(store.characterSettings.relationshipState.affection, 12);
  assert.deepEqual(store.characterSettings.memory.longTerm, ['原始事实']);
  assert.deepEqual(control.writes.at(-1).snapshot.apiHistory, history);
  assert.match(store.continuityWarning, /跳过/);
});

test('failed partial reply retains content and an actionable error instead of replacing the reply', async () => {
  const { store, control } = await fixture();
  control.stream = async (_, cb) => { cb.onChunk('这是一部分'); throw new Error('模拟断线'); };
  await store.sendMessage('继续');
  assert.equal(store.conversationHistory[1].content, '这是一部分');
  assert.equal(store.conversationHistory[1].error, '模拟断线');
  assert.equal(store.retryableMessageIndex, 1);
  assert.deepEqual(store.apiHistory, []);
});

test('stop resolves the same request when actions receive different devtools proxy identities', async () => {
  const { store, control } = await fixture();
  const trackedStore = new Proxy(store, {});
  control.stream = async (_, cb) => {
    store.stopGeneration();
    assert.equal(cb.signal.aborted, true);
    throw new DOMException('已停止', 'AbortError');
  };
  await trackedStore.sendMessage('你好');
  assert.equal(store.conversationHistory[1].delivery, 'stopped');
});
