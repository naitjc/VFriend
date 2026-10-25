const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Android model validation never saves credentials; explicit save retains the fixed model and legacy key', async () => {
  const writes = [];
  const stub = 'data:text/javascript,' + encodeURIComponent('export const SecureStorage = { get: async () => null, set: (...args) => globalThis.__modelSettingWrites.push(args) }');
  globalThis.__modelSettingWrites = writes;
  const url = relative => pathToFileURL(path.resolve(__dirname, relative)).href;
  const source = fs.readFileSync(path.resolve(__dirname, '../apps/client/src/services/nativeModelSettings.js'), 'utf8')
    .replace("'@vfriend/core/model-settings'", JSON.stringify(url('../packages/core/model-settings.cjs')))
    .replace("'@aparajita/capacitor-secure-storage'", JSON.stringify(stub))
    .replace("'./nativeModelConfig'", JSON.stringify(url('../apps/client/src/services/nativeModelConfig.js')));
  try {
    const settings = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const draft = { apiURL: ' https://example.com/v1/// ', apiKey: ' fixture-key ', model: 'override' };
    const normalized = settings.normalizeNativeModelSettings(draft);
    assert.deepEqual(normalized, { apiURL: 'https://example.com/v1', apiKey: 'fixture-key' });
    assert.deepEqual(writes, []);
    assert.throws(() => settings.normalizeNativeModelSettings({ ...draft, apiURL: 'http://example.com' }), /https/);
    const saved = await settings.saveNativeModelSettings(draft);
    assert.equal(saved.model, 'DeepSeek-V4-Flash');
    assert.deepEqual(writes, [['chat-@vfriend/core/model-settings', normalized]]);
    assert.equal((await settings.loadNativeModelSettings()).model, saved.model);
  } finally { delete globalThis.__modelSettingWrites; }
});
