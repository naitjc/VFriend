const { callLLM } = require("./llmClient");
const { createAdvisors, MIN_DIALOGUE_MESSAGES, goalEvidenceMessages, parseGoalDecision } = require('@vfriend/core/advisors');
module.exports = { adviseGoalAchievement: createAdvisors(callLLM).adviseGoalAchievement, MIN_DIALOGUE_MESSAGES, goalEvidenceMessages, parseGoalDecision };
