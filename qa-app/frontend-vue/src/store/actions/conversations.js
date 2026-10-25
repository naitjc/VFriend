import { getStoreRuntime } from '../runtime.js'

export function createConversationsActions({ cloneValue, freshRelationshipState, randomInitialMood, initialRelationshipState, textContent, createRelationshipApi, listRelationshipsApi, createNextChapterApi }) {
  return {
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

  }
}
