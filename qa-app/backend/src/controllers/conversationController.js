const conversationStore = require("../services/conversationStore");
const { summarizeChapter } = require("../services/historyManager");
const { adviseNextChapter } = require("../services/chapterAdvisor");
const { adviseGoalAchievement } = require("../services/goalAdvisor");

function handleError(error, res, next) {
  if (error.code?.startsWith("SQLITE_CONSTRAINT")) {
    return res.status(409).json({ error: { message: "会话 ID 已存在" } });
  }
  if (error.status) {
    return res.status(error.status).json({ error: { message: error.message } });
  }
  return next(error);
}

function list(req, res, next) {
  try {
    const conversations = conversationStore
      .listRelationships()
      .flatMap((relationship) => relationship.chapters)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json({ conversations });
  } catch (error) {
    handleError(error, res, next);
  }
}

function listRelationships(req, res, next) {
  try {
    res.json({ relationships: conversationStore.listRelationships() });
  } catch (error) {
    handleError(error, res, next);
  }
}

function getRelationship(req, res, next) {
  try {
    const relationship = conversationStore.getRelationship(req.params.id);
    if (!relationship) {
      return res.status(404).json({ error: { message: "存档不存在" } });
    }
    res.json({ relationship });
  } catch (error) {
    handleError(error, res, next);
  }
}

function createRelationship(req, res, next) {
  try {
    const result = conversationStore.createRelationship(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    handleError(error, res, next);
  }
}

function get(req, res, next) {
  try {
    const conversation = conversationStore.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }
    res.json({ conversation });
  } catch (error) {
    handleError(error, res, next);
  }
}

function create(req, res, next) {
  try {
    const conversation = conversationStore.createConversation(req.body || {});
    res.status(201).json({ conversation });
  } catch (error) {
    handleError(error, res, next);
  }
}

function update(req, res, next) {
  try {
    const conversation = conversationStore.updateConversation(
      req.params.id,
      req.body || {},
    );
    if (!conversation) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }
    res.json({ conversation });
  } catch (error) {
    handleError(error, res, next);
  }
}

function rename(req, res, next) {
  try {
    const conversation = conversationStore.renameConversation(
      req.params.id,
      req.body?.title,
    );
    if (!conversation) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }
    res.json({ conversation });
  } catch (error) {
    handleError(error, res, next);
  }
}

function renameRelationship(req, res, next) {
  try {
    const relationship = conversationStore.renameRelationship(
      req.params.id,
      req.body?.title,
    );
    if (!relationship) {
      return res.status(404).json({ error: { message: "存档不存在" } });
    }
    res.json({ relationship });
  } catch (error) {
    handleError(error, res, next);
  }
}

function updateRelationshipSettings(req, res, next) {
  try {
    const relationship = conversationStore.updateRelationshipSettings(
      req.params.id,
      req.body || {},
    );
    if (!relationship) {
      return res.status(404).json({ error: { message: "存档不存在" } });
    }
    res.json({ relationship });
  } catch (error) {
    handleError(error, res, next);
  }
}

async function chapterSummary(conversation, suppliedSummary) {
  const supplied = String(suppliedSummary || "").trim();
  if (supplied) return supplied;
  if (conversation.summary) return conversation.summary;
  try {
    return await summarizeChapter(conversation.snapshot?.apiHistory || []);
  } catch {
    return conversation.preview
      ? `本章最后围绕“${conversation.preview.slice(0, 120)}”展开，完整内容保留在源章节。`
      : "本章完整内容保留在源章节。";
  }
}

async function createNextChapter(req, res, next) {
  try {
    const source = conversationStore.getConversation(
      req.body?.sourceConversationId,
    );
    if (!source) {
      return res.status(404).json({ error: { message: "源章节不存在" } });
    }
    if (source.relationshipId !== req.params.id) {
      return res.status(400).json({
        error: { message: "源章节不属于当前关系" },
      });
    }
    const summary = await chapterSummary(source, req.body?.summary);
    const result = conversationStore.createNextChapter(source.id, {
      title: req.body?.title,
      summary,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(error, res, next);
  }
}

async function suggestNextChapter(req, res, next) {
  try {
    const source = conversationStore.getConversation(
      req.body?.sourceConversationId,
    );
    if (!source) {
      return res.status(404).json({ error: { message: "源章节不存在" } });
    }
    if (source.relationshipId !== req.params.id) {
      return res.status(400).json({
        error: { message: "源章节不属于当前关系" },
      });
    }
    if (source.status !== "open") {
      return res.status(409).json({
        error: { message: "只有当前章节可以判断章节节奏" },
      });
    }

    const relationship = conversationStore.getRelationship(req.params.id);
    if (relationship?.mode !== "story") {
      return res.status(409).json({
        error: { message: "自由模式不使用章节建议" },
      });
    }

    const result = await adviseNextChapter({
      history: source.snapshot?.conversationHistory,
      goal: relationship.goal,
      chapterNumber: source.chapterNumber,
      chapterTitle: source.title,
    });
    res.json(result);
  } catch (error) {
    handleError(error, res, next);
  }
}

async function suggestGoalAchievement(req, res, next) {
  try {
    const source = conversationStore.getConversation(
      req.body?.sourceConversationId,
    );
    if (!source) {
      return res.status(404).json({ error: { message: "源章节不存在" } });
    }
    if (source.relationshipId !== req.params.id) {
      return res.status(400).json({
        error: { message: "源章节不属于当前关系" },
      });
    }
    if (source.status !== "open") {
      return res.status(409).json({
        error: { message: "只有当前章节可以判断故事目标" },
      });
    }

    const relationship = conversationStore.getRelationship(req.params.id);
    if (relationship?.mode !== "story") {
      return res.status(409).json({
        error: { message: "自由模式不使用故事目标" },
      });
    }
    if (relationship.goalStatus === "achieved") {
      return res.json({ checkedMessageCount: 0, suggestion: null });
    }

    const result = await adviseGoalAchievement({
      history: source.snapshot?.apiHistory,
      goal: relationship.goal,
    });
    res.json(result);
  } catch (error) {
    handleError(error, res, next);
  }
}

async function fork(req, res, next) {
  try {
    const source = conversationStore.getConversation(req.params.id);
    if (!source) {
      return res.status(404).json({ error: { message: "源章节不存在" } });
    }
    const summary = await chapterSummary(source, req.body?.summary);
    const result = conversationStore.forkConversation(source.id, {
      relationshipTitle: req.body?.relationshipTitle,
      title: req.body?.title,
      summary,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(error, res, next);
  }
}

function remove(req, res, next) {
  try {
    if (!conversationStore.deleteConversation(req.params.id)) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }
    res.status(204).end();
  } catch (error) {
    handleError(error, res, next);
  }
}

function removeRelationship(req, res, next) {
  try {
    if (!conversationStore.deleteRelationship(req.params.id)) {
      return res.status(404).json({ error: { message: "存档不存在" } });
    }
    res.status(204).end();
  } catch (error) {
    handleError(error, res, next);
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  rename,
  remove,
  listRelationships,
  getRelationship,
  createRelationship,
  renameRelationship,
  updateRelationshipSettings,
  removeRelationship,
  suggestGoalAchievement,
  suggestNextChapter,
  createNextChapter,
  fork,
};

Object.assign(module.exports, {
  exportArchives: conversationStore.exportArchives,
  importArchives: conversationStore.importArchives,
  listTrash: conversationStore.listTrash,
  restoreArchive: conversationStore.restoreArchive,
});
