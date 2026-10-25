import { getStoreRuntime } from '../runtime.js'

export function createNavigationActions({ forkConversationApi, getConversationApi, listRelationshipsApi, cloneValue }) {
  return {
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
      clearTimeout(getStoreRuntime(this).saveTimer);
      getStoreRuntime(this).saveTimer = null;
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

  }
}
