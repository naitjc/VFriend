const { relationshipRuntimeFromSnapshot, checkpointFromSnapshot, prepareSnapshotForChapter } = require('../../../shared/snapshots.cjs');
const archives = require('../../../shared/archives.cjs');
const { initialRelationshipState } = require("../../../shared/runtime.cjs");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const config = require("../config/config");

const databasePath = path.resolve(config.databasePath);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(archives.TRASH_SCHEMA);

function columnNames(tableName) {
  return new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name),
  );
}

function addColumnIfMissing(tableName, columns, name, definition) {
  if (columns.has(name)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`);
  columns.add(name);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = null) {
  if (!value) return clone(fallback);
  try {
    return JSON.parse(value);
  } catch {
    return clone(fallback);
  }
}


function migrateSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_is_custom INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'story',
      goal TEXT NOT NULL DEFAULT '',
      goal_status TEXT NOT NULL DEFAULT 'active',
      goal_achieved_at TEXT,
      goal_resolution TEXT NOT NULL DEFAULT '',
      character_id TEXT NOT NULL DEFAULT '',
      character_name TEXT NOT NULL DEFAULT '',
      character_snapshot_json TEXT NOT NULL,
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
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_is_custom INTEGER NOT NULL DEFAULT 0,
      character_name TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const relationshipColumns = columnNames("relationships");
  addColumnIfMissing(
    "relationships",
    relationshipColumns,
    "mode",
    "TEXT NOT NULL DEFAULT 'story'",
  );
  addColumnIfMissing(
    "relationships",
    relationshipColumns,
    "goal",
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    "relationships",
    relationshipColumns,
    "goal_status",
    "TEXT NOT NULL DEFAULT 'active'",
  );
  addColumnIfMissing(
    "relationships",
    relationshipColumns,
    "goal_achieved_at",
    "TEXT",
  );
  addColumnIfMissing(
    "relationships",
    relationshipColumns,
    "goal_resolution",
    "TEXT NOT NULL DEFAULT ''",
  );

  const columns = columnNames("conversations");
  addColumnIfMissing("conversations", columns, "relationship_id", "TEXT");
  addColumnIfMissing(
    "conversations",
    columns,
    "chapter_number",
    "INTEGER NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    "conversations",
    columns,
    "status",
    "TEXT NOT NULL DEFAULT 'open'",
  );
  addColumnIfMissing(
    "conversations",
    columns,
    "summary",
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing("conversations", columns, "checkpoint_json", "TEXT");
  addColumnIfMissing("conversations", columns, "closed_at", "TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
      ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_relationship
      ON conversations(relationship_id, chapter_number);
    CREATE INDEX IF NOT EXISTS idx_relationships_updated_at
      ON relationships(updated_at DESC);
  `);

  const legacyRows = db
    .prepare(
      `SELECT * FROM conversations
       WHERE relationship_id IS NULL OR relationship_id = ''`,
    )
    .all();
  if (!legacyRows.length) return;

  const insertRelationship = db.prepare(`
    INSERT INTO relationships (
      id, title, title_is_custom, character_id, character_name,
      character_snapshot_json, relationship_state_json, memory_json,
      initial_state_json, initial_memory_json,
      forked_from_relationship_id, forked_from_conversation_id,
      created_at, updated_at
    ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
  `);
  const attachConversation = db.prepare(`
    UPDATE conversations
    SET relationship_id = ?, chapter_number = 1, status = 'open',
        checkpoint_json = ?
    WHERE id = ?
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of legacyRows) {
      const snapshot = parseJson(row.snapshot_json, {});
      const runtime = relationshipRuntimeFromSnapshot(snapshot);
      const relationshipId = randomUUID();
      const characterName =
        runtime.character.basicInfo?.name || row.character_name || "未命名角色";
      const characterId = runtime.character.id || characterName;
      const relationshipTitle = `与${characterName}的关系`;
      insertRelationship.run(
        relationshipId,
        relationshipTitle,
        String(characterId || ""),
        String(characterName || ""),
        JSON.stringify(runtime.character),
        JSON.stringify(runtime.relationshipState),
        JSON.stringify(runtime.memory),
        JSON.stringify(runtime.initialState),
        JSON.stringify(runtime.initialMemory),
        row.created_at,
        row.updated_at,
      );
      attachConversation.run(
        relationshipId,
        JSON.stringify(checkpointFromSnapshot(snapshot, row.summary || "")),
        row.id,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

migrateSchema();

const listRelationshipsStatement = db.prepare(`
  SELECT * FROM relationships ORDER BY updated_at DESC
`);
const getRelationshipStatement = db.prepare(`
  SELECT * FROM relationships WHERE id = ?
`);
const listRelationshipChaptersStatement = db.prepare(`
  SELECT id, relationship_id, chapter_number, status, title,
         title_is_custom, character_name, preview, summary,
         created_at, updated_at, closed_at
  FROM conversations
  WHERE relationship_id = ?
  ORDER BY chapter_number ASC
`);
const getConversationStatement = db.prepare(`
  SELECT * FROM conversations WHERE id = ?
`);
const insertRelationshipStatement = db.prepare(`
  INSERT INTO relationships (
    id, title, title_is_custom, mode, goal, goal_status, goal_achieved_at,
    goal_resolution, character_id, character_name,
    character_snapshot_json, relationship_state_json, memory_json,
    initial_state_json, initial_memory_json,
    forked_from_relationship_id, forked_from_conversation_id,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertConversationStatement = db.prepare(`
  INSERT INTO conversations (
    id, relationship_id, chapter_number, status, title, title_is_custom,
    character_name, preview, summary, checkpoint_json, snapshot_json,
    created_at, updated_at, closed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateConversationStatement = db.prepare(`
  UPDATE conversations
  SET title = ?, title_is_custom = ?, character_name = ?, preview = ?,
      checkpoint_json = ?, snapshot_json = ?, updated_at = ?
  WHERE id = ?
`);
const updateRelationshipRuntimeStatement = db.prepare(`
  UPDATE relationships
  SET character_id = ?, character_name = ?, character_snapshot_json = ?,
      relationship_state_json = ?, memory_json = ?, updated_at = ?
  WHERE id = ?
`);
const closeConversationStatement = db.prepare(`
  UPDATE conversations
  SET status = 'closed', summary = ?, checkpoint_json = ?,
      updated_at = ?, closed_at = ?
  WHERE id = ?
`);
const renameConversationStatement = db.prepare(`
  UPDATE conversations
  SET title = ?, title_is_custom = 1, updated_at = ?
  WHERE id = ?
`);
const renameRelationshipStatement = db.prepare(`
  UPDATE relationships
  SET title = ?, title_is_custom = 1, updated_at = ?
  WHERE id = ?
`);
const updateRelationshipSettingsStatement = db.prepare(`
  UPDATE relationships
  SET goal = ?, goal_status = ?, goal_achieved_at = ?, goal_resolution = ?,
      updated_at = ?
  WHERE id = ?
`);
const deleteConversationStatement = db.prepare(
  "DELETE FROM conversations WHERE id = ?",
);
const deleteRelationshipConversationsStatement = db.prepare(
  "DELETE FROM conversations WHERE relationship_id = ?",
);
const deleteRelationshipStatement = db.prepare(
  "DELETE FROM relationships WHERE id = ?",
);

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    const error = new Error("会话快照不能为空");
    error.status = 400;
    throw error;
  }
}

function normalizedTitle(value, fallback) {
  return String(value || fallback).trim().slice(0, 80) || fallback;
}

function normalizedMode(value) {
  const mode = value == null ? "free" : String(value).trim();
  if (mode === "free" || mode === "story") return mode;
  const error = new Error("聊天模式必须是 free 或 story");
  error.status = 400;
  throw error;
}

function normalizedGoal(value) {
  return String(value || "").trim().slice(0, 500);
}

function normalizedGoalStatus(value) {
  if (value === "active" || value === "achieved") return value;
  const error = new Error("目标状态必须是 active 或 achieved");
  error.status = 400;
  throw error;
}

function normalizeConversation(row, includeSnapshot = false) {
  if (!row) return null;
  const result = {
    id: row.id,
    relationshipId: row.relationship_id,
    chapterNumber: Number(row.chapter_number || 1),
    status: row.status || "open",
    title: row.title,
    titleCustomized: Boolean(row.title_is_custom),
    characterName: row.character_name,
    preview: row.preview,
    summary: row.summary || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || null,
  };
  if (includeSnapshot) {
    result.snapshot = parseJson(row.snapshot_json, {});
    result.checkpoint = parseJson(row.checkpoint_json, null);
  }
  return result;
}

function normalizeRelationship(row, includeChapters = true) {
  if (!row) return null;
  const result = {
    id: row.id,
    title: row.title,
    titleCustomized: Boolean(row.title_is_custom),
    mode: row.mode === "free" ? "free" : "story",
    goal: row.goal || "",
    goalStatus: row.goal_status === "achieved" ? "achieved" : "active",
    goalAchievedAt: row.goal_achieved_at || null,
    goalResolution: row.goal_resolution || "",
    characterId: row.character_id,
    characterName: row.character_name,
    forkedFromRelationshipId: row.forked_from_relationship_id || null,
    forkedFromConversationId: row.forked_from_conversation_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeChapters) {
    result.chapters = listRelationshipChaptersStatement
      .all(row.id)
      .map((chapter) => normalizeConversation(chapter));
  }
  return result;
}

function runTransaction(callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}


function listRelationships() {
  return listRelationshipsStatement
    .all()
    .map((row) => normalizeRelationship(row));
}

function getRelationship(id) {
  return normalizeRelationship(getRelationshipStatement.get(id));
}

function getConversation(id) {
  const conversation = normalizeConversation(
    getConversationStatement.get(id),
    true,
  );
  if (!conversation) return null;
  conversation.relationship = normalizeRelationship(
    getRelationshipStatement.get(conversation.relationshipId),
    false,
  );
  return conversation;
}

function createRelationship(input = {}) {
  validateSnapshot(input.snapshot);
  const relationshipId = input.id || randomUUID();
  const conversationId = randomUUID();
  const now = new Date().toISOString();
  const runtime = relationshipRuntimeFromSnapshot(input.snapshot);
  const characterName =
    runtime.character.basicInfo?.name || input.characterName || "未命名角色";
  const characterId = runtime.character.id || input.characterId || characterName;
  const mode = normalizedMode(input.mode);
  const goal = normalizedGoal(input.goal);
  if (mode === "story" && !goal && !input.forkedFromRelationshipId) {
    const error = new Error("故事模式必须设置最终目标");
    error.status = 400;
    throw error;
  }
  const relationshipTitle = normalizedTitle(
    input.relationshipTitle,
    mode === "story"
      ? `${characterName} · 主线故事`
      : `${characterName} · 自由聊天`,
  );
  const snapshot = clone(input.snapshot);
  if (!input.forkedFromRelationshipId && !input.inheritedSummary) {
    const affection = mode === "story" ? 0 : input.initialAffection;
    const state = initialRelationshipState(runtime.relationshipState, affection, input.initialMood);
    runtime.relationshipState = state;
    runtime.initialState = initialRelationshipState(runtime.initialState, state.affection, state.mood);
    snapshot.characterSettings = {
      ...(snapshot.characterSettings || {}),
      relationshipState: state,
    };
    snapshot.characterDefaults = {
      ...(snapshot.characterDefaults || {}),
      relationshipState: runtime.initialState,
    };
  }
  snapshot.schemaVersion = 2;
  snapshot.relationshipId = relationshipId;
  snapshot.chapterNumber = 1;

  runTransaction(() => {
    insertRelationshipStatement.run(
      relationshipId,
      relationshipTitle,
      input.relationshipTitle ? 1 : 0,
      mode,
      goal,
      "active",
      null,
      "",
      String(characterId || ""),
      String(characterName || ""),
      JSON.stringify(runtime.character),
      JSON.stringify(runtime.relationshipState),
      JSON.stringify(runtime.memory),
      JSON.stringify(runtime.initialState),
      JSON.stringify(runtime.initialMemory),
      input.forkedFromRelationshipId || null,
      input.forkedFromConversationId || null,
      now,
      now,
    );
    insertConversationStatement.run(
      conversationId,
      relationshipId,
      1,
      "open",
      normalizedTitle(input.title, characterName ? `与${characterName}的对话` : "第1章"),
      input.title ? 1 : 0,
      String(characterName || ""),
      String(input.preview || ""),
      "",
      JSON.stringify(checkpointFromSnapshot(snapshot)),
      JSON.stringify(snapshot),
      now,
      now,
      null,
    );
  });

  return {
    relationship: getRelationship(relationshipId),
    conversation: getConversation(conversationId),
  };
}

// 兼容旧客户端：没有 relationshipId 时，创建关系及其首章。
function createConversation(input = {}) {
  if (!input.relationshipId) return createRelationship(input).conversation;
  const relationship = getRelationship(input.relationshipId);
  if (!relationship) return null;
  return createNextChapter(
    relationship.chapters.find((chapter) => chapter.status === "open")?.id,
    input,
  ).conversation;
}

function updateConversation(id, input = {}) {
  const existing = getConversation(id);
  if (!existing) return null;
  if (existing.status !== "open") {
    const error = new Error("过去章节为只读；如需继续，请从该章节创建分支故事");
    error.status = 409;
    throw error;
  }
  validateSnapshot(input.snapshot);

  const now = new Date().toISOString();
  const runtime = relationshipRuntimeFromSnapshot(input.snapshot);
  const characterName =
    runtime.character.basicInfo?.name ||
    input.characterName ||
    existing.characterName;
  const characterId = runtime.character.id || characterName;
  const checkpoint = checkpointFromSnapshot(
    input.snapshot,
    existing.summary,
  );

  runTransaction(() => {
    updateConversationStatement.run(
      normalizedTitle(input.title, existing.title),
      (input.titleCustomized ?? existing.titleCustomized) ? 1 : 0,
      String(characterName || ""),
      String(input.preview ?? existing.preview),
      JSON.stringify(checkpoint),
      JSON.stringify(input.snapshot),
      now,
      id,
    );
    updateRelationshipRuntimeStatement.run(
      String(characterId || ""),
      String(characterName || ""),
      JSON.stringify(runtime.character),
      JSON.stringify(runtime.relationshipState),
      JSON.stringify(runtime.memory),
      now,
      existing.relationshipId,
    );
  });
  return getConversation(id);
}

function createNextChapter(sourceConversationId, input = {}) {
  const source = getConversation(sourceConversationId);
  if (!source) {
    const error = new Error("源章节不存在");
    error.status = 404;
    throw error;
  }
  if (source.status !== "open") {
    const error = new Error("只有当前开放章节可以开启下一章");
    error.status = 409;
    throw error;
  }

  const relationship = getRelationship(source.relationshipId);
  if (relationship?.mode !== "story") {
    const error = new Error("自由模式不使用章节");
    error.status = 409;
    throw error;
  }

  const summary = String(input.summary || "").trim();
  const nextNumber = source.chapterNumber + 1;
  const conversationId = randomUUID();
  const now = new Date().toISOString();
  const nextSnapshot = prepareSnapshotForChapter(
    source.snapshot,
    source.relationshipId,
    nextNumber,
    summary,
  );
  const characterName = relationship?.characterName || source.characterName;

  runTransaction(() => {
    closeConversationStatement.run(
      summary,
      JSON.stringify(checkpointFromSnapshot(source.snapshot, summary)),
      now,
      now,
      source.id,
    );
    insertConversationStatement.run(
      conversationId,
      source.relationshipId,
      nextNumber,
      "open",
      normalizedTitle(input.title, `第 ${nextNumber} 章`),
      input.title ? 1 : 0,
      String(characterName || ""),
      "",
      "",
      JSON.stringify(checkpointFromSnapshot(nextSnapshot)),
      JSON.stringify(nextSnapshot),
      now,
      now,
      null,
    );
    db.prepare("UPDATE relationships SET updated_at = ? WHERE id = ?").run(
      now,
      source.relationshipId,
    );
  });

  return {
    relationship: getRelationship(source.relationshipId),
    conversation: getConversation(conversationId),
  };
}

function forkConversation(sourceConversationId, input = {}) {
  const source = getConversation(sourceConversationId);
  if (!source) {
    const error = new Error("源章节不存在");
    error.status = 404;
    throw error;
  }

  const sourceSnapshot = clone(source.snapshot);
  const summary = String(input.summary || source.summary || "").trim();
  const forkSnapshot = prepareSnapshotForChapter(
    sourceSnapshot,
    "pending",
    1,
    summary,
  );
  // 对分支故事而言，分支点就是它的初始状态。后续“重新开始”不应退回
  // 源故事更早的人设默认值。
  forkSnapshot.characterDefaults = {
    relationshipState: clone(
      sourceSnapshot.characterSettings?.relationshipState ?? null,
    ),
    memory: clone(sourceSnapshot.characterSettings?.memory ?? null),
  };
  const characterName =
    sourceSnapshot.characterSettings?.basicInfo?.name || source.characterName;
  const sourceRelationship = getRelationship(source.relationshipId);
  const result = createRelationship({
    snapshot: forkSnapshot,
    characterName,
    mode: sourceRelationship?.mode || "free",
    goal: sourceRelationship?.goal || "",
    relationshipTitle: normalizedTitle(
      input.relationshipTitle,
      `${characterName || "角色"} · 新故事`,
    ),
    title: normalizedTitle(input.title, "分支起点"),
    forkedFromRelationshipId: source.relationshipId,
    forkedFromConversationId: source.id,
  });

  const correctedSnapshot = clone(result.conversation.snapshot);
  correctedSnapshot.relationshipId = result.relationship.id;
  correctedSnapshot.chapterNumber = 1;
  updateConversation(result.conversation.id, {
    ...result.conversation,
    snapshot: correctedSnapshot,
  });
  return {
    relationship: getRelationship(result.relationship.id),
    conversation: getConversation(result.conversation.id),
  };
}

function renameConversation(id, title) {
  const normalized = normalizedTitle(title, "");
  if (!normalized) {
    const error = new Error("章节标题不能为空");
    error.status = 400;
    throw error;
  }
  const result = renameConversationStatement.run(
    normalized,
    new Date().toISOString(),
    id,
  );
  return result.changes ? getConversation(id) : null;
}

function renameRelationship(id, title) {
  const normalized = normalizedTitle(title, "");
  if (!normalized) {
    const error = new Error("关系名称不能为空");
    error.status = 400;
    throw error;
  }
  const result = renameRelationshipStatement.run(
    normalized,
    new Date().toISOString(),
    id,
  );
  return result.changes ? getRelationship(id) : null;
}

function updateRelationshipSettings(id, input = {}) {
  const relationship = getRelationship(id);
  if (!relationship) return null;
  if (relationship.mode !== "story") {
    const error = new Error("自由模式没有故事目标");
    error.status = 409;
    throw error;
  }
  const goalWasProvided = Object.prototype.hasOwnProperty.call(input, "goal");
  const goal = goalWasProvided
    ? normalizedGoal(input.goal)
    : relationship.goal;
  if (!goal) {
    const error = new Error("故事目标不能为空");
    error.status = 400;
    throw error;
  }
  const goalChanged = goalWasProvided && goal !== relationship.goal;
  let goalStatus = goalChanged ? "active" : relationship.goalStatus;
  let goalAchievedAt = goalChanged ? null : relationship.goalAchievedAt;
  let goalResolution = goalChanged ? "" : relationship.goalResolution;

  if (Object.prototype.hasOwnProperty.call(input, "goalStatus")) {
    goalStatus = normalizedGoalStatus(input.goalStatus);
    if (goalStatus === "achieved") {
      goalAchievedAt = relationship.goalAchievedAt || new Date().toISOString();
      goalResolution = String(input.goalResolution || "").trim().slice(0, 500);
      if (!goalResolution) {
        const error = new Error("确认目标达成时需要提供判断依据");
        error.status = 400;
        throw error;
      }
    } else {
      goalAchievedAt = null;
      goalResolution = "";
    }
  }

  updateRelationshipSettingsStatement.run(
    goal,
    goalStatus,
    goalAchievedAt,
    goalResolution,
    new Date().toISOString(),
    id,
  );
  return getRelationship(id);
}

function deleteConversation(id) {
  const conversation = getConversation(id);
  if (!conversation) return false;
  const relationship = getRelationship(conversation.relationshipId);
  if (relationship?.chapters.length > 1) {
    const error = new Error("故事存档包含多个章节，请删除整个存档");
    error.status = 409;
    throw error;
  }
  return deleteRelationship(conversation.relationshipId);
}

function deleteRelationship(id) {
  if (!getRelationshipStatement.get(id)) return false;
  return runTransaction(() => {
    const data = exportArchives(id);
    db.prepare("INSERT INTO archive_trash (id, title, deleted_at, bundle_json) VALUES (?, ?, ?, ?)").run(randomUUID(), data.relationships[0].title, new Date().toISOString(), JSON.stringify(data));
    deleteRelationshipConversationsStatement.run(id);
    return deleteRelationshipStatement.run(id).changes > 0;
  });
}

module.exports = {
  databasePath,
  listRelationships,
  getRelationship,
  getConversation,
  createRelationship,
  createConversation,
  updateConversation,
  createNextChapter,
  forkConversation,
  renameConversation,
  renameRelationship,
  updateRelationshipSettings,
  deleteConversation,
  deleteRelationship,
};

function exportArchives(id) {
  return archives.bundle(
    id ? db.prepare('SELECT * FROM relationships WHERE id = ?').all(id) : db.prepare('SELECT * FROM relationships').all(),
    id ? db.prepare('SELECT * FROM conversations WHERE relationship_id = ?').all(id) : db.prepare('SELECT * FROM conversations').all(),
  );
}
function insertArchives(data) {
  for (const table of Object.keys(archives.COLUMNS)) {
    const statement = db.prepare(archives.insertSQL(table));
    for (const row of data[table]) statement.run(...archives.values(table, row));
  }
}
function importArchives(input) {
  const data = archives.prepareImport(input, randomUUID);
  runTransaction(() => insertArchives(data));
  return { importedCount: data.relationships.length, relationshipId: data.relationships[0]?.id };
}
function listTrash() {
  return db.prepare('SELECT id, title, deleted_at AS deletedAt FROM archive_trash ORDER BY deleted_at DESC').all();
}
function restoreArchive(id) {
  const row = db.prepare('SELECT bundle_json FROM archive_trash WHERE id = ?').get(id);
  if (!row) return null;
  const data = archives.prepareImport(JSON.parse(row.bundle_json), randomUUID);
  runTransaction(() => {
    insertArchives(data);
    db.prepare('DELETE FROM archive_trash WHERE id = ?').run(id);
  });
  return { relationshipId: data.relationships[0].id };
}
Object.assign(module.exports, { exportArchives, importArchives, listTrash, restoreArchive });
