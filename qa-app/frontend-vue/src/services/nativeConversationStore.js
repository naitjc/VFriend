import snapshots from 'rp-snapshots'
const { relationshipRuntimeFromSnapshot, checkpointFromSnapshot, prepareSnapshotForChapter } = snapshots
import archives from 'rp-archives'
import runtimeRules from 'rp-core'
const { initialRelationshipState } = runtimeRules
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

const DATABASE_NAME = 'chat_rp'
const sqlite = new SQLiteConnection(CapacitorSQLite)
let databasePromise = null
let transactionSequence = Promise.resolve()

const clone = (value) => (
  value == null ? value : JSON.parse(JSON.stringify(value))
)
const parseJson = (value, fallback = null) => {
  if (!value) return clone(fallback)
  try {
    return JSON.parse(value)
  } catch {
    return clone(fallback)
  }
}
const uuid = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const normalizedTitle = (value, fallback) => (
  String(value || fallback).trim().slice(0, 80) || fallback
)
const normalizedGoal = (value) => String(value || '').trim().slice(0, 500)

function normalizedGoalStatus(value) {
  if (value === 'active' || value === 'achieved') return value
  throw new Error('目标状态必须是 active 或 achieved')
}

function normalizedMode(value) {
  const mode = value == null ? 'free' : String(value).trim()
  if (mode === 'free' || mode === 'story') return mode
  throw new Error('聊天模式必须是 free 或 story')
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('会话快照不能为空')
  }
}


