const store = require('../services/conversationStore');
const { summarizeChapter } = require('../services/historyManager');
const { adviseNextChapter } = require('../services/chapterAdvisor');
const { adviseGoalAchievement } = require('../services/goalAdvisor');
const { createConversationWorkflow } = require('@vfriend/core/workflow');

const workflow = createConversationWorkflow({ store, summarize: summarizeChapter, adviseChapter: adviseNextChapter, adviseGoal: adviseGoalAchievement });
const respond = (operation, { status = 200, property, missing } = {}) => async (req, res, next) => {
  try {
    const result = await operation(req);
    if (missing && (result == null || result === false)) {
      const error = new Error(missing); error.status = 404; throw error;
    }
    if (status === 204) return res.status(status).end();
    res.status(status).json(property ? { [property]: result } : result);
  } catch (error) {
    if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: { message: '存档操作与现有数据冲突' } });
    }
    next(error);
  }
};
module.exports = {
  list: respond(() => store.listRelationships().flatMap(relationship => relationship.chapters).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), { property: 'conversations' }),
  listRelationships: respond(() => store.listRelationships(), { property: 'relationships' }),
  getRelationship: respond(req => store.getRelationship(req.params.id), { property: 'relationship', missing: '存档不存在' }),
  createRelationship: respond(req => store.createRelationship(req.body || {}), { status: 201 }),
  get: respond(req => store.getConversation(req.params.id), { property: 'conversation', missing: '会话不存在' }),
  create: respond(req => workflow.createConversation(req.body || {}), { property: 'conversation', status: 201 }),
  update: respond(req => store.updateConversation(req.params.id, req.body || {}), { property: 'conversation', missing: '会话不存在' }),
  rename: respond(req => store.renameConversation(req.params.id, req.body?.title), { property: 'conversation', missing: '会话不存在' }),
  renameRelationship: respond(req => store.renameRelationship(req.params.id, req.body?.title), { property: 'relationship', missing: '存档不存在' }),
  updateRelationshipSettings: respond(req => store.updateRelationshipSettings(req.params.id, req.body || {}), { property: 'relationship', missing: '存档不存在' }),
  remove: respond(req => store.deleteConversation(req.params.id), { status: 204, missing: '会话不存在' }),
  removeRelationship: respond(req => store.deleteRelationship(req.params.id), { status: 204, missing: '存档不存在' }),
  createNextChapter: respond(req => workflow.createNextChapter(req.params.id, req.body || {}), { status: 201 }),
  suggestNextChapter: respond(req => workflow.requestChapterSuggestion(req.params.id, req.body || {})),
  suggestGoalAchievement: respond(req => workflow.requestGoalSuggestion(req.params.id, req.body || {})),
  fork: respond(req => workflow.forkConversation(req.params.id, req.body || {}), { status: 201 }),
  exportArchives: respond(() => store.exportArchives()),
  importArchives: respond(req => store.importArchives(req.body), { status: 201 }),
  listTrash: respond(() => store.listTrash()),
  restoreArchive: respond(req => store.restoreArchive(req.params.id), { missing: '回收站中的存档不存在' }),
};
