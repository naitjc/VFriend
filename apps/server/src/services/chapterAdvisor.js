const { callLLM } = require("./llmClient");
const { createAdvisors, MIN_DIALOGUE_MESSAGES, dialogueMessages, parseChapterDecision } = require('@vfriend/core/advisors');
module.exports = { adviseNextChapter: createAdvisors(callLLM).adviseNextChapter, MIN_DIALOGUE_MESSAGES, dialogueMessages, parseChapterDecision };
