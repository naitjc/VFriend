const { callLLM } = require('./llmClient');
const { compressHistory } = require('../../../shared/runtime.cjs');
const advisors = require('../../../shared/advisors.cjs');
module.exports = {
  compressHistoryIfNeeded: (history, prompt, question, options) => compressHistory(callLLM, history, prompt, question, options),
  summarizeChapter: history => advisors.summarizeChapter(callLLM, history),
};
