import { createHttpClient } from './httpClient.js'
import { createWebApi } from './web.js'
import { createNativeApi } from './native.js'
import { isNativeApp } from '../services/platform'
import { webModelHeaders } from '../services/webModelSettings'

const http = createHttpClient({
  baseURL: import.meta.env.VITE_API_URL || '',
  modelHeaders: webModelHeaders,
})
const web = createWebApi({ http, modelHeaders: webModelHeaders })
const api = isNativeApp ? { ...web, ...createNativeApi({
  loadStore: () => import('../services/nativeConversationStore'),
  loadRuntime: () => import('../services/nativeLlmRuntime'),
}) } : web

// Preserve the public interface used by the UI and Pinia actions.
export const {
  request, listConversations, listRelationships, getRelationship, createRelationship,
  renameRelationship, updateRelationshipSettings, deleteRelationship, createNextChapter,
  requestChapterSuggestion, requestGoalSuggestion, forkConversation, getConversation,
  createConversation, updateConversation, renameConversation, deleteConversation,
  sendMessageStream, testWebModelConnection, previewCharacter, exportArchives,
  importArchives, listTrash, restoreArchive,
} = api
