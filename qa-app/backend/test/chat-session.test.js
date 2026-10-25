const test = require('node:test');
const assert = require('node:assert/strict');
const { runChatTurn } = require('../../shared/chatSession.cjs');

const payload = () => ({ question: '我们一起去海边', history: [], chatContext: { mode: 'free' }, characterSettings: {
  basicInfo: { name: '林舟' }, relationshipState: { affection: 10, mood: 0, relationshipStage: 'stranger' },
  memory: { longTerm: ['喜欢海风'], continuity: { pending: [] } },
} });
const response = content => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
const call = async messages => messages[0].content.includes('情感分析')
  ? response({ affection: 2, mood: 3, reason: '友好的邀请' }) : response({ scene: null, pendingUpdates: [] });

test('shared turn commits complete text and state before optional continuity, without mutating input', async () => {
  const input = payload(), before = structuredClone(input), events = [];
  const result = await runChatTurn(input, { call, stream: async (messages, options, chunk) => {
    assert.equal(options.timeout, 90000);
    assert.deepEqual(messages.at(-1).content, [{ type: 'text', text: input.question }]);
    chunk('好呀，'); chunk('出发🌊'); return '好呀，出发🌊';
  } }, {
    onChunk: text => events.push(text),
    onReply: data => { events.push('reply'); assert.equal(data.relationshipState.affection, 12); assert.equal(data.memory, undefined); },
    onProgress: () => events.push('organizing'), onDone: () => events.push('done'),
  });
  assert.deepEqual(events, ['好呀，', '出发🌊', 'reply', 'organizing', 'done']);
  assert.equal(result.history.at(-1).content, '好呀，出发🌊');
  assert.deepEqual(input, before);
});

test('stream interruption cannot commit relationship, history or continuity', async () => {
  let committed = false;
  await assert.rejects(runChatTurn(payload(), { call, stream: async (_, __, chunk) => { chunk('部分'); throw Error('连接中断'); } }, {
    onReply: () => { committed = true; }, onDone: () => { committed = true; },
  }), /连接中断/);
  assert.equal(committed, false);
});

test('cancelling after a complete reply skips continuity without a terminal commit', async () => {
  const controller = new AbortController();
  let complete, done = false;
  await assert.rejects(runChatTurn(payload(), { call, stream: async () => '完整回复' }, {
    signal: controller.signal, onReply: reply => { complete = reply; controller.abort(); }, onDone: () => { done = true; },
  }), { name: 'AbortError' });
  assert.equal(complete.history.at(-1).content, '完整回复');
  assert.equal(done, false);
});

test('continuity failure preserves confirmed memory while keeping the complete reply', async () => {
  const result = await runChatTurn(payload(), {
    call: async messages => { if (messages[0].content.includes('情感分析')) return call(messages); throw Error('整理不可用'); },
    stream: async () => '完整回复',
  });
  assert.deepEqual(result.memory.longTerm, ['喜欢海风']);
  assert.match(result.continuityWarning, /未自动更新/);
  assert.equal(result.history.at(-1).content, '完整回复');
});
