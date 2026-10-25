const { callLLM } = require("./llmClient");
const { createAdvisors, MIN_DIALOGUE_MESSAGES, dialogueMessages, parseChapterDecision } = require("../../../shared/advisors.cjs");
module.exports = { adviseNextChapter: createAdvisors(callLLM).adviseNextChapter, MIN_DIALOGUE_MESSAGES, dialogueMessages, parseChapterDecision };