async function getDatabase() {
  if (databasePromise) return databasePromise
  databasePromise = (async () => {
    const existing = await sqlite.isConnection(DATABASE_NAME, false)
    const db = existing.result
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false)
    if (!(await db.isDBOpen()).result) await db.open()
    await db.execute(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        title_is_custom INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL DEFAULT 'free',
        goal TEXT NOT NULL DEFAULT '',
        goal_status TEXT NOT NULL DEFAULT 'active',
        goal_achieved_at TEXT,
        goal_resolution TEXT NOT NULL DEFAULT '',
        character_id TEXT NOT NULL DEFAULT '',
        character_name TEXT NOT NULL DEFAULT '',
        character_snapshot_json TEXT NOT NULL DEFAULT '{}',
        relationship_state_json TEXT,
        memory_json TEXT,
        initial_state_json TEXT,
        initial_memory_json TEXT,
        forked_from_relationship_id TEXT,
        forked_from_conversation_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        relationship_id TEXT NOT NULL,
        chapter_number INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'open',
        title TEXT NOT NULL,
        title_is_custom INTEGER NOT NULL DEFAULT 0,
        character_name TEXT NOT NULL DEFAULT '',
        preview TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        checkpoint_json TEXT,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT,
        FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_native_chapters
        ON conversations(relationship_id, chapter_number);
    `)
    await db.execute(archives.TRASH_SCHEMA)
    const relationshipColumns = new Set(
      ((await db.query('PRAGMA table_info(relationships)')).values || [])
        .map(column => column.name),
    )
    const missingColumns = [
      ['goal_status', "TEXT NOT NULL DEFAULT 'active'"],
      ['goal_achieved_at', 'TEXT'],
      ['goal_resolution', "TEXT NOT NULL DEFAULT ''"],
    ]
    for (const [name, definition] of missingColumns) {
      if (!relationshipColumns.has(name)) {
        await db.execute(`ALTER TABLE relationships ADD COLUMN ${name} ${definition};`)
      }
    }
    return db
  })()
  try {
    return await databasePromise
  } catch (error) {
    databasePromise = null
    throw error
  }
}

async function rows(statement, values = []) {
  const db = await getDatabase()
  const result = await db.query(statement, values)
  return result.values || []
}

function inTransaction(callback) {
  const operation = transactionSequence.catch(() => null).then(async () => {
    const db = await getDatabase()
    await db.beginTransaction()
    try {
      const result = await callback(db)
      await db.commitTransaction()
      return result
    } catch (error) {
      await db.rollbackTransaction().catch(() => null)
      throw error
    }
  })
  transactionSequence = operation
  return operation
}

function normalizeConversation(row, includeSnapshot = false) {
  if (!row) return null
  const conversation = {
    id: row.id,
    relationshipId: row.relationship_id,
    chapterNumber: Number(row.chapter_number || 1),
    status: row.status || 'open',
    title: row.title,
    titleCustomized: Boolean(row.title_is_custom),
    characterName: row.character_name,
    preview: row.preview || '',
    summary: row.summary || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || null,
  }
  if (includeSnapshot) {
    conversation.snapshot = parseJson(row.snapshot_json, {})
    conversation.checkpoint = parseJson(row.checkpoint_json, null)
  }
  return conversation
}

async function normalizeRelationship(row, includeChapters = true) {
  if (!row) return null
  const relationship = {
    id: row.id,
    title: row.title,
    titleCustomized: Boolean(row.title_is_custom),
    mode: row.mode === 'story' ? 'story' : 'free',
    goal: row.goal || '',
    goalStatus: row.goal_status === 'achieved' ? 'achieved' : 'active',
    goalAchievedAt: row.goal_achieved_at || null,
    goalResolution: row.goal_resolution || '',
    characterId: row.character_id,
    characterName: row.character_name,
    forkedFromRelationshipId: row.forked_from_relationship_id || null,
    forkedFromConversationId: row.forked_from_conversation_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (includeChapters) {
    relationship.chapters = (await rows(
      `SELECT id, relationship_id, chapter_number, status, title,
              title_is_custom, character_name, preview, summary,
              created_at, updated_at, closed_at
       FROM conversations WHERE relationship_id = ? ORDER BY chapter_number ASC`,
      [row.id],
    )).map(item => normalizeConversation(item))
  }
  return relationship
}

export async function listRelationships() {
  const relationshipRows = await rows('SELECT * FROM relationships ORDER BY updated_at DESC')
  return Promise.all(relationshipRows.map(row => normalizeRelationship(row)))
}

export async function getRelationship(id) {
  const [row] = await rows('SELECT * FROM relationships WHERE id = ?', [id])
  return normalizeRelationship(row)
}

export async function getConversation(id) {
  const [row] = await rows('SELECT * FROM conversations WHERE id = ?', [id])
  const conversation = normalizeConversation(row, true)
  if (!conversation) return null
  const [relationshipRow] = await rows(
    'SELECT * FROM relationships WHERE id = ?',
    [conversation.relationshipId],
  )
  conversation.relationship = await normalizeRelationship(relationshipRow, false)
  return conversation
}

export async function createRelationship(input = {}) {
  validateSnapshot(input.snapshot)
  const relationshipId = input.id || uuid()
  const conversationId = uuid()
  const now = new Date().toISOString()
  let runtime = relationshipRuntimeFromSnapshot(input.snapshot)
  const characterName = runtime.character.basicInfo?.name || input.characterName || '未命名角色'
  const characterId = runtime.character.id || input.characterId || characterName
  const mode = normalizedMode(input.mode)
  const goal = normalizedGoal(input.goal)
  if (mode === 'story' && !goal && !input.forkedFromRelationshipId) {
    throw new Error('故事模式必须设置最终目标')
  }
  const relationshipTitle = normalizedTitle(
    input.relationshipTitle,
    mode === 'story' ? `${characterName} · 主线故事` : `${characterName} · 自由聊天`,
  )
  const snapshot = clone(input.snapshot)
  if (!input.forkedFromRelationshipId && !input.inheritedSummary) {
    const state = initialRelationshipState(snapshot.characterSettings?.relationshipState,
      mode === 'story' ? 0 : input.initialAffection, input.initialMood)
    snapshot.characterSettings = { ...(snapshot.characterSettings || {}), relationshipState: state }
    snapshot.characterDefaults = { ...(snapshot.characterDefaults || {}), relationshipState: clone(state) }
  }
  runtime = relationshipRuntimeFromSnapshot(snapshot)
  snapshot.schemaVersion = 2
  snapshot.relationshipId = relationshipId
  snapshot.chapterNumber = 1

  await inTransaction(async (db) => {
    await db.run(
      `INSERT INTO relationships (
        id, title, title_is_custom, mode, goal, goal_status, goal_achieved_at,
        goal_resolution, character_id, character_name,
        character_snapshot_json, relationship_state_json, memory_json,
        initial_state_json, initial_memory_json, forked_from_relationship_id,
        forked_from_conversation_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        relationshipId, relationshipTitle, input.relationshipTitle ? 1 : 0,
        mode, goal, 'active', null, '', String(characterId || ''), String(characterName || ''),
        JSON.stringify(runtime.character), JSON.stringify(runtime.relationshipState),
        JSON.stringify(runtime.memory), JSON.stringify(runtime.initialState),
        JSON.stringify(runtime.initialMemory), input.forkedFromRelationshipId || null,
        input.forkedFromConversationId || null, now, now,
      ],
      false,
    )
    await db.run(
      `INSERT INTO conversations (
        id, relationship_id, chapter_number, status, title, title_is_custom,
        character_name, preview, summary, checkpoint_json, snapshot_json,
        created_at, updated_at, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversationId, relationshipId, 1, 'open',
        normalizedTitle(input.title, `与${characterName}的对话`), input.title ? 1 : 0,
        String(characterName || ''), String(input.preview || ''), '',
        JSON.stringify(checkpointFromSnapshot(snapshot)), JSON.stringify(snapshot),
        now, now, null,
      ],
      false,
    )
  })
  return {
    relationship: await getRelationship(relationshipId),
    conversation: await getConversation(conversationId),
  }
}

export async function updateConversation(id, input = {}) {
  const existing = await getConversation(id)
  if (!existing) return null
  if (existing.status !== 'open') throw new Error('过去章节为只读；如需继续，请创建分支故事')
  validateSnapshot(input.snapshot)
  const now = new Date().toISOString()
  const runtime = relationshipRuntimeFromSnapshot(input.snapshot)
  const characterName = runtime.character.basicInfo?.name || input.characterName || existing.characterName
  const characterId = runtime.character.id || characterName
  await inTransaction(async (db) => {
    const [current] = (await db.query('SELECT status FROM conversations WHERE id = ?', [id])).values || []
    if (current?.status !== 'open') throw new Error('过去章节为只读；如需继续，请创建分支故事')
    await db.run(
      `UPDATE conversations SET title = ?, title_is_custom = ?, character_name = ?,
       preview = ?, checkpoint_json = ?, snapshot_json = ?, updated_at = ? WHERE id = ?`,
      [
        normalizedTitle(input.title, existing.title),
        (input.titleCustomized ?? existing.titleCustomized) ? 1 : 0,
        String(characterName || ''), String(input.preview ?? existing.preview),
        JSON.stringify(checkpointFromSnapshot(input.snapshot, existing.summary)),
        JSON.stringify(input.snapshot), now, id,
      ],
      false,
    )
    await db.run(
      `UPDATE relationships SET character_id = ?, character_name = ?,
       character_snapshot_json = ?, relationship_state_json = ?, memory_json = ?,
       updated_at = ? WHERE id = ?`,
      [
        String(characterId || ''), String(characterName || ''),
        JSON.stringify(runtime.character), JSON.stringify(runtime.relationshipState),
        JSON.stringify(runtime.memory), now, existing.relationshipId,
      ],
      false,
    )
  })
  return getConversation(id)
}

export async function createNextChapter(sourceConversationId, input = {}) {
  let source = await getConversation(sourceConversationId)
  if (!source) throw new Error('源章节不存在')
  if (source.status !== 'open') throw new Error('只有当前开放章节可以开启下一章')
  const relationship = await getRelationship(source.relationshipId)
  if (relationship?.mode !== 'story') throw new Error('自由模式不使用章节')
  const summary = String(input.summary || '').trim()
  const nextNumber = source.chapterNumber + 1
  const conversationId = uuid()
  const now = new Date().toISOString()
  let nextSnapshot = prepareSnapshotForChapter(
    source.snapshot,
    source.relationshipId,
    nextNumber,
    summary,
  )
  await inTransaction(async (db) => {
    const [current] = (await db.query('SELECT * FROM conversations WHERE id = ?', [source.id])).values || []
    if (current?.status !== 'open') throw new Error('只有当前开放章节可以开启下一章')
    source = normalizeConversation(current, true)
    nextSnapshot = prepareSnapshotForChapter(source.snapshot, source.relationshipId, nextNumber, summary)
    await db.run(
      `UPDATE conversations SET status = 'closed', summary = ?, checkpoint_json = ?,
       updated_at = ?, closed_at = ? WHERE id = ?`,
      [summary, JSON.stringify(checkpointFromSnapshot(source.snapshot, summary)), now, now, source.id],
      false,
    )
    await db.run(
      `INSERT INTO conversations (
        id, relationship_id, chapter_number, status, title, title_is_custom,
        character_name, preview, summary, checkpoint_json, snapshot_json,
        created_at, updated_at, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversationId, source.relationshipId, nextNumber, 'open',
        normalizedTitle(input.title, `第 ${nextNumber} 章`), input.title ? 1 : 0,
        relationship.characterName || source.characterName, '', '',
        JSON.stringify(checkpointFromSnapshot(nextSnapshot)), JSON.stringify(nextSnapshot),
        now, now, null,
      ],
      false,
    )
    await db.run(
      'UPDATE relationships SET updated_at = ? WHERE id = ?',
      [now, source.relationshipId],
      false,
    )
  })
  return {
    relationship: await getRelationship(source.relationshipId),
    conversation: await getConversation(conversationId),
  }
}

