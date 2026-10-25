import { getStoreRuntime } from '../runtime.js'

export function createMetadataActions({ renameConversationApi, renameRelationshipApi, updateRelationshipSettingsApi, deleteRelationshipApi, getConversationApi, cloneValue }) {
  return {
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
        clearTimeout(getStoreRuntime(this).saveTimer);
        getStoreRuntime(this).saveTimer = null;
        await getStoreRuntime(this).saveSequence.catch(() => null);
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

  }
}
