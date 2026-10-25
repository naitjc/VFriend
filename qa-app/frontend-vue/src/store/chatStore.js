import { createCharactersActions } from "./actions/characters.js";
import { createMetadataActions } from "./actions/metadata.js";
import { createNavigationActions } from "./actions/navigation.js";
import { createConversationsActions } from "./actions/conversations.js";
import { getStoreRuntime } from "./runtime.js";
import { createArchivesActions } from "./actions/archives.js";
import { createMessagingActions } from "./actions/messaging.js";
import { createPersistenceActions } from "./actions/persistence.js";
import { createSuggestionsActions } from "./actions/suggestions.js";
import runtimeRules from 'rp-core';
import prompts from 'rp-prompt';
const { normalizeMemory, confirmRelationship, initialRelationshipState, historyTokens, estimateTokens, textContent } = runtimeRules;
import { defineStore, acceptHMRUpdate } from "pinia";
import {
  exportArchives as exportArchivesApi,
  importArchives as importArchivesApi,
  listTrash as listTrashApi,
  restoreArchive as restoreArchiveApi,
  createNextChapter as createNextChapterApi,
  createRelationship as createRelationshipApi,
  deleteRelationship as deleteRelationshipApi,
  forkConversation as forkConversationApi,
  getConversation as getConversationApi,
  listRelationships as listRelationshipsApi,
  renameConversation as renameConversationApi,
  renameRelationship as renameRelationshipApi,
  requestChapterSuggestion as requestChapterSuggestionApi,
  requestGoalSuggestion as requestGoalSuggestionApi,
  sendMessageStream,
  updateConversation as updateConversationApi,
  updateRelationshipSettings as updateRelationshipSettingsApi,
} from "../api/chat";

const cloneValue = (value) =>
  value == null ? value : JSON.parse(JSON.stringify(value));

const readStoredArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const DEFAULT_CHARACTER = {
  basicInfo: { name: "", age: "", gender: "", userNickname: "" },
  corePersonality: [],
  speechStyle: { tone: "", habits: [], avoid: [] },
  behaviorRules: [],
  background: {
    identity: "",
    residence: "",
    familyMembers: [],
    history: "",
  },
  preferences: { likes: [], dislikes: [] },
  relationshipState: null,
  memory: null,
  avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Robot",
};

const FRESH_RELATIONSHIP_STATE = {
  affection: 10,
  mood: 0,
  relationshipStage: "stranger",
  distance: "distant",
};

const freshRelationshipState = (state = null) => ({
  ...FRESH_RELATIONSHIP_STATE,
  ...(cloneValue(state) || {}),
});

const randomInitialMood = () => Math.floor(Math.random() * 21) - 10;

const CONTEXT_TOKEN_LIMIT = 24000;
const CONTEXT_SOFT_RATIO = 0.7;
const CONTEXT_HIGH_RATIO = 0.85;
const CONTEXT_HARD_RATIO = 0.95;

const withoutSnapshot = ({ snapshot, checkpoint, relationship, ...metadata }) =>
  metadata;

