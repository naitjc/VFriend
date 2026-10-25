// HTTP adapter. Provider credentials are attached only to operations that use a model.
export function createWebApi({ http, modelHeaders }) {
  const id = encodeURIComponent
  const json = (path, method, payload, options = {}) => http.request(path, { method, body: JSON.stringify(payload), ...options })
  const model = (path, payload, timeoutMs, settings) => json(path, 'POST', payload, { timeoutMs, headers: modelHeaders(settings) })
  return {
    request: http.request,
    listConversations: async () => (await http.request('/conversations')).conversations,
    listRelationships: async () => (await http.request('/relationships')).relationships,
    getRelationship: async key => (await http.request(`/relationships/${id(key)}`)).relationship,
    createRelationship: payload => json('/relationships', 'POST', payload),
    renameRelationship: async (key, title) => (await json(`/relationships/${id(key)}/title`, 'PATCH', { title })).relationship,
    updateRelationshipSettings: async (key, payload) => (await json(`/relationships/${id(key)}/settings`, 'PATCH', payload)).relationship,
    deleteRelationship: key => http.request(`/relationships/${id(key)}`, { method: 'DELETE' }),
    createNextChapter: (key, payload) => model(`/relationships/${id(key)}/chapters`, payload, 65000),
    requestChapterSuggestion: (key, payload) => model(`/relationships/${id(key)}/chapter-suggestion`, payload, 35000),
    requestGoalSuggestion: (key, payload) => model(`/relationships/${id(key)}/goal-suggestion`, payload, 35000),
    forkConversation: (key, payload = {}) => model(`/conversations/${id(key)}/fork`, payload, 65000),
    getConversation: async key => (await http.request(`/conversations/${id(key)}`)).conversation,
    createConversation: async payload => (await json('/conversations', 'POST', payload)).conversation,
    updateConversation: async (key, payload) => (await json(`/conversations/${id(key)}`, 'PUT', payload)).conversation,
    renameConversation: async (key, title) => (await json(`/conversations/${id(key)}/title`, 'PATCH', { title })).conversation,
    deleteConversation: key => http.request(`/conversations/${id(key)}`, { method: 'DELETE' }),
    sendMessageStream: http.sendMessageStream,
    testWebModelConnection: async settings => { await model('/model/test', {}, 20000, settings); return true },
    previewCharacter: async (characterSettings, question) => (await model('/character/preview', { characterSettings, question }, 65000)).reply,
    exportArchives: () => http.request('/archives/export'),
    importArchives: data => json('/archives/import', 'POST', data),
    listTrash: () => http.request('/archives/trash'),
    restoreArchive: key => http.request(`/archives/trash/${id(key)}/restore`, { method: 'POST' }),
  }
}
