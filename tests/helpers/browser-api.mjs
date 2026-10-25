export const control = { failSave: false, stream: null, writes: [] };
export async function updateConversation(id, payload) {
  if (control.failSave) throw Error('模拟磁盘写入失败');
  control.writes.push(structuredClone(payload));
  return { id, relationshipId: 'relation', chapterNumber: 1, status: 'open', ...payload };
}
export const sendMessageStream = (payload, callbacks) => control.stream(payload, callbacks);
export const createNextChapter = () => {};
export const createRelationship = () => {};
export const deleteRelationship = () => {};
export const forkConversation = () => {};
export const getConversation = () => {};
export const listRelationships = () => [];
export const renameConversation = () => {};
export const renameRelationship = () => {};
export const requestChapterSuggestion = () => {};
export const requestGoalSuggestion = () => {};
export const updateRelationshipSettings = () => {};

export const exportArchives = () => {};
export const importArchives = () => {};
export const listTrash = () => [];
export const restoreArchive = () => {};