export async function forkConversation(sourceConversationId, input = {}) {
  const source = await getConversation(sourceConversationId)
  if (!source) throw new Error('源章节不存在')
  const sourceRelationship = await getRelationship(source.relationshipId)
  const summary = String(input.summary || source.summary || '').trim()
  const forkSnapshot = prepareSnapshotForChapter(source.snapshot, 'pending', 1, summary)
  forkSnapshot.characterDefaults = {
    relationshipState: clone(source.snapshot.characterSettings?.relationshipState ?? null),
    memory: clone(source.snapshot.characterSettings?.memory ?? null),
  }
  return createRelationship({
    snapshot: forkSnapshot,
    characterName: source.characterName,
    mode: sourceRelationship?.mode || 'free',
    goal: sourceRelationship?.goal || '',
    relationshipTitle: normalizedTitle(
      input.relationshipTitle,
      `${source.characterName || '角色'} · 新故事`,
    ),
    title: normalizedTitle(input.title, '分支起点'),
    forkedFromRelationshipId: source.relationshipId,
    forkedFromConversationId: source.id,
  })
}

export async function renameConversation(id, title) {
  const existing = await getConversation(id)
  if (!existing) return null
  const normalized = normalizedTitle(title, '')
  if (!normalized) throw new Error('章节标题不能为空')
  await inTransaction(db => db.run(
    'UPDATE conversations SET title = ?, title_is_custom = 1, updated_at = ? WHERE id = ?',
    [normalized, new Date().toISOString(), id],
    false,
  ))
  return getConversation(id)
}

