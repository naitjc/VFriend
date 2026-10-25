// Business operations shared by Express and the Android adapter; IO is injected.
const fail = (message, status) => { const error = new Error(message); error.status = status; throw error; };

function createConversationWorkflow({ store, summarize, adviseChapter, adviseGoal }) {
  async function source(id, relationshipId, { open = false, story = false } = {}) {
    if (typeof id !== 'string' || !id) fail('源章节不存在', 404);
    const chapter = await store.getConversation(id);
    if (!chapter) fail('源章节不存在', 404);
    if (relationshipId && chapter.relationshipId !== relationshipId) fail('源章节不属于当前关系', 400);
    if (open && chapter.status !== 'open') fail('只有当前开放章节可以执行此操作', 409);
    if (story) {
      const relationship = await store.getRelationship(chapter.relationshipId);
      if (relationship?.mode !== 'story') fail('自由模式不使用章节或故事目标操作', 409);
      return { chapter, relationship };
    }
    return { chapter };
  }
  async function summary(chapter, supplied) {
    const existing = String(supplied || chapter.summary || '').trim();
    if (existing) return existing;
    try { return await summarize(chapter.snapshot?.apiHistory || []); }
    catch {
      return chapter.preview
        ? `本章最后围绕“${chapter.preview.slice(0, 120)}”展开，完整内容保留在源章节。`
        : '本章完整内容保留在源章节。';
    }
  }
  return {
    async createNextChapter(relationshipId, input = {}) {
      const { chapter } = await source(input.sourceConversationId, relationshipId, { open: true, story: true });
      return store.createNextChapter(chapter.id, { title: input.title, summary: await summary(chapter, input.summary) });
    },
    async requestChapterSuggestion(relationshipId, input = {}) {
      const { chapter, relationship } = await source(input.sourceConversationId, relationshipId, { open: true, story: true });
      return adviseChapter({ history: chapter.snapshot?.conversationHistory || [], goal: relationship.goal, chapterNumber: chapter.chapterNumber, chapterTitle: chapter.title });
    },
    async requestGoalSuggestion(relationshipId, input = {}) {
      const { chapter, relationship } = await source(input.sourceConversationId, relationshipId, { open: true, story: true });
      if (relationship.goalStatus === 'achieved') return { checkedMessageCount: 0, suggestion: null };
      return adviseGoal({ history: chapter.snapshot?.apiHistory || [], goal: relationship.goal });
    },
    async forkConversation(id, input = {}) {
      const { chapter } = await source(id);
      return store.forkConversation(id, { relationshipTitle: input.relationshipTitle, title: input.title, summary: await summary(chapter, input.summary) });
    },
    async createConversation(input = {}) {
      if (!input.relationshipId) return (await store.createRelationship(input)).conversation;
      const relationship = await store.getRelationship(input.relationshipId);
      if (!relationship) fail('存档不存在', 404);
      const id = input.sourceConversationId || relationship.chapters.find(chapter => chapter.status === 'open')?.id;
      const { chapter } = await source(id, relationship.id, { open: true, story: true });
      return (await store.createNextChapter(chapter.id, input)).conversation;
    },
  };
}
module.exports = { createConversationWorkflow };
