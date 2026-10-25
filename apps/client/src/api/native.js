import workflows from '@vfriend/core/workflow'

export function createNativeApi({ loadStore, loadRuntime }) {
  const storeOperation = name => async (...args) => (await loadStore())[name](...args)
  const workflowOperation = name => async (...args) => {
    const store = await loadStore()
    // Loading native code is deferred until the operation actually needs it.
    const workflow = workflows.createConversationWorkflow({
      store,
      summarize: async history => (await loadRuntime()).summarizeNativeChapter(history),
      adviseChapter: async input => (await loadRuntime()).adviseNativeChapter(input),
      adviseGoal: async input => (await loadRuntime()).adviseNativeGoal(input),
    })
    return workflow[name](...args)
  }
  return {
    listConversations: async () => (await (await loadStore()).listRelationships()).flatMap(relationship => relationship.chapters || []),
    ...Object.fromEntries([
      'listRelationships', 'getRelationship', 'createRelationship', 'renameRelationship',
      'updateRelationshipSettings', 'deleteRelationship', 'getConversation',
      'updateConversation', 'renameConversation', 'deleteConversation',
      'exportArchives', 'importArchives', 'listTrash', 'restoreArchive',
    ].map(name => [name, storeOperation(name)])),
    ...Object.fromEntries([
      'createNextChapter', 'requestChapterSuggestion', 'requestGoalSuggestion',
      'forkConversation', 'createConversation',
    ].map(name => [name, workflowOperation(name)])),
    sendMessageStream: async (...args) => (await loadRuntime()).sendNativeMessage(...args),
    previewCharacter: async (...args) => (await loadRuntime()).previewCharacter(...args),
  }
}
