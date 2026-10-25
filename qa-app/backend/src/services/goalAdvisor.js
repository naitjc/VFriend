const { callLLM } = require("./llmClient");
const { createAdvisors, MIN_DIALOGUE_MESSAGES, goalEvidenceMessages, parseGoalDecision } = require("../../../shared/advisors.cjs");
module.exports = { adviseGoalAchievement: createAdvisors(callLLM).adviseGoalAchievement, MIN_DIALOGUE_MESSAGES, goalEvidenceMessages, parseGoalDecision };
