const MIN_CHAPTER_CHECK_MESSAGES = 8
const CHAPTER_CHECK_INTERVAL = 6
const MIN_GOAL_CHECK_MESSAGES = 8
const GOAL_CHECK_INTERVAL = 6

export function createSuggestionsActions({ requestChapterSuggestionApi, requestGoalSuggestionApi }) {
  return {
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

  }
}
