import runtimeRules from 'rp-core';
import prompts from 'rp-prompt';
const { normalizeMemory, confirmRelationship, initialRelationshipState, historyTokens, estimateTokens, textContent } = runtimeRules;
import { defineStore } from "pinia";
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

const turnControllers = new Map();
const savedSignatures = new Map();
let saveTimer = null;
let saveSequence = Promise.resolve();
const MIN_CHAPTER_CHECK_MESSAGES = 8;
const CHAPTER_CHECK_INTERVAL = 6;
const MIN_GOAL_CHECK_MESSAGES = 8;
const GOAL_CHECK_INTERVAL = 6;
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

    async createRelationship(character = null, options = {}) {
      if (this.isSending) return null;
      const normalizedOptions = typeof options === "string"
        ? { title: options, mode: "free", goal: "" }
        : options || {};
      const {
        title: relationshipTitle = "",
        mode = "free",
        goal = "",
        initialAffection = 10,
        initialMood = null,
        inheritedSummary = "",
      } = normalizedOptions;
      if (
        this.activeConversationId &&
        this.persistenceReady &&
        !this.isActiveChapterReadOnly
      ) {
        if (!await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError || "保存会话失败");
      }

      let template = cloneValue(character);
      if (!template && this.characterSettings.basicInfo?.name) {
        template = cloneValue(this.characterSettings);
        template.relationshipState = cloneValue(
          this._characterDefaults.relationshipState,
        );
        template.memory = cloneValue(this._characterDefaults.memory);
      }
      if (!template?.basicInfo?.name) {
        this.persistenceError = "请先选择或创建一个角色";
        return null;
      }
      template.relationshipState = freshRelationshipState(
        template.relationshipState,
      );
      const affection = mode === "story" ? 0 : Number(initialAffection);
      const normalizedAffection = Number.isFinite(affection)
        ? Math.min(100, Math.max(0, Math.round(affection))) : 10;
      const resolvedInitialMood = inheritedSummary
        ? template.relationshipState.mood
        : initialMood != null && Number.isFinite(Number(initialMood))
          ? Math.min(10, Math.max(-10, Math.round(Number(initialMood)))) : randomInitialMood();
      if (!inheritedSummary) {
        template.relationshipState = initialRelationshipState(template.relationshipState, normalizedAffection, resolvedInitialMood);
      }

      const characterName = template.basicInfo?.name || "";
      const initialDefaults = {
        relationshipState: cloneValue(template.relationshipState),
        memory: cloneValue(template.memory),
      };
      const initialSnapshot = {
        schemaVersion: 1,
        userAvatar: this.userAvatar,
        characterSettings: cloneValue(template),
        conversationHistory: [],
        apiHistory: [],
        chatBackground: null,
        modelParams: { temperature: 0.5, top_p: 0.7 },
        bookmarkedIndices: [],
        searchQuery: "",
        showSearch: false,
        characterDefaults: initialDefaults,
      };
      if (inheritedSummary) {
        initialSnapshot.apiHistory = [{
          role: "system",
          content: `[前情提要] ${String(inheritedSummary).trim()}`,
        }];
      }

      this.isConversationLoading = true;
      try {
        const result = await createRelationshipApi({
          relationshipTitle,
          mode,
          goal,
          initialAffection,
          initialMood: resolvedInitialMood,
          inheritedSummary,
          title: `与${characterName}的对话`,
          characterName,
          preview: "",
          snapshot: initialSnapshot,
        });
        this.activeRelationshipId = result.relationship.id;
        this._setRelationships(await listRelationshipsApi());
        this.conversations = cloneValue(result.relationship.chapters || []);
        this._applyConversation(result.conversation);
        // 创建自由模式时，初始好感度同时作为当前角色面板的运行时状态。
        this.characterSettings.relationshipState.mood = resolvedInitialMood;
        this._characterDefaults.relationshipState.mood = resolvedInitialMood;
        this.persistenceReady = true;
        this.persistenceError = "";
        return result;
      } catch (error) {
        this.persistenceError = `无法新建聊天存档：${error.message}`;
        console.error(this.persistenceError);
        return null;
      } finally {
        this.isConversationLoading = false;
      }
    },

    async createConversation(character = null) {
      if (character || !this.activeRelationshipId) {
        return this.createRelationship(character);
      }
      return this.createNextChapter();
    },

    async createInheritedConversation() {
      if (!this.activeConversationId || this.isSending || this.isConversationLoading) return null;
      if (!await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError || "保存会话失败");
      const lastMessages = (this.apiHistory || []).filter((message, index, all) => message.role === "system" || index >= all.length - 12)
        .map((message) => `${message.role === "user" ? "用户" : message.role === "system" ? "前情" : "角色"}：${textContent(message.content)}`)
        .join("\n");
      const memory = this.characterSettings.memory || {};
      const memoryText = [...(memory.longTerm || []), ...(memory.relationshipMemory || [])]
        .slice(-12).join("；");
      const summary = [
        lastMessages ? `最近对话：${lastMessages}` : "对话尚未形成摘要。",
        memoryText ? `已确认记忆：${memoryText}` : "暂无额外确认记忆。",
      ].join("\n");
      const relationship = this.activeRelationship;
      return this.createRelationship(cloneValue(this.characterSettings), {
        title: `${this.characterSettings.basicInfo?.name || "角色"} · 继承对话`,
        mode: relationship?.mode || "free",
        goal: relationship?.goal || "",
        initialAffection: this.characterSettings.relationshipState?.affection ?? 0,
        initialMood: this.characterSettings.relationshipState?.mood ?? 0,
        inheritedSummary: summary,
      });
    },

    async createNextChapter(suggestion = null) {
      if (
        this.isSending ||
        !this.isStoryMode ||
        !this.activeRelationshipId ||
        !this.activeConversationId ||
        this.isActiveChapterReadOnly
      ) {
        return null;
      }
      if (!await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError || "保存会话失败");
      this.isConversationLoading = true;
      this.persistenceError = "";
      try {
        const result = await createNextChapterApi(this.activeRelationshipId, {
          sourceConversationId: this.activeConversationId,
          title: suggestion?.title || "",
          summary: suggestion?.summary || "",
        });
        this.activeRelationshipId = result.relationship.id;
        this._setRelationships(await listRelationshipsApi());
        this.conversations = cloneValue(result.relationship.chapters || []);
        this._applyConversation(result.conversation);
        return result;
      } catch (error) {
        this.persistenceError = `无法进入下一章：${error.message}`;
        throw error;
      } finally {
        this.isConversationLoading = false;
      }
    },

    async checkChapterSuggestion({ alreadyPersisted = false } = {}) {
      if (
        !this.isStoryMode ||
        !this.activeRelationshipId ||
        !this.activeConversationId ||
        this.isActiveChapterReadOnly ||
        this.isSending ||
        this.isConversationLoading ||
        this.isChapterSuggestionLoading ||
        this.goalSuggestion ||
        this.chapterSuggestion
      ) {
        return null;
      }

      const conversationId = this.activeConversationId;
      const relationshipId = this.activeRelationshipId;
      const messageCount = this._dialogueMessageCount();
      if (this.chapterSuggestionCheck.conversationId !== conversationId) {
        this._resetChapterSuggestion();
      }
      const check = this.chapterSuggestionCheck;
      if (
        messageCount < MIN_CHAPTER_CHECK_MESSAGES ||
        messageCount - check.lastCheckedMessageCount < CHAPTER_CHECK_INTERVAL ||
        messageCount < check.dismissedUntilMessageCount
      ) {
        return null;
      }

      this.isChapterSuggestionLoading = true;
      try {
        if (!alreadyPersisted) {
          const saved = await this.persistActiveConversation({ force: true });
          if (!saved) return null;
        }
        const result = await requestChapterSuggestionApi(relationshipId, {
          sourceConversationId: conversationId,
        });
        if (this.activeConversationId !== conversationId) return null;
        this.chapterSuggestionCheck.lastCheckedMessageCount =
          Number(result.checkedMessageCount) || messageCount;
        this.chapterSuggestion = result.suggestion
          ? { ...result.suggestion, conversationId }
          : null;
        return this.chapterSuggestion;
      } catch (error) {
        console.warn("章节节奏判断失败:", error.message);
        return null;
      } finally {
        if (this.activeConversationId === conversationId) {
          this.isChapterSuggestionLoading = false;
        }
      }
    },

    dismissChapterSuggestion() {
      const messageCount = this._dialogueMessageCount();
      this.chapterSuggestion = null;
      this.chapterSuggestionCheck.dismissedUntilMessageCount =
        messageCount + CHAPTER_CHECK_INTERVAL;
      this.chapterSuggestionCheck.lastCheckedMessageCount = messageCount;
    },

    async checkGoalSuggestion({ alreadyPersisted = false } = {}) {
      if (
        !this.isStoryMode ||
        this.activeRelationship?.goalStatus === "achieved" ||
        !this.activeRelationshipId ||
        !this.activeConversationId ||
        this.isActiveChapterReadOnly ||
        this.isSending ||
        this.isConversationLoading ||
        this.isGoalSuggestionLoading ||
        this.goalSuggestion
      ) {
        return null;
      }

      const conversationId = this.activeConversationId;
      const relationshipId = this.activeRelationshipId;
      const messageCount = this._dialogueMessageCount();
      if (this.goalSuggestionCheck.conversationId !== conversationId) {
        this._resetGoalSuggestion();
      }
      const check = this.goalSuggestionCheck;
      if (
        messageCount < MIN_GOAL_CHECK_MESSAGES ||
        messageCount - check.lastCheckedMessageCount < GOAL_CHECK_INTERVAL ||
        messageCount < check.dismissedUntilMessageCount
      ) {
        return null;
      }

      this.isGoalSuggestionLoading = true;
      try {
        if (!alreadyPersisted) {
          const saved = await this.persistActiveConversation({ force: true });
          if (!saved) return null;
        }
        const result = await requestGoalSuggestionApi(relationshipId, {
          sourceConversationId: conversationId,
        });
        if (this.activeConversationId !== conversationId) return null;
        this.goalSuggestionCheck.lastCheckedMessageCount =
          Number(result.checkedMessageCount) || messageCount;
        this.goalSuggestion = result.suggestion
          ? { ...result.suggestion, conversationId }
          : null;
        if (this.goalSuggestion) this.chapterSuggestion = null;
        return this.goalSuggestion;
      } catch (error) {
        console.warn("故事目标判断失败:", error.message);
        return null;
      } finally {
        if (this.activeConversationId === conversationId) {
          this.isGoalSuggestionLoading = false;
        }
      }
    },

    dismissGoalSuggestion() {
      const messageCount = this._dialogueMessageCount();
      this.goalSuggestion = null;
      this.goalSuggestionCheck.dismissedUntilMessageCount =
        messageCount + GOAL_CHECK_INTERVAL;
      this.goalSuggestionCheck.lastCheckedMessageCount = messageCount;
    },

    async forkFromConversation(conversationId, relationshipTitle = "") {
      if (!conversationId || this.isSending) return null;
      if (
        conversationId === this.activeConversationId &&
        !this.isActiveChapterReadOnly
      ) {
        if (!await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError || "保存会话失败");
      }
      this.isConversationLoading = true;
      this.persistenceError = "";
      try {
        const result = await forkConversationApi(conversationId, {
          relationshipTitle,
        });
        this.activeRelationshipId = result.relationship.id;
        this._setRelationships(await listRelationshipsApi());
        this.conversations = cloneValue(result.relationship.chapters || []);
        this._applyConversation(result.conversation);
        return result;
      } catch (error) {
        this.persistenceError = `无法创建分支故事：${error.message}`;
        throw error;
      } finally {
        this.isConversationLoading = false;
      }
    },

    async switchRelationship(id) {
      if (!id || id === this.activeRelationshipId) return;
      const relationship = this.relationships.find((item) => item.id === id);
      if (!relationship) return;
      const chapters = relationship.chapters || [];
      const target =
        chapters.find((chapter) => chapter.status === "open") ||
        chapters[chapters.length - 1];
      if (target) await this.switchConversation(target.id);
    },

    async closeActiveConversation() {
      if (this.isSending || this.isConversationLoading) return;
      if (this.activeConversationId && !this.isActiveChapterReadOnly) {
        if (!await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError || "保存会话失败");
      }
      clearTimeout(saveTimer);
      saveTimer = null;
      this.activeRelationshipId = null;
      this.activeConversationId = null;
      this.conversations = [];
      this.conversationHistory = [];
      this.apiHistory = [];
      this.streamingContent = "";
      this.stateChangeNotice = null;
      this._resetChapterSuggestion();
      this._resetGoalSuggestion();
    },

    async switchConversation(id) {
      if (
        !id ||
        id === this.activeConversationId ||
        this.isSending ||
        this.isConversationLoading
      ) {
        return;
      }
      if (this.activeConversationId && !this.isActiveChapterReadOnly) {
        if (!await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError || "保存会话失败");
      }

      this.isConversationLoading = true;
      this.persistenceError = "";
      try {
        const conversation = await getConversationApi(id);
        this.activeRelationshipId = conversation.relationshipId;
        const relationship = this.relationships.find(
          (item) => item.id === conversation.relationshipId,
        );
        this.conversations = cloneValue(relationship?.chapters || []);
        this._applyConversation(conversation);
      } catch (error) {
        this.persistenceError = `无法切换会话：${error.message}`;
        console.error(this.persistenceError);
      } finally {
        this.isConversationLoading = false;
      }
    },

    scheduleConversationSave() {
      if (
        !this.persistenceReady ||
        !this.activeConversationId ||
        this.isActiveChapterReadOnly ||
        this._isHydratingConversation ||
        this.isSending
      ) {
        return;
      }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => this.persistActiveConversation(), 650);
    },

    async persistActiveConversation({ force = false } = {}) {
      if (
        !this.activeConversationId ||
        this.isActiveChapterReadOnly ||
        this._isHydratingConversation ||
        (this.isSending && !force)
      ) {
        return null;
      }
      clearTimeout(saveTimer);
      saveTimer = null;

      const conversationId = this.activeConversationId;
      const payload = this._buildPersistencePayload();
      const signature = JSON.stringify(payload);
      const request = async () => {
        if (!force && savedSignatures.get(conversationId) === signature) return null;
        const result = await updateConversationApi(conversationId, payload);
        savedSignatures.clear();
        savedSignatures.set(conversationId, signature);
        return result;
      };
      saveSequence = saveSequence.catch(() => null).then(request);

      try {
        const conversation = await saveSequence;
        if (conversation) this._upsertConversationMetadata(conversation);
        this.persistenceError = "";
        return conversation || true;
      } catch (error) {
        this.persistenceError = `保存会话失败：${error.message}`;
        console.error(this.persistenceError);
        return null;
      }
    },

    async renameConversation(id, title) {
      try {
        const conversation = await renameConversationApi(id, title);
        this._upsertConversationMetadata(conversation);
        this.persistenceError = "";
      } catch (error) {
        this.persistenceError = `重命名失败：${error.message}`;
        throw error;
      }
    },

    async renameRelationship(id, title) {
      try {
        const relationship = await renameRelationshipApi(id, title);
        const index = this.relationships.findIndex((item) => item.id === id);
        if (index >= 0) this.relationships[index] = relationship;
        this.relationships.sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
        );
        this.persistenceError = "";
      } catch (error) {
        this.persistenceError = `存档重命名失败：${error.message}`;
        throw error;
      }
    },

    async updateStoryGoal(id, goal) {
      try {
        const relationship = await updateRelationshipSettingsApi(id, { goal });
        const index = this.relationships.findIndex((item) => item.id === id);
        if (index >= 0) this.relationships[index] = relationship;
        this.relationships.sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
        );
        if (id === this.activeRelationshipId) this._resetGoalSuggestion();
        this.persistenceError = "";
        return relationship;
      } catch (error) {
        this.persistenceError = `目标保存失败：${error.message}`;
        throw error;
      }
    },

    async confirmGoalAchievement() {
      if (!this.activeRelationshipId || !this.goalSuggestion) return null;
      const suggestion = this.goalSuggestion;
      try {
        const relationship = await updateRelationshipSettingsApi(
          this.activeRelationshipId,
          {
            goalStatus: "achieved",
            goalResolution: `${suggestion.reason}；证据：${suggestion.evidence}`,
          },
        );
        const index = this.relationships.findIndex(
          (item) => item.id === relationship.id,
        );
        if (index >= 0) this.relationships[index] = relationship;
        this._resetGoalSuggestion();
        this.persistenceError = "";
        return relationship;
      } catch (error) {
        this.persistenceError = `目标状态保存失败：${error.message}`;
        throw error;
      }
    },

    async reopenStoryGoal(id) {
      try {
        const relationship = await updateRelationshipSettingsApi(id, {
          goalStatus: "active",
        });
        const index = this.relationships.findIndex((item) => item.id === id);
        if (index >= 0) this.relationships[index] = relationship;
        if (id === this.activeRelationshipId) this._resetGoalSuggestion();
        this.persistenceError = "";
        return relationship;
      } catch (error) {
        this.persistenceError = `目标状态保存失败：${error.message}`;
        throw error;
      }
    },

    async deleteRelationship(id) {
      if (!id || this.isSending) return;
      const deletedRelationship = this.relationships.find(
        (relationship) => relationship.id === id,
      );
      const characterTemplate = cloneValue(this.characterSettings);
      const characterDefaults = cloneValue(this._characterDefaults);
      try {
        clearTimeout(saveTimer);
        saveTimer = null;
        await saveSequence.catch(() => null);
        await deleteRelationshipApi(id);
        this._setRelationships(
          this.relationships.filter((relationship) => relationship.id !== id),
        );
        if (this.activeRelationshipId !== id) return;

        this.activeRelationshipId = null;
        this.activeConversationId = null;
        const sameCharacterRelationships = this.relationships.filter(
          (relationship) =>
            relationship.characterId === deletedRelationship?.characterId ||
            relationship.characterName === deletedRelationship?.characterName,
        );
        if (sameCharacterRelationships.length) {
          const nextRelationship = sameCharacterRelationships[0];
          const chapters = nextRelationship.chapters || [];
          const target =
            chapters.find((chapter) => chapter.status === "open") ||
            chapters[chapters.length - 1];
          if (target) {
            this.activeRelationshipId = nextRelationship.id;
            this.conversations = cloneValue(chapters);
            this._applyConversation(await getConversationApi(target.id));
          }
        } else {
          this._resetSessionState();
          this._applyCharacterTemplate(characterTemplate);
          this._characterDefaults = characterDefaults;
          this.conversations = [];
        }
      } catch (error) {
        this.persistenceError = `删除存档失败：${error.message}`;
        throw error;
      }
    },

    setUserAvatar(avatar) {
      this.userAvatar = avatar;
      this.scheduleConversationSave();
    },

    setBotAvatar(avatar) {
      this.characterSettings.avatar = avatar;
      this.scheduleConversationSave();
    },

    async setCharacter(character) {
      if (this.isSending || !character) return;

      const currentId =
        this.characterSettings?.id || this.characterSettings?.basicInfo?.name;
      const nextId = character?.id || character?.basicInfo?.name;
      if (currentId === nextId) return;

      const existingRelationship = this.relationships.find(
        (relationship) =>
          relationship.characterId === nextId ||
          relationship.characterName === character.basicInfo?.name,
      );
      if (existingRelationship) {
        await this.switchRelationship(existingRelationship.id);
        return;
      }
      if (
        this.activeConversationId &&
        this.persistenceReady &&
        !this.isActiveChapterReadOnly
      ) {
        if (!await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError || "保存会话失败");
      }
      this._resetSessionState();
      this._applyCharacterTemplate(character);
      this.activeRelationshipId = null;
      this.activeConversationId = null;
      this.conversations = [];
      this.persistenceError = "";
      this.persistenceReady = true;
    },

    resetCharacter() {
      this._applyCharacterTemplate(null);
      this.scheduleConversationSave();
    },

    updateCharacterSettings(settings) {
      this.characterSettings = cloneValue(settings);
      this.scheduleConversationSave();
    },

    setChatBackground(background) {
      this.chatBackground = background;
      this.scheduleConversationSave();
    },

    setModelParams(params) {
      this.modelParams = { ...this.modelParams, ...params };
      this.scheduleConversationSave();
    },

    async saveMemoryAndProgress(memory, relationshipState = this.characterSettings.relationshipState) {
      if (!this.activeConversationId || this.isSending || this.isConversationLoading || this.isActiveChapterReadOnly) {
        throw new Error("当前存档暂不可修改，请等待回复完成或进入可编辑存档。");
      }
      const previous = cloneValue(this.characterSettings);
      const conversationId = this.activeConversationId;
      this.characterSettings = { ...this.characterSettings, memory: normalizeMemory(memory), relationshipState: cloneValue(relationshipState) };
      if (!await this.persistActiveConversation({ force: true })) {
        if (conversationId === this.activeConversationId) this.characterSettings = previous;
        throw new Error(this.persistenceError || "保存失败");
      }
      this.continuityWarning = "";
      return true;
    },

    async confirmRelationshipStage(stage, evidence) {
      return this.saveMemoryAndProgress(this.characterSettings.memory,
        confirmRelationship(this.characterSettings.relationshipState, stage, evidence));
    },

    async addConfirmedStoryEvent(eventText) {
      const text = String(eventText || "").trim();
      if (!text || !this.isStoryMode || text.length > 600) throw new Error("关键事件需填写 1～600 字。");
      const memory = normalizeMemory(this.characterSettings.memory);
      if (!memory.relationshipMemory.includes(text)) memory.relationshipMemory.push(text);
      return this.saveMemoryAndProgress(memory);
    },

    async clearHistory() {
      if (this.isStoryMode) return this.createNextChapter();
      const name = this.characterSettings.basicInfo?.name || "角色";
      const count = this.relationships.filter(
        (relationship) => relationship.characterName === name && relationship.mode === "free",
      ).length;
      return this.createRelationship(null, {
        mode: "free",
        title: `${name} · 自由聊天 ${count + 1}`,
      });
    },

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

      clearTimeout(saveTimer);
      saveTimer = null;
      await saveSequence.catch(() => null);
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

    async exportBackup() {
      if (this.isSending) throw new Error("请先停止或完成当前回复");
      if (this.activeConversationId && !this.isActiveChapterReadOnly && !await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError);
      return { ...await exportArchivesApi(), customCharacters: cloneValue(this.customCharacters) };
    },
    async importBackup(data) {
      if (this.isSending) throw new Error("请先停止或完成当前回复");
      if (this.activeConversationId && !this.isActiveChapterReadOnly && !await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError);
      const result = await importArchivesApi(data);
      if (Array.isArray(data.customCharacters)) {
        const known = new Set(this.customCharacters.map(character => character.id));
        this.customCharacters.push(...data.customCharacters.filter(character => character?.id && character.basicInfo?.name && !known.has(character.id)));
        try { localStorage.setItem("customCharacters", JSON.stringify(this.customCharacters)); } catch { this.persistenceError = "存档已导入，浏览器角色库空间不足；角色快照仍保存在存档内。"; }
      }
      this._setRelationships(await listRelationshipsApi());
      if (result.relationshipId) await this.switchRelationship(result.relationshipId);
      return result;
    },
    async listDeletedArchives() { return listTrashApi(); },
    async restoreDeletedArchive(id) {
      if (this.isSending) throw new Error("请先停止或完成当前回复");
      const result = await restoreArchiveApi(id);
      this._setRelationships(await listRelationshipsApi());
      if (result?.relationshipId) {
        await this.switchRelationship(result.relationshipId);
        const recovered = this.characterSettings;
        if (recovered.id && !this.customCharacters.some(character => character.id === recovered.id)) {
          this.customCharacters.push(cloneValue(recovered));
          try { localStorage.setItem("customCharacters", JSON.stringify(this.customCharacters)); } catch { /* Snapshot is still persisted in SQLite. */ }
        }
      }
      return result;
    },

    stopGeneration() {
      turnControllers.get(this.activeConversationId)?.abort();
    },

    async retryMessage(index) {
      if (index !== this.retryableMessageIndex || this.isSending) return;
      const question = this.conversationHistory[index]?.requestQuestion;
      if (question) return this.sendMessage(question, { retryIndex: index });
    },

    async sendMessage(question, { retryIndex = null } = {}) {
      if (!question.trim() || this.isSending || !this.activeConversationId || this.isActiveChapterReadOnly) return false;
      const controller = new AbortController();
      turnControllers.set(this.activeConversationId, controller);
      this.isSending = true;
      this.sendPhase = "preparing";
      if (!await this.persistActiveConversation({ force: true }) || controller.signal.aborted) {
        this.isSending = false;
        this.sendPhase = "";
        turnControllers.delete(this.activeConversationId);
        return false;
      }
      if (this.chapterSuggestion) this.dismissChapterSuggestion();
      if (this.goalSuggestion) this.dismissGoalSuggestion();
      if (retryIndex == null) this.addMessage("user", question);
      this.streamingContent = "";
      this.stateChangeNotice = null;
      this.continuityWarning = "";
      const placeholderIndex = retryIndex ?? this.conversationHistory.length;
      const oldMessage = this.conversationHistory[placeholderIndex];
      this.conversationHistory[placeholderIndex] = {
        role: "assistant", displayRole: "bot", content: "", streaming: true,
        timestamp: oldMessage?.timestamp || this._makeTimestamp(), bookmarked: oldMessage?.bookmarked || false,
        requestQuestion: question, delivery: "generating",
      };
      const payload = {
        question,
        history: this.apiHistory.map(({ role, content }) => ({ role, content })),
        characterSettings: cloneValue(this.characterSettings),
        chatContext: {
          mode: this.activeRelationship?.mode || "free",
          goal: this.activeRelationship?.goal || "",
          goalStatus: this.activeRelationship?.goalStatus || "active",
          chapterNumber: this.activeConversation?.chapterNumber || 1,
          chapterTitle: this.activeConversation?.title || "",
        },
        temperature: parseFloat(this.modelParams.temperature.toFixed(2)),
        top_p: parseFloat(this.modelParams.top_p.toFixed(2)),
      };
      let responseCompleted = false;
      let renderTimer;
      let pendingText = "";
      const flush = () => {
        clearTimeout(renderTimer);
        renderTimer = null;
        if (!pendingText) return;
        this.streamingContent += pendingText;
        pendingText = "";
        this.conversationHistory[placeholderIndex].content = this.streamingContent;
      };
      const commitReply = ({ history, relationshipState, stateChange }) => {
        flush();
        if (relationshipState) this.characterSettings.relationshipState = relationshipState;
        this.stateChangeNotice = stateChange || null;
        const notice = this.stateChangeNotice;
        if (notice) setTimeout(() => { if (this.stateChangeNotice === notice) this.stateChangeNotice = null; }, 5000);
        const completeText = history?.at(-1)?.role === "assistant" ? history.at(-1).content : this.streamingContent;
        this.streamingContent = completeText;
        this.conversationHistory[placeholderIndex] = {
          ...this.conversationHistory[placeholderIndex], content: completeText,
          streaming: false, delivery: "complete", error: "",
        };
        if (history) this.apiHistory = history;
        responseCompleted = true;
      };
      try {
        await sendMessageStream(payload, {
          signal: controller.signal,
          onProgress: ({ phase }) => { if (phase === "organizing") { flush(); this.sendPhase = phase; } },
          onChunk: text => {
            if (controller.signal.aborted) return;
            this.sendPhase = "replying";
            pendingText += text;
            if (!renderTimer) renderTimer = setTimeout(flush, 40);
          },
          onReply: data => {
            commitReply(data);
            // Preserve a complete reply even if the app closes during continuity work.
            void this.persistActiveConversation({ force: true });
          },
          onDone: data => {
            commitReply(data);
            if (data.memory) this.characterSettings.memory = data.memory;
            this.continuityWarning = data.continuityWarning || "";
          },
          onError: message => { throw new Error(message); },
        });
      } catch (error) {
        flush();
        const stopped = controller.signal.aborted;
        if (responseCompleted) {
          this.continuityWarning = "回复已保存，本轮事项整理已跳过，可在记忆面板中手动整理。";
        } else {
          this.conversationHistory[placeholderIndex] = {
            ...this.conversationHistory[placeholderIndex],
            content: this.streamingContent,
            streaming: false,
            delivery: stopped ? "stopped" : "failed",
            error: stopped ? "已停止，未完成内容未计入后续上下文" : error.message || "连接中断，请重试",
          };
        }
      } finally {
        flush();
        turnControllers.delete(this.activeConversationId);
        this.isSending = false;
        this.sendPhase = "";
        this.streamingContent = "";
        const saved = await this.persistActiveConversation({ force: true });
        if (responseCompleted && saved && !controller.signal.aborted) {
          await this.checkGoalSuggestion({ alreadyPersisted: true });
          if (!this.goalSuggestion) await this.checkChapterSuggestion({ alreadyPersisted: true });
        }
      }
      return true;
    },
  },
});
