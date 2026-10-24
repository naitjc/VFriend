const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const conversationController = require("../controllers/conversationController");
const rateLimiter = require("../middleware/rateLimiter");

const archiveAction = (action, status = 200) => (req, res, next) => {
  try { res.status(status).json(action(req)); } catch (error) { next(error); }
};
router.get('/archives/export', archiveAction(() => conversationController.exportArchives()));
router.post('/archives/import', archiveAction(req => conversationController.importArchives(req.body), 201));
router.get('/archives/trash', archiveAction(() => conversationController.listTrash()));
router.post('/archives/trash/:id/restore', archiveAction(req => {
  const result = conversationController.restoreArchive(req.params.id);
  if (!result) { const error = new Error('回收站中的存档不存在'); error.status = 404; throw error; }
  return result;
}));
router.get("/health", (req, res) => res.json({ status: "ok" }));
router.post("/qa/stream", chatController.handleChatStream);
router.post("/character/preview", rateLimiter, chatController.previewCharacter);
router.put("/model", chatController.updateModel);
router.post("/model/test", chatController.testModel);
router.get("/relationships", conversationController.listRelationships);
router.post("/relationships", conversationController.createRelationship);
router.get("/relationships/:id", conversationController.getRelationship);
router.patch(
  "/relationships/:id/title",
  conversationController.renameRelationship,
);
router.patch(
  "/relationships/:id/settings",
  conversationController.updateRelationshipSettings,
);
router.delete("/relationships/:id", conversationController.removeRelationship);
router.post(
  "/relationships/:id/goal-suggestion",
  rateLimiter,
  conversationController.suggestGoalAchievement,
);
router.post(
  "/relationships/:id/chapter-suggestion",
  rateLimiter,
  conversationController.suggestNextChapter,
);
router.post(
  "/relationships/:id/chapters",
  conversationController.createNextChapter,
);
router.get("/conversations", conversationController.list);
router.post("/conversations", conversationController.create);
router.get("/conversations/:id", conversationController.get);
router.put("/conversations/:id", conversationController.update);
router.patch("/conversations/:id/title", conversationController.rename);
router.post("/conversations/:id/fork", conversationController.fork);
router.delete("/conversations/:id", conversationController.remove);

module.exports = router;