export const useChatStore = defineStore("chat", {
  state: () => ({
    userAvatar: "/avatars/用户默认头像.png",
    characterSettings: cloneValue(DEFAULT_CHARACTER),
    chatBackground: null,
    conversationHistory: [],
    apiHistory: [],
    modelParams: { temperature: 0.5, top_p: 0.7 },

    isSending: false,
    sendPhase: "",
    streamingContent: "",
    stateChangeNotice: null,
    continuityWarning: "",
    chapterSuggestion: null,
    isChapterSuggestionLoading: false,
    chapterSuggestionCheck: {
      conversationId: "",
      lastCheckedMessageCount: 0,
      dismissedUntilMessageCount: 0,
    },
    goalSuggestion: null,
    isGoalSuggestionLoading: false,
    goalSuggestionCheck: {
      conversationId: "",
      lastCheckedMessageCount: 0,
      dismissedUntilMessageCount: 0,
    },

    bookmarkedIndices: [],
    searchQuery: "",
    showSearch: false,

    _characterDefaults: { relationshipState: null, memory: null },

    // 存档是长期容器；自由模式只有一个持续会话，故事模式可包含多个章节。
    relationships: [],
    conversations: [],
    activeRelationshipId: null,
    activeConversationId: null,
    isConversationLoading: false,
    persistenceReady: false,
    persistenceError: "",
    _isHydratingConversation: false,

    customCharacters: readStoredArray("customCharacters"),
    currentTheme: localStorage.getItem("theme") || "default",
  }),

  getters: {
    activeRelationship(state) {
      return state.relationships.find(
        (relationship) => relationship.id === state.activeRelationshipId,
      );
    },
    activeConversation(state) {
      return state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
    },
    isActiveChapterReadOnly() {
      return Boolean(this.activeConversation?.status === "closed");
    },
    isStoryMode() {
      return this.activeRelationship?.mode === "story";
    },
    filteredHistory(state) {
      if (!state.searchQuery.trim()) return state.conversationHistory;
      const query = state.searchQuery.toLowerCase();
      return state.conversationHistory.filter((message) =>
        (message.content || "").toLowerCase().includes(query),
      );
    },
    retryableMessageIndex(state) {
      const index = state.conversationHistory.length - 1;
      return ["failed", "stopped"].includes(state.conversationHistory[index]?.delivery) ? index : -1;
    },
    contextUsage(state) {
      const tokens = historyTokens(state.apiHistory) + estimateTokens(prompts.buildSystemPrompt(state.characterSettings));
      const ratio = Math.min(1, tokens / CONTEXT_TOKEN_LIMIT);
      return { tokens, ratio, percent: Math.round(ratio * 100) };
    },
    contextNoticeLevel() {
      const ratio = this.contextUsage.ratio;
      if (ratio >= CONTEXT_HARD_RATIO) return "hard";
      if (ratio >= CONTEXT_HIGH_RATIO) return "high";
      if (ratio >= CONTEXT_SOFT_RATIO) return "soft";
      return "normal";
    },
  },

  actions: {
    _makeTimestamp() {
      return new Date().toISOString();
    },

    _dialogueMessageCount() {
      return this.conversationHistory.filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim(),
      ).length;
    },

    _resetChapterSuggestion() {
      this.chapterSuggestion = null;
      this.isChapterSuggestionLoading = false;
      this.chapterSuggestionCheck = {
        conversationId: this.activeConversationId || "",
        lastCheckedMessageCount: 0,
        dismissedUntilMessageCount: 0,
      };
    },

    _resetGoalSuggestion() {
      this.goalSuggestion = null;
      this.isGoalSuggestionLoading = false;
      this.goalSuggestionCheck = {
        conversationId: this.activeConversationId || "",
        lastCheckedMessageCount: 0,
        dismissedUntilMessageCount: 0,
      };
    },

    _buildSnapshot() {
      return {
        schemaVersion: 1,
        userAvatar: this.userAvatar,
        characterSettings: cloneValue(this.characterSettings),
        conversationHistory: cloneValue(this.conversationHistory).map(
          (message) => ({ ...message, streaming: false }),
        ),
        apiHistory: cloneValue(this.apiHistory),
        chatBackground: this.chatBackground,
        modelParams: cloneValue(this.modelParams),
        bookmarkedIndices: [...this.bookmarkedIndices],
        searchQuery: this.searchQuery,
        showSearch: this.showSearch,
        characterDefaults: cloneValue(this._characterDefaults),
      };
    },

    _getAutoTitle() {
      const firstUserMessage = this.conversationHistory.find(
        (message) => message.role === "user" && message.content?.trim(),
      );
      if (firstUserMessage) {
        const title = firstUserMessage.content.trim().replace(/\s+/g, " ");
        return title.length > 28 ? `${title.slice(0, 28)}…` : title;
      }
      const characterName = this.characterSettings.basicInfo?.name;
      return characterName ? `与${characterName}的对话` : "新对话";
    },

    _buildPersistencePayload() {
      const active = this.activeConversation;
      const hasUserMessage = this.conversationHistory.some(
        (message) => message.role === "user" && message.content?.trim(),
      );
      const lastMessage = [...this.conversationHistory]
        .reverse()
        .find((message) => message.content?.trim());
      const preview = lastMessage?.content?.trim().replace(/\s+/g, " ") || "";
      return {
        title: active?.titleCustomized || !hasUserMessage
          ? active?.title || this._getAutoTitle()
          : this._getAutoTitle(),
        titleCustomized: Boolean(active?.titleCustomized),
        characterName: this.characterSettings.basicInfo?.name || "",
        preview: preview.slice(0, 100),
        snapshot: this._buildSnapshot(),
      };
    },

    _upsertConversationMetadata(conversation) {
      const metadata = withoutSnapshot(conversation);
      const index = this.conversations.findIndex(
        (item) => item.id === metadata.id,
      );
      if (index >= 0) this.conversations[index] = metadata;
      else this.conversations.push(metadata);
      this.conversations.sort((a, b) => a.chapterNumber - b.chapterNumber);

      const relationshipIndex = this.relationships.findIndex(
        (item) => item.id === metadata.relationshipId,
      );
      if (relationshipIndex >= 0) {
        const relationship = this.relationships[relationshipIndex];
        const chapters = [...(relationship.chapters || [])];
        const chapterIndex = chapters.findIndex(
          (chapter) => chapter.id === metadata.id,
        );
        if (chapterIndex >= 0) chapters[chapterIndex] = metadata;
        else chapters.push(metadata);
        chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
        this.relationships[relationshipIndex] = {
          ...relationship,
          chapters,
          updatedAt: metadata.updatedAt || relationship.updatedAt,
        };
      }
    },

    _setRelationships(relationships) {
      this.relationships = cloneValue(relationships || []).sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
      );
      const active = this.relationships.find(
        (relationship) => relationship.id === this.activeRelationshipId,
      );
      this.conversations = cloneValue(active?.chapters || []);
    },

    _resetSessionState() {
      this.userAvatar = "/avatars/用户默认头像.png";
      this.characterSettings = cloneValue(DEFAULT_CHARACTER);
      this.chatBackground = null;
      this.conversationHistory = [];
      this.apiHistory = [];
      this.modelParams = { temperature: 0.5, top_p: 0.7 };
      this.bookmarkedIndices = [];
      this.searchQuery = "";
      this.showSearch = false;
      this.streamingContent = "";
      this.stateChangeNotice = null;
      this._resetChapterSuggestion();
      this._resetGoalSuggestion();
      this._characterDefaults = { relationshipState: null, memory: null };
    },

    _applyCharacterTemplate(character) {
      if (!character) {
        this.characterSettings = cloneValue(DEFAULT_CHARACTER);
        this._characterDefaults = { relationshipState: null, memory: null };
        return;
      }

      this.characterSettings = {
        id: character.id,
        basicInfo: {
          ...DEFAULT_CHARACTER.basicInfo,
          ...(cloneValue(character.basicInfo) || {}),
        },
        corePersonality: cloneValue(character.corePersonality || []),
        speechStyle: {
          ...cloneValue(DEFAULT_CHARACTER.speechStyle),
          ...(cloneValue(character.speechStyle) || {}),
        },
        behaviorRules: cloneValue(character.behaviorRules || []),
        background: {
          ...cloneValue(DEFAULT_CHARACTER.background),
          ...(cloneValue(character.background) || {}),
        },
        preferences: {
          ...cloneValue(DEFAULT_CHARACTER.preferences),
          ...(cloneValue(character.preferences) || {}),
        },
        relationshipState: freshRelationshipState(character.relationshipState),
        memory: cloneValue(character.memory),
        avatar: character.avatar || DEFAULT_CHARACTER.avatar,
      };
      this._characterDefaults = {
        relationshipState: freshRelationshipState(character.relationshipState),
        memory: cloneValue(character.memory),
      };
    },

    _applyConversation(conversation) {
      this.continuityWarning = "";
      const snapshot = conversation.snapshot || {};
      this._isHydratingConversation = true;
      this.activeConversationId = conversation.id;
      this.activeRelationshipId = conversation.relationshipId;
      this.userAvatar =
        snapshot.userAvatar || "/avatars/用户默认头像.png";
      this.characterSettings = {
        ...cloneValue(DEFAULT_CHARACTER),
        ...(cloneValue(snapshot.characterSettings) || {}),
      };
      this.conversationHistory = cloneValue(
        snapshot.conversationHistory || [],
      );
      this.apiHistory = cloneValue(snapshot.apiHistory || []);
      this.chatBackground = snapshot.chatBackground || null;
      this.modelParams = {
        temperature: 0.5,
        top_p: 0.7,
        ...(cloneValue(snapshot.modelParams) || {}),
      };
      this.bookmarkedIndices = [...(snapshot.bookmarkedIndices || [])];
      this.searchQuery = snapshot.searchQuery || "";
      this.showSearch = Boolean(snapshot.showSearch);
      this._characterDefaults = cloneValue(snapshot.characterDefaults) || {
        relationshipState: cloneValue(
          this.characterSettings.relationshipState,
        ),
        memory: cloneValue(this.characterSettings.memory),
      };
      this.isSending = false;
      this.sendPhase = "";
      this.streamingContent = "";
      this.stateChangeNotice = null;
      this._resetChapterSuggestion();
      this._resetGoalSuggestion();
      this._upsertConversationMetadata(conversation);
      this._isHydratingConversation = false;
    },

    async initializeConversations() {
      if (this.persistenceReady || this.isConversationLoading) return;
      this.isConversationLoading = true;
      this.persistenceError = "";
      try {
        this._setRelationships(await listRelationshipsApi());
        if (this.relationships.length) {
          const relationship = this.relationships[0];
          this.activeRelationshipId = relationship.id;
          this.conversations = cloneValue(relationship.chapters || []);
          const latestChapter =
            this.conversations.find((chapter) => chapter.status === "open") ||
            this.conversations[this.conversations.length - 1];
          const conversation = await getConversationApi(
            latestChapter.id,
          );
          this._applyConversation(conversation);
          // 初始化只载入角色用于展示存档列表，不自动打开任何存档。
          this.activeConversationId = null;
          this.activeRelationshipId = null;
        } else {
          this._resetSessionState();
          this.activeRelationshipId = null;
          this.activeConversationId = null;
        }
        this.persistenceReady = true;
      } catch (error) {
        this.persistenceError = `无法加载会话：${error.message}`;
        console.error(this.persistenceError);
      } finally {
        this.isConversationLoading = false;
      }
    },

    ...createConversationsActions({ cloneValue, freshRelationshipState, randomInitialMood, initialRelationshipState, textContent, createRelationshipApi, listRelationshipsApi, createNextChapterApi }),

    ...createSuggestionsActions({ requestChapterSuggestionApi, requestGoalSuggestionApi }),

    ...createNavigationActions({ forkConversationApi, getConversationApi, listRelationshipsApi, cloneValue }),

    ...createPersistenceActions({ updateConversationApi }),

    ...createMetadataActions({ renameConversationApi, renameRelationshipApi, updateRelationshipSettingsApi, deleteRelationshipApi, getConversationApi, cloneValue }),

    ...createCharactersActions({ cloneValue, freshRelationshipState, normalizeMemory, confirmRelationship, getConversationApi }),

    addMessage(role, content, extra = {}) {
      this.conversationHistory.push({
        role: role === "user" ? "user" : "assistant",
        displayRole: role,
        content,
        timestamp: this._makeTimestamp(),
        bookmarked: false,
        ...extra,
      });
    },

    toggleBookmark(index) {
      if (!this.conversationHistory[index]) return;
      this.conversationHistory[index].bookmarked =
        !this.conversationHistory[index].bookmarked;
      this.scheduleConversationSave();
    },

    setSearch(query) {
      this.searchQuery = query;
      this.scheduleConversationSave();
    },

    toggleSearch() {
      this.showSearch = !this.showSearch;
      if (!this.showSearch) this.searchQuery = "";
      this.scheduleConversationSave();
    },

    setTheme(theme) {
      this.currentTheme = theme;
      localStorage.setItem("theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    },

    saveCustomCharacter(character) {
      const existing = this.customCharacters.findIndex(
        (item) => item.id === character.id,
      );
      if (existing >= 0) this.customCharacters[existing] = character;
      else this.customCharacters.push(character);
      localStorage.setItem(
        "customCharacters",
        JSON.stringify(this.customCharacters),
      );
    },

    async deleteCustomCharacter(characterId) {
      if (!characterId || this.isSending) return null;
      const character = this.customCharacters.find(
        (item) => item.id === characterId,
      );
      if (!character) return null;
      const characterName = character.basicInfo?.name || "";
      const relatedRelationships = this.relationships.filter(
        (relationship) =>
          relationship.characterId === characterId ||
          relationship.characterName === characterName,
      );
      const relatedIds = new Set(
        relatedRelationships.map((relationship) => relationship.id),
      );
      const currentCharacterId =
        this.characterSettings?.id || this.characterSettings?.basicInfo?.name;
      const wasActive =
        relatedIds.has(this.activeRelationshipId) ||
        currentCharacterId === characterId ||
        this.characterSettings?.basicInfo?.name === characterName;

      clearTimeout(getStoreRuntime(this).saveTimer);
      getStoreRuntime(this).saveTimer = null;
      await getStoreRuntime(this).saveSequence.catch(() => null);
      try {
        for (const relationship of relatedRelationships) {
          await deleteRelationshipApi(relationship.id);
        }
        this.customCharacters = this.customCharacters.filter(
          (item) => item.id !== characterId,
        );
        localStorage.setItem(
          "customCharacters",
          JSON.stringify(this.customCharacters),
        );
        this._setRelationships(
          this.relationships.filter(
            (relationship) => !relatedIds.has(relationship.id),
          ),
        );
        if (wasActive) {
          this.activeRelationshipId = null;
          this.activeConversationId = null;
          this.conversations = [];
          this._resetSessionState();
          this.persistenceReady = true;
        }
        this.persistenceError = "";
        return { deletedArchiveCount: relatedRelationships.length };
      } catch (error) {
        this._setRelationships(await listRelationshipsApi().catch(() => this.relationships));
        this.persistenceError = `删除角色失败：${error.message}`;
        throw error;
      }
    },

    ...createArchivesActions({ exportArchivesApi, importArchivesApi, listTrashApi, restoreArchiveApi, listRelationshipsApi, cloneValue }),

    ...createMessagingActions({ sendMessageStream, cloneValue }),

  },
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useChatStore, import.meta.hot));
