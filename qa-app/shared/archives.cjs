// Portable storage format shared by the Web and native SQLite adapters.
const COLUMNS = {
  relationships: ['id', 'title', 'title_is_custom', 'mode', 'goal', 'goal_status', 'goal_achieved_at', 'goal_resolution', 'character_id', 'character_name', 'character_snapshot_json', 'relationship_state_json', 'memory_json', 'initial_state_json', 'initial_memory_json', 'forked_from_relationship_id', 'forked_from_conversation_id', 'created_at', 'updated_at'],
  conversations: ['id', 'relationship_id', 'chapter_number', 'status', 'title', 'title_is_custom', 'character_name', 'preview', 'summary', 'checkpoint_json', 'snapshot_json', 'created_at', 'updated_at', 'closed_at'],
};
const TRASH_SCHEMA = 'CREATE TABLE IF NOT EXISTS archive_trash (id TEXT PRIMARY KEY, title TEXT NOT NULL, deleted_at TEXT NOT NULL, bundle_json TEXT NOT NULL)';
const insertSQL = table => `INSERT INTO ${table} (${COLUMNS[table].join(', ')}) VALUES (${COLUMNS[table].map(() => '?').join(', ')})`;
const values = (table, row) => COLUMNS[table].map(key => row[key] ?? null);
const bundle = (relationships, conversations) => ({ format: 'chat-rp-backup', version: 1, exportedAt: new Date().toISOString(), relationships, conversations });
function prepareImport(input, uuid) {
  const fail = () => { const error = new Error('备份格式无效或章节数据不完整，未导入任何内容'); error.status = 400; throw error; };
  if (input?.format !== 'chat-rp-backup' || input.version !== 1 || !Array.isArray(input.relationships) || !Array.isArray(input.conversations)) fail();
  const result = { relationships: [], conversations: [] };
  const ids = { relationships: new Map(), conversations: new Map() };
  for (const table of Object.keys(COLUMNS)) {
    for (const row of input[table]) {
      if (!row || typeof row.id !== 'string' || !row.id || ids[table].has(row.id)) fail();
      ids[table].set(row.id, uuid());
      for (const key of COLUMNS[table]) {
        const value = row[key];
        if (value != null && !['string', 'number'].includes(typeof value)) fail();
        if (key.endsWith('_json') && value != null) { try { JSON.parse(value); } catch { fail(); } }
      }
      if (typeof row.title !== 'string' || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') fail();
    }
  }
  for (const row of input.relationships) {
    const chapters = input.conversations.filter(chapter => chapter.relationship_id === row.id);
    if (!['free', 'story'].includes(row.mode) || !chapters.length || !row.character_snapshot_json) fail();
    if (chapters.filter(chapter => chapter.status === 'open').length !== 1) fail();
    if (new Set(chapters.map(chapter => chapter.chapter_number)).size !== chapters.length) fail();
    result.relationships.push({ ...row, id: ids.relationships.get(row.id),
      forked_from_relationship_id: ids.relationships.get(row.forked_from_relationship_id) || null,
      forked_from_conversation_id: ids.conversations.get(row.forked_from_conversation_id) || null,
    });
  }
  for (const row of input.conversations) {
    const relationshipId = ids.relationships.get(row.relationship_id);
    if (!relationshipId || !['open', 'closed'].includes(row.status) || !Number.isInteger(row.chapter_number) || row.chapter_number < 1) fail();
    let snapshot;
    try { snapshot = JSON.parse(row.snapshot_json); } catch { fail(); }
    if (!snapshot || !snapshot.characterSettings?.basicInfo?.name || !Array.isArray(snapshot.conversationHistory) || !Array.isArray(snapshot.apiHistory)) fail();
    snapshot.relationshipId = relationshipId;
    snapshot.chapterNumber = row.chapter_number;
    result.conversations.push({ ...row, id: ids.conversations.get(row.id), relationship_id: relationshipId, snapshot_json: JSON.stringify(snapshot) });
  }
  return result;
}
module.exports = { COLUMNS, TRASH_SCHEMA, insertSQL, values, bundle, prepareImport };
