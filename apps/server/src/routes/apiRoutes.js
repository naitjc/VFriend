const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const conversationController = require("../controllers/conversationController");
const rateLimiter = require("../middleware/rateLimiter");

router.get('/archives/export', conversationController.exportArchives);
router.post('/archives/import', conversationController.importArchives);
router.get('/archives/trash', conversationController.listTrash);
router.post('/archives/trash/:id/restore', conversationController.restoreArchive);
router.get("/health", (req, res) => res.json({ status: "ok" }));
router.post("/qa/stream", chatController.handleChatStream);
router.post("/character/preview", rateLimiter, chatController.previewCharacter);
router.put("/model", chatController.updateModel);
router.post("/model/test", rateLimiter, chatController.testModel);
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
  rateLimiter,
  conversationController.createNextChapter,
);
router.get("/conversations", conversationController.list);
router.post("/conversations", conversationController.create);
router.get("/conversations/:id", conversationController.get);
router.put("/conversations/:id", conversationController.update);
router.patch("/conversations/:id/title", conversationController.rename);
router.post("/conversations/:id/fork", rateLimiter, conversationController.fork);
router.delete("/conversations/:id", conversationController.remove);

module.exports = router;
