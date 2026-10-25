const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
process.env.SQLITE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rp-platform-')), 'test.db');
const web = require('../src/services/conversationStore');
const url = relative => pathToFileURL(path.resolve(__dirname, relative)).href;
let source = fs.readFileSync(path.resolve(__dirname, '../../frontend-vue/src/services/nativeConversationStore.js'), 'utf8');
source = source.replace("'rp-relationships'", JSON.stringify(url('../../shared/relationships.cjs')))
  .replace("'rp-snapshots'", JSON.stringify(url('../../shared/snapshots.cjs')))
  .replace("'rp-archives'", JSON.stringify(url('../../shared/archives.cjs')))
  .replace("'rp-core'", JSON.stringify(url('../../shared/runtime.cjs')))
  .replace("'@capacitor-community/sqlite'", JSON.stringify(url('./helpers/native-sqlite.mjs')));
const native = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function snapshot() {
  return { characterSettings: { basicInfo: { name: '林舟' }, relationshipState: { affection: 95, mood: 35, relationshipStage: 'intimate', confirmedStage: 'intimate', stageEvidence: '双方表达了承诺' }, memory: { longTerm: ['事实'], continuity: { location: '旧车站', present: '两人', pending: [{ id: 'sea', text: '去海边', status: 'open' }] } } }, conversationHistory: [], apiHistory: [] };
}
for (const [name, platform] of [['Web', Promise.resolve(web)], ['Android SQL adapter', native]]) {
  test(`${name}: zero initial affection is preserved and high initial scores cannot grant intimacy`, async () => {
    const store = await platform;
    const zero = await store.createRelationship({ mode: 'free', snapshot: snapshot(), initialAffection: 0, initialMood: -7 });
    const persisted = await store.getConversation(zero.conversation.id);
    assert.equal(persisted.snapshot.characterSettings.relationshipState.affection, 0);
    assert.equal(persisted.snapshot.characterSettings.relationshipState.mood, -7);
    assert.equal(persisted.snapshot.characterSettings.relationshipState.relationshipStage, 'stranger');
    assert.equal(persisted.snapshot.characterSettings.relationshipState.confirmedStage, undefined);
    const empty = await store.createRelationship({ mode: 'free', snapshot: snapshot(), initialAffection: null, initialMood: 0 });
    assert.equal(empty.conversation.snapshot.characterSettings.relationshipState.affection, 10);
    const high = await store.createRelationship({ mode: 'free', snapshot: snapshot(), initialAffection: 100 });
    assert.equal(high.conversation.snapshot.characterSettings.relationshipState.relationshipStage, 'familiar');
  });
  test(`${name}: inherited state retains commitment, mood and memory`, async () => {
    const store = await platform;
    const original = snapshot();
    const created = await store.createRelationship({ mode: 'story', goal: '找到星图', snapshot: original, inheritedSummary: '前情', initialAffection: 95 });
    assert.deepEqual(created.conversation.snapshot.characterSettings, original.characterSettings);
  });
  test(`${name}: forks use the selected chapter's scene and pending status, never future changes`, async () => {
    const store = await platform;
    const created = await store.createRelationship({ mode: 'story', goal: '找到星图', snapshot: snapshot(), inheritedSummary: '前情' });
    const next = await store.createNextChapter(created.conversation.id, { summary: '仍在旧车站' });
    const changed = structuredClone(next.conversation.snapshot);
    changed.characterSettings.memory.continuity.location = '海边';
    changed.characterSettings.memory.continuity.pending[0].status = 'done';
    await store.updateConversation(next.conversation.id, { snapshot: changed });
    const fork = await store.forkConversation(created.conversation.id, { summary: '分支' });
    const state = fork.conversation.snapshot.characterSettings;
    assert.equal(state.relationshipState.relationshipStage, 'intimate');
    assert.equal(state.relationshipState.mood, 35);
    assert.equal(state.memory.continuity.location, '旧车站');
    assert.equal(state.memory.continuity.pending[0].status, 'open');
    assert.equal((await store.getConversation(next.conversation.id)).snapshot.characterSettings.memory.continuity.location, '海边');
    await assert.rejects(async () => store.updateConversation(created.conversation.id, { snapshot: changed }));
  });
}

