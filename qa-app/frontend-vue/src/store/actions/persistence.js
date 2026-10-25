import { getStoreRuntime } from '../runtime.js'

export function createPersistenceActions({ updateConversationApi }) {
  return {
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
      clearTimeout(getStoreRuntime(this).saveTimer);
      getStoreRuntime(this).saveTimer = setTimeout(() => this.persistActiveConversation(), 650);
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
      clearTimeout(getStoreRuntime(this).saveTimer);
      getStoreRuntime(this).saveTimer = null;

      const conversationId = this.activeConversationId;
      const payload = this._buildPersistencePayload();
      const signature = JSON.stringify(payload);
      const request = async () => {
        if (!force && getStoreRuntime(this).savedSignatures.get(conversationId) === signature) return null;
        const result = await updateConversationApi(conversationId, payload);
        getStoreRuntime(this).savedSignatures.clear();
        getStoreRuntime(this).savedSignatures.set(conversationId, signature);
        return result;
      };
      getStoreRuntime(this).saveSequence = getStoreRuntime(this).saveSequence.catch(() => null).then(request);

      try {
        const conversation = await getStoreRuntime(this).saveSequence;
        if (conversation) this._upsertConversationMetadata(conversation);
        this.persistenceError = "";
        return conversation || true;
      } catch (error) {
        this.persistenceError = `保存会话失败：${error.message}`;
        console.error(this.persistenceError);
        return null;
      }
    },

  }
}
