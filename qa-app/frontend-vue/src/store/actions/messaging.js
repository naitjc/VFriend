import { getStoreRuntime } from '../runtime.js'

export function createMessagingActions({ sendMessageStream, cloneValue }) {
  return {
    stopGeneration() {
      getStoreRuntime(this).turnControllers.get(this.activeConversationId)?.abort();
    },

    async retryMessage(index) {
      if (index !== this.retryableMessageIndex || this.isSending) return;
      const question = this.conversationHistory[index]?.requestQuestion;
      if (question) return this.sendMessage(question, { retryIndex: index });
    },

    async sendMessage(question, { retryIndex = null } = {}) {
      if (!question.trim() || this.isSending || !this.activeConversationId || this.isActiveChapterReadOnly) return false;
      const controller = new AbortController();
      getStoreRuntime(this).turnControllers.set(this.activeConversationId, controller);
      this.isSending = true;
      this.sendPhase = "preparing";
      if (!await this.persistActiveConversation({ force: true }) || controller.signal.aborted) {
        this.isSending = false;
        this.sendPhase = "";
        getStoreRuntime(this).turnControllers.delete(this.activeConversationId);
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
        getStoreRuntime(this).turnControllers.delete(this.activeConversationId);
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
  }
}
