import { getStoreRuntime } from '../runtime.js'

export function createCharactersActions({ cloneValue, freshRelationshipState, normalizeMemory, confirmRelationship, getConversationApi }) {
  return {
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

  }
}
