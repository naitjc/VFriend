const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.SQLITE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vfriend-http-')), 'test.db');
const { createApp } = require('../apps/server/app');
let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => server.close(resolve)));

test('HTTP health and archive metadata routes work without model requests', async () => {
  assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
  const backup = await (await fetch(base + '/archives/export')).json();
  assert.equal(backup.format, 'chat-rp-backup');
  assert.deepEqual(backup.relationships, []);
});
test('HTTP rejects malformed chat and invalid backups before any model request', async () => {
  for (const [route, data] of [['/qa/stream', { question: 123 }], ['/archives/import', { format: 'bad' }]]) {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error.message, 'string');
  }
});

test('HTTP story workflow validates ownership and rejects closed sources without invoking a model', async () => {
  const snapshot = { characterSettings: { basicInfo: { name: '流程测试角色' } }, conversationHistory: [], apiHistory: [] };
  const create = async () => (await (await fetch(base + '/relationships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'story', goal: '目标', snapshot }) })).json());
  const first = await create(); const second = await create();
  const post = (relationship, payload, suffix = 'chapters') => fetch(`${base}/relationships/${relationship.id}/${suffix}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal((await post(first.relationship, { sourceConversationId: second.conversation.id, summary: '已提供摘要' })).status, 400);
  const next = await post(first.relationship, { sourceConversationId: first.conversation.id, summary: '已提供摘要' });
  assert.equal(next.status, 201);
  assert.equal((await next.json()).conversation.chapterNumber, 2);
  assert.equal((await post(first.relationship, { sourceConversationId: first.conversation.id }, 'chapter-suggestion')).status, 409);
  assert.equal((await post(first.relationship, {}, 'goal-suggestion')).status, 404);
});
