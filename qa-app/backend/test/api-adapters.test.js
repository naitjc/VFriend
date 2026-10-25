const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const url = relative => pathToFileURL(path.resolve(__dirname, relative)).href;

test('Web model operations forward current credentials, while archive requests carry none', async () => {
  const { createWebApi } = await import(url('../../frontend-vue/src/api/web.js'));
  const calls = [];
  const headers = { 'X-Model-API-Key': 'fixture-key', 'X-Model-Name': 'fixture' };
  const api = createWebApi({ http: { request: async (path, options) => { calls.push({ path, options }); return { reply: '预览' }; } }, modelHeaders: () => ({ ...headers }) });
  for (const operation of ['createNextChapter', 'requestChapterSuggestion', 'requestGoalSuggestion', 'forkConversation']) await api[operation]('id/with space', { sourceConversationId: 'source' });
  await api.previewCharacter({}, '你好');
  await api.testWebModelConnection({});
  assert.equal(calls.length, 6);
  for (const call of calls) { assert.deepEqual(call.options.headers, headers); assert.ok(call.options.timeoutMs >= 20000); }
  assert.match(calls[0].path, /id%2Fwith%20space/);
  await api.exportArchives(); await api.importArchives({}); await api.listRelationships();
  for (const call of calls.slice(6)) assert.equal(call.options?.headers, undefined);
  headers['X-Model-Name'] = 'new-model';
  await api.requestGoalSuggestion('id', {});
  assert.equal(calls.at(-1).options.headers['X-Model-Name'], 'new-model');
});
test('native API rejects a foreign source before loading native model code', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend-vue/src/api/native.js'), 'utf8').replace("'rp-workflow'", JSON.stringify(url('../../shared/conversationWorkflow.cjs')));
  const { createNativeApi } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  let runtimeLoads = 0;
  const api = createNativeApi({ loadStore: async () => ({ getConversation: () => ({ id: 'source', relationshipId: 'other', status: 'open' }) }), loadRuntime: () => { runtimeLoads++; } });
  await assert.rejects(api.createNextChapter('story', { sourceConversationId: 'source' }), { status: 400 });
  await assert.rejects(api.requestGoalSuggestion('story', { sourceConversationId: 'source' }), { status: 400 });
  assert.equal(runtimeLoads, 0);
});
