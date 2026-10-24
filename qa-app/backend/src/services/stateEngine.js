const { callLLM } = require('./llmClient');
const { analyzeImpact, updateStateObject } = require('../../../shared/runtime.cjs');
async function analyzeMessageImpact(message, characterName, currentState, characterPrefs = {}, history = [], settings = {}, options = {}) {
  return analyzeImpact(callLLM, message, {
    ...settings, basicInfo: settings.basicInfo || { name: characterName },
    relationshipState: currentState, preferences: characterPrefs,
  }, history, options);
}
module.exports = { analyzeMessageImpact, updateStateObject };