export async function renameRelationship(id, title) {
  const existing = await getRelationship(id)
  if (!existing) return null
  const normalized = normalizedTitle(title, '')
  if (!normalized) throw new Error('存档名称不能为空')
  await inTransaction(db => db.run(
    'UPDATE relationships SET title = ?, title_is_custom = 1, updated_at = ? WHERE id = ?',
    [normalized, new Date().toISOString(), id],
    false,
  ))
  return getRelationship(id)
}

export async function updateRelationshipSettings(id, input = {}) {
  const relationship = await getRelationship(id)
  if (!relationship) return null
  if (relationship.mode !== 'story') throw new Error('自由模式没有故事目标')
  const goalWasProvided = Object.prototype.hasOwnProperty.call(input, 'goal')
  const goal = goalWasProvided ? normalizedGoal(input.goal) : relationship.goal
  if (!goal) throw new Error('故事目标不能为空')
  const goalChanged = goalWasProvided && goal !== relationship.goal
  let goalStatus = goalChanged ? 'active' : relationship.goalStatus
  let goalAchievedAt = goalChanged ? null : relationship.goalAchievedAt
  let goalResolution = goalChanged ? '' : relationship.goalResolution

  if (Object.prototype.hasOwnProperty.call(input, 'goalStatus')) {
    goalStatus = normalizedGoalStatus(input.goalStatus)
    if (goalStatus === 'achieved') {
      goalAchievedAt = relationship.goalAchievedAt || new Date().toISOString()
      goalResolution = String(input.goalResolution || '').trim().slice(0, 500)
      if (!goalResolution) throw new Error('确认目标达成时需要提供判断依据')
    } else {
      goalAchievedAt = null
      goalResolution = ''
    }
  }

  await inTransaction(db => db.run(
    `UPDATE relationships SET goal = ?, goal_status = ?, goal_achieved_at = ?,
     goal_resolution = ?, updated_at = ? WHERE id = ?`,
    [goal, goalStatus, goalAchievedAt, goalResolution, new Date().toISOString(), id],
    false,
  ))
  return getRelationship(id)
}

