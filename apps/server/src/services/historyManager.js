const { callLLM } = require('./llmClient');
const { compressHistory } = require('@vfriend/core/rules');
const advisors = require('@vfriend/core/advisors');
module.exports = {
  compressHistoryIfNeeded: (history, prompt, question, options) => compressHistory(callLLM, history, prompt, question, options),
  summarizeChapter: history => advisors.summarizeChapter(callLLM, history),
};
