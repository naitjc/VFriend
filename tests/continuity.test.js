const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('@vfriend/core/rules');
const { buildSystemPrompt } = require('@vfriend/core/prompt');
const modelResult = content => ({ choices: [{ message: { content } }] });

test('high affection cannot create a commitment, existing and explicitly confirmed stages survive score changes', () => {
  let state = rules.initialRelationshipState({}, 95, 0);
  assert.equal(state.relationshipStage, 'familiar');
  for (let i = 0; i < 20; i++) state = rules.updateStateObject(state, { affection: 10 });
  assert.equal(state.affection, 100);
  assert.equal(state.relationshipStage, 'familiar');
  state = rules.confirmRelationship(state, 'close', '共同经历困难后明确表达信任');
  state = rules.updateStateObject(state, { affection: -10 });
  assert.equal(state.relationshipStage, 'close');
  assert.equal(rules.updateStateObject({ affection: 95, relationshipStage: 'life_partner' }, {}).relationshipStage, 'life_partner');
  assert.throws(() => rules.confirmRelationship(state, 'intimate', '  '));
  assert.throws(() => rules.confirmRelationship(state, 'invented', '事实'));
});

test('memory remains compatible and normalization does not mutate a legacy save', () => {
  const old = { longTerm: ['旧事实'], relationshipMemory: ['已确认事件'] };
  const memory = rules.normalizeMemory(old);
  memory.continuity.location = '车站';
  assert.equal(old.continuity, undefined);
  assert.deepEqual(memory.longTerm, ['旧事实']);
});

test('short Chinese history preserves original messages; budget compression retains complete recent turns', async () => {
  const short = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '很短的对话' }));
  assert.equal(await rules.compressHistory(() => { throw Error('must not call'); }, short), short);
  const history = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `消息${i}：${'中文'.repeat(300)}` }));
  const before = structuredClone(history);
  let material;
  const result = await rules.compressHistory(async messages => { material = JSON.parse(messages[1].content); return modelResult('旧约定已经取消，当前在车站。'); }, history);
  assert.equal(result[0].role, 'system');
  assert.equal(result[1].role, 'user');
  assert.deepEqual(result.slice(-2), history.slice(-2));
  assert.deepEqual([...material, ...result.slice(1)], history);
  assert.deepEqual(history, before);
  assert.ok(rules.historyTokens(result) < 10000);
});

test('budget accounts for Chinese and does not count image base64 as text', () => {
  assert.equal(rules.estimateTokens('你好'), 2);
  assert.equal(rules.estimateTokens('test'), 1);
  assert.equal(rules.estimateTokens([{ type: 'image_url', image_url: { url: 'x'.repeat(10000) } }]), 1024);
});

test('failed or oversized summaries do not silently discard history', async () => {
  const history = [{ role: 'user', content: '字'.repeat(11000) }, { role: 'assistant', content: '答' }];
  await assert.rejects(rules.compressHistory(async () => modelResult(''), history));
  await assert.rejects(rules.compressHistory(async () => modelResult('字'.repeat(2000)), history));
  await assert.rejects(rules.compressHistory(async () => { throw Error('offline'); }, history), /offline/);
  assert.equal(history[0].content.length, 11000);
});

test('an explicit cancellation updates the original agreement without promoting model memory', () => {
  const old = { longTerm: ['不喝咖啡'], relationshipMemory: ['一起看过日出'], continuity: { location: '车站', present: '我、林舟', pending: [{ id: 'sea', text: '下周去看海', status: 'open' }] } };
  const next = rules.applyContinuity(old, { scene: null, pendingUpdates: [{ id: 'sea', text: '下周去看海', status: 'cancelled', source: 'user', evidence: '取消去看海' }] }, '我们取消去看海，先回家。', '好的。');
  assert.equal(next.continuity.pending.length, 1);
  assert.equal(next.continuity.pending[0].status, 'cancelled');
  assert.equal(old.continuity.pending[0].status, 'open');
  assert.deepEqual(next.relationshipMemory, old.relationshipMemory);
  assert.deepEqual(next.longTerm, old.longTerm);
});

test('invalid evidence or unknown IDs reject the entire update, never partially mutate memory', () => {
  const memory = rules.normalizeMemory(null);
  const decision = { scene: { location: '海边', present: '我', source: 'user', evidence: '到了海边' }, pendingUpdates: [{ id: 'missing', text: '约定', status: 'done', source: 'assistant', evidence: '完成了' }] };
  assert.throws(() => rules.applyContinuity(memory, decision, '到了海边', '完成了'), /不存在/);
  assert.equal(memory.continuity.location, '');
  assert.throws(() => rules.applyContinuity(memory, { scene: { location: '海边', present: '我', source: 'user', evidence: '虚构原文' }, pendingUpdates: [] }, '你好', '你好'), /依据/);
});

test('continuity failure preserves memory and reports a visible warning while free chat refuses scene updates', async () => {
  const memory = { longTerm: ['原始事实'] };
  const failed = await rules.updateContinuity(async () => { throw Error('offline'); }, memory, '你好', '你好', 'story');
  assert.equal(failed.memory, memory);
  assert.ok(failed.continuityWarning);
  const invalid = await rules.updateContinuity(async () => modelResult(JSON.stringify({ scene: { location: '海边', present: '我', source: 'user', evidence: '到了海边' }, pendingUpdates: [] })), memory, '到了海边', '你好', 'free');
  assert.equal(invalid.memory, memory);
  assert.ok(invalid.continuityWarning);
});

test('prompt uses confirmed stage, corrected state and style examples without fixed user gender', () => {
  const prompt = buildSystemPrompt({ basicInfo: { name: '林舟', userNickname: '朋友' }, relationshipState: { affection: 99, relationshipStage: 'familiar', mood: 0 },
    exampleDialogue: '用户：你好\n角色：坐一会儿吧。', memory: { continuity: { location: '车站', present: '我、林舟', pending: [{ text: '去海边', status: 'cancelled' }] } } }, { mode: 'story' });
  assert.match(prompt, /已取消.*去海边/);
  assert.match(prompt, /当前地点：车站/);
  assert.match(prompt, /不是本存档发生的事件/);
  assert.match(prompt, /不代表承诺或关系升级/);
  assert.doesNotMatch(prompt, /夫人|记挂着她|主动表达关心和依恋/);
});

test('auxiliary deadline aborts its underlying request instead of retrying it', async () => {
  const { boundedCall } = require('@vfriend/core/rules');
  let calls = 0;
  await assert.rejects(boundedCall(async (_, options) => {
    calls++;
    assert.equal(options.maxRetries, 0);
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('deadline', 'AbortError')), { once: true }));
  }, [], { timeout: 10 }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