export async function deleteRelationship(id) {
  return inTransaction(async db => {
    const relationshipRows = (await db.query('SELECT * FROM relationships WHERE id = ?', [id])).values || []
    if (!relationshipRows.length) return false
    const conversationRows = (await db.query('SELECT * FROM conversations WHERE relationship_id = ?', [id])).values || []
    const data = archives.bundle(relationshipRows, conversationRows)
    await db.run('INSERT INTO archive_trash (id, title, deleted_at, bundle_json) VALUES (?, ?, ?, ?)', [uuid(), relationshipRows[0].title, new Date().toISOString(), JSON.stringify(data)], false)
    await db.run('DELETE FROM relationships WHERE id = ?', [id], false)
    return true
  })
}

export async function deleteConversation(id) {
  const conversation = await getConversation(id)
  if (!conversation) return false
  return deleteRelationship(conversation.relationshipId)
}

export async function exportArchives(id) {
  return inTransaction(async db => {
    const relationshipRows = await db.query(id ? 'SELECT * FROM relationships WHERE id = ?' : 'SELECT * FROM relationships', id ? [id] : [])
    const conversationRows = await db.query(id ? 'SELECT * FROM conversations WHERE relationship_id = ?' : 'SELECT * FROM conversations', id ? [id] : [])
    return archives.bundle(relationshipRows.values || [], conversationRows.values || [])
  })
}

async function insertArchives(db, data) {
  for (const table of Object.keys(archives.COLUMNS)) {
    for (const row of data[table]) await db.run(archives.insertSQL(table), archives.values(table, row), false)
  }
}
export async function importArchives(input) {
  const data = archives.prepareImport(input, uuid)
  await inTransaction(db => insertArchives(db, data))
  return { importedCount: data.relationships.length, relationshipId: data.relationships[0]?.id }
}
export async function listTrash() {
  return rows('SELECT id, title, deleted_at AS deletedAt FROM archive_trash ORDER BY deleted_at DESC')
}
export async function restoreArchive(id) {
  return inTransaction(async db => {
    const [row] = (await db.query('SELECT bundle_json FROM archive_trash WHERE id = ?', [id])).values || []
    if (!row) return null
    const data = archives.prepareImport(JSON.parse(row.bundle_json), uuid)
    await insertArchives(db, data)
    await db.run('DELETE FROM archive_trash WHERE id = ?', [id], false)
    return { relationshipId: data.relationships[0].id }
  })
}
