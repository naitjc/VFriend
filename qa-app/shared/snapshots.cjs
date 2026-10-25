const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function stripRuntimeState(characterSettings = {}) {
  const character = clone(characterSettings) || {}
  delete character.relationshipState
  delete character.memory
  return character
}

function relationshipRuntimeFromSnapshot(snapshot = {}) {
  const settings = snapshot.characterSettings || {}
  const defaults = snapshot.characterDefaults || {}
  return {
    character: stripRuntimeState(settings),
    relationshipState: clone(settings.relationshipState ?? null),
    memory: clone(settings.memory ?? null),
    initialState: clone(defaults.relationshipState ?? settings.relationshipState ?? null),
    initialMemory: clone(defaults.memory ?? settings.memory ?? null),
  }
}

function checkpointFromSnapshot(snapshot, summary = '') {
  const runtime = relationshipRuntimeFromSnapshot(snapshot)
  return {
    schemaVersion: 1,
    relationshipState: runtime.relationshipState,
    memory: runtime.memory,
    summary: String(summary || ''),
  }
}

function prepareSnapshotForChapter(sourceSnapshot, relationshipId, chapterNumber, summary = '') {
  const snapshot = clone(sourceSnapshot) || {}
  snapshot.schemaVersion = 2
  snapshot.relationshipId = relationshipId
  snapshot.chapterNumber = chapterNumber
  snapshot.conversationHistory = []
  snapshot.apiHistory = summary
    ? [{ role: 'system', content: `[上一章提要] ${String(summary).trim()}` }]
    : []
  snapshot.bookmarkedIndices = []
  snapshot.searchQuery = ''
  snapshot.showSearch = false
  return snapshot
}

module.exports = { stripRuntimeState, relationshipRuntimeFromSnapshot, checkpointFromSnapshot, prepareSnapshotForChapter };