for (const [name, platform, otherPlatform] of [['Web', Promise.resolve(web), native], ['Android SQL adapter', native, Promise.resolve(web)]]) {
  test(`${name}: portable backup preserves all chapters, checkpoints and state without overwriting existing IDs`, async () => {
    const store = await platform;
    const other = await otherPlatform;
    const original = await store.createRelationship({ mode: 'story', goal: '找到星图', snapshot: snapshot(), inheritedSummary: '前情' });
    const next = await store.createNextChapter(original.conversation.id, { summary: '第一章回顾' });
    await store.updateRelationshipSettings(original.relationship.id, { goalStatus: 'achieved', goalResolution: '已找到星图' });
    const backup = await store.exportArchives(original.relationship.id);
    const imported = await other.importArchives(JSON.parse(JSON.stringify(backup)));
    assert.equal(imported.importedCount, 1);
    assert.notEqual(imported.relationshipId, original.relationship.id);
    const restored = await other.getRelationship(imported.relationshipId);
    assert.equal(restored.goalStatus, 'achieved');
    assert.equal(restored.goalResolution, '已找到星图');
    assert.equal(restored.chapters.length, 2);
    assert.equal(restored.chapters[0].status, 'closed');
    const first = await other.getConversation(restored.chapters[0].id);
    assert.equal(first.summary, '第一章回顾');
    assert.deepEqual(first.snapshot.characterSettings, original.conversation.snapshot.characterSettings);
    const current = await other.getConversation(restored.chapters[1].id);
    assert.equal(current.snapshot.relationshipId, restored.id);
    assert.deepEqual(current.snapshot.apiHistory, next.conversation.snapshot.apiHistory);
    assert.ok(await store.getConversation(original.conversation.id));
    const again = await other.importArchives(backup);
    assert.notEqual(again.relationshipId, imported.relationshipId);
  });
  test(`${name}: invalid backup is rejected atomically, deletion is recoverable`, async () => {
    const store = await platform;
    const created = await store.createRelationship({ mode: 'free', snapshot: snapshot(), inheritedSummary: '前情' });
    const backup = await store.exportArchives(created.relationship.id);
    const invalid = structuredClone(backup);
    invalid.conversations[0].snapshot_json = '{bad json';
    const count = (await store.listRelationships()).length;
    await assert.rejects(async () => store.importArchives(invalid), /备份格式/);
    assert.equal((await store.listRelationships()).length, count);
    await store.deleteRelationship(created.relationship.id);
    assert.equal(await store.getRelationship(created.relationship.id), null);
    const trash = await store.listTrash();
    const deleted = trash.find(item => item.title === created.relationship.title);
    assert.ok(deleted);
    const result = await store.restoreArchive(deleted.id);
    const restored = await store.getRelationship(result.relationshipId);
    const conversation = await store.getConversation(restored.chapters[0].id);
    assert.deepEqual(conversation.snapshot.characterSettings.memory, created.conversation.snapshot.characterSettings.memory);
    assert.equal((await store.listTrash()).some(item => item.id === deleted.id), false);
    assert.equal(await store.restoreArchive(deleted.id), null);
  });
}

test('Android serializes concurrent imports and consistent backup reads on its single SQLite connection', async () => {
  const store = await native;
  const original = await store.createRelationship({ mode: 'free', snapshot: snapshot(), inheritedSummary: '前情' });
  const backup = await store.exportArchives(original.relationship.id);
  const [first, second, exported] = await Promise.all([
    store.importArchives(backup), store.importArchives(backup), store.exportArchives(original.relationship.id),
  ]);
  assert.notEqual(first.relationshipId, second.relationshipId);
  assert.deepEqual(exported.conversations, backup.conversations);
  assert.ok(await store.getRelationship(first.relationshipId));
  assert.ok(await store.getRelationship(second.relationshipId));
});

test('Android restores a trash entry at most once under concurrent calls', async () => {
  const store = await native;
  const created = await store.createRelationship({ mode: 'free', relationshipTitle: '并发恢复测试', snapshot: snapshot() });
  await store.deleteRelationship(created.relationship.id);
  const entry = (await store.listTrash()).find(item => item.title === '并发恢复测试');
  const results = await Promise.all([store.restoreArchive(entry.id), store.restoreArchive(entry.id)]);
  assert.equal(results.filter(Boolean).length, 1);
});
test('Android closes a chapter once and rejects saves queued behind closure', async () => {
  const store = await native;
  const created = await store.createRelationship({ mode: 'story', goal: '找到星图', snapshot: snapshot() });
  const results = await Promise.allSettled([
    store.createNextChapter(created.conversation.id, { summary: '回顾' }),
    store.createNextChapter(created.conversation.id, { summary: '重复回顾' }),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await store.getRelationship(created.relationship.id)).chapters.length, 2);
  await assert.rejects(store.updateConversation(created.conversation.id, { snapshot: snapshot() }), /只读/);
});

for (const [name, platform] of [['Web', Promise.resolve(web)], ['Android SQL adapter', native]]) {
  test(`${name}: concurrent goal edits retain the new goal when confirming achievement`, async () => {
    const store = await platform;
    const created = await store.createRelationship({ mode: 'story', goal: '旧目标', snapshot: snapshot() });
    await Promise.all([
      store.updateRelationshipSettings(created.relationship.id, { goal: '新目标' }),
      store.updateRelationshipSettings(created.relationship.id, { goalStatus: 'achieved', goalResolution: '新的证据' }),
    ]);
    const result = await store.getRelationship(created.relationship.id);
    assert.equal(result.goal, '新目标');
    assert.equal(result.goalStatus, 'achieved');
  });
  test(`${name}: invalid backup topology and malformed character snapshots never import partially`, async () => {
    const store = await platform;
    const created = await store.createRelationship({ mode: 'story', goal: '目标', snapshot: snapshot() });
    await store.createNextChapter(created.conversation.id, { summary: '前章' });
    const backup = await store.exportArchives(created.relationship.id);
    const before = (await store.listRelationships()).length;
    const invalid = structuredClone(backup);
    invalid.conversations[0].status = 'open'; invalid.conversations[1].status = 'closed';
    await assert.rejects(async () => store.importArchives(invalid), /备份格式/);
    const malformed = structuredClone(backup);
    malformed.relationships[0].character_snapshot_json = '[]';
    await assert.rejects(async () => store.importArchives(malformed), /备份格式/);
    assert.equal((await store.listRelationships()).length, before);
  });
}
