const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationWorkflow } = require('../../shared/conversationWorkflow.cjs');
const { patchStoryGoal } = require('../../shared/relationships.cjs');
function fixture() {
  const calls = [];
  const chapter = { id: 'source', relationshipId: 'story', status: 'open', chapterNumber: 2, title: '车站', preview: '等待列车', snapshot: { apiHistory: [{ role: 'user', content: '出发' }], conversationHistory: [] } };
  const relationship = { id: 'story', mode: 'story', goal: '找到星图', goalStatus: 'active', chapters: [chapter] };
  const store = {
    getConversation: id => id === chapter.id ? chapter : null,
    getRelationship: () => relationship,
    createNextChapter: (...args) => { calls.push(args); return { conversation: { id: 'next' } }; },
    forkConversation: (...args) => { calls.push(args); return { conversation: { id: 'fork' } }; },
  };
  const workflow = createConversationWorkflow({ store, summarize: async () => { calls.push('summary'); return '章节摘要'; }, adviseChapter: async input => { calls.push(input); return { suggestion: null }; }, adviseGoal: async input => { calls.push(input); return { suggestion: null }; } });
  return { workflow, chapter, relationship, calls };
}
test('story operations reject foreign, missing, closed and free-mode sources before any model call', async () => {
  for (const name of ['createNextChapter', 'requestChapterSuggestion', 'requestGoalSuggestion']) {
    const { workflow, chapter, relationship, calls } = fixture();
    await assert.rejects(workflow[name]('other', { sourceConversationId: chapter.id }), { status: 400 });
    await assert.rejects(workflow[name]('story', { sourceConversationId: 'missing' }), { status: 404 });
    chapter.status = 'closed';
    await assert.rejects(workflow[name]('story', { sourceConversationId: chapter.id }), { status: 409 });
    chapter.status = 'open'; relationship.mode = 'free';
    await assert.rejects(workflow[name]('story', { sourceConversationId: chapter.id }), { status: 409 });
    assert.deepEqual(calls, []);
  }
});
test('chapter summaries prefer supplied or stored text; forks and new chapters share the fallback', async () => {
  const { workflow, chapter, calls } = fixture();
  await workflow.createNextChapter('story', { sourceConversationId: chapter.id, summary: '手动摘要' });
  assert.equal(calls[0][1].summary, '手动摘要');
  chapter.status = 'closed'; chapter.summary = '已保存摘要';
  await workflow.forkConversation(chapter.id);
  assert.equal(calls[1][1].summary, '已保存摘要');
  assert.equal(calls.includes('summary'), false);
  chapter.summary = '';
  const failing = createConversationWorkflow({ store: { getConversation: () => chapter, forkConversation: (_, payload) => payload }, summarize: async () => { throw Error('offline'); } });
  assert.match((await failing.forkConversation(chapter.id)).summary, /完整内容保留在源章节/);
});
test('achieved goals do not call the adviser; changing a goal resets its achievement time', async () => {
  const { workflow, chapter, relationship, calls } = fixture();
  relationship.goalStatus = 'achieved';
  assert.deepEqual(await workflow.requestGoalSuggestion('story', { sourceConversationId: chapter.id }), { checkedMessageCount: 0, suggestion: null });
  assert.deepEqual(calls, []);
  const now = '2026-10-25T12:00:00.000Z';
  const patched = patchStoryGoal({ ...relationship, goalAchievedAt: '2025-01-01', goalResolution: '旧目标' }, { goal: '新目标', goalStatus: 'achieved', goalResolution: '新的证据' }, now);
  assert.equal(patched.goalAchievedAt, now);
});
