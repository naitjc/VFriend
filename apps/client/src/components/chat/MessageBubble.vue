<script setup>
import { useChatStore } from '../../store/chatStore'
import { ref, computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElMessage } from 'element-plus'
import { readOptimizedImage } from '../../utils/imageFile'

marked.setOptions({ breaks: true })

const props = defineProps({
  msg: { type: Object, required: true },
  index: { type: Number },
  searchQuery: { type: String, default: '' },
})
const emit = defineEmits(['toggle-bookmark'])

const chatStore = useChatStore()
const avatarInputRef = ref(null)

const isUser = computed(() => props.msg.displayRole === 'user')

// 时间戳
const formattedTime = computed(() => {
  if (!props.msg.timestamp) return ''
  const date = new Date(props.msg.timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})

// 高亮搜索词
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const highlightSearch = (text) => {
  if (!props.searchQuery) return text
  const regex = new RegExp(`(${escapeRegExp(props.searchQuery)})`, 'gi')
  return text.replace(regex, '<mark class="search-highlight">$1</mark>')
}

// 渲染 Markdown（仅对 bot 消息）
const renderedContent = computed(() => {
  if (isUser.value) return null
  let text = props.msg.content || ''
  text = highlightSearch(text)
  return DOMPurify.sanitize(marked.parse(text))
})

// 用户消息纯文本高亮
const userContent = computed(() => DOMPurify.sanitize(
  highlightSearch(props.msg.content || ''),
  { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: ['class'] },
))

const triggerAvatarUpload = () => avatarInputRef.value.click()
const handleAvatarChange = async (e) => {
  const file = e.target.files[0]
  try {
    if (file) {
      const image = await readOptimizedImage(file, { maxDimension: 512 })
      if (isUser.value) chatStore.setUserAvatar(image)
      else chatStore.setBotAvatar(image)
    }
  } catch (error) {
    ElMessage.error(error.message)
  }
  e.target.value = ''
}

const avatarSrc = computed(() => {
  if (isUser.value) return chatStore.userAvatar
  return chatStore.characterSettings.avatar
})

</script>

<template>
  <div class="chat-message-item" :class="isUser ? 'is-user' : 'is-bot'">
    
    <!-- 头像 -->
    <div class="avatar-col">
      <button
        v-if="!chatStore.isActiveChapterReadOnly"
        type="button"
        class="avatar-button"
        :aria-label="isUser ? '更换我的头像' : '更换角色头像'"
        @click="triggerAvatarUpload"
      >
        <el-avatar
          :src="avatarSrc"
          :size="42"
          class="message-avatar clickable"
        />
      </button>
      <el-avatar
        v-else
        :src="avatarSrc"
        :size="42"
        class="message-avatar"
      />
      <input v-if="!chatStore.isActiveChapterReadOnly" ref="avatarInputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="handleAvatarChange">
    </div>

    <!-- 消息区域 -->
    <div class="message-col">
      <div class="message-header" :class="isUser ? 'align-end' : 'align-start'">
        <span class="message-time">{{ formattedTime }}</span>
        <button
          type="button"
          class="bookmark-icon" 
          :class="{ active: msg.bookmarked }"
          @click="emit('toggle-bookmark')"
          :aria-label="msg.bookmarked ? '取消书签' : '添加书签'"
        >
          {{ msg.bookmarked ? '⭐' : '☆' }}
        </button>
      </div>

      <div class="bubble-wrapper">
        <div class="message-bubble" :class="isUser ? 'user-bubble' : 'bot-bubble'">
          <!-- Bot 消息渲染 Markdown；用户消息纯文本 -->
          <div v-if="isUser" class="md-content plain" v-html="userContent"></div>
          <div v-else class="md-content" v-html="renderedContent"></div>
        </div>
      </div>
      <div v-if="msg.delivery === 'failed' || msg.delivery === 'stopped'" class="delivery-notice" role="status">
        <span>{{ msg.error || '回复未完成' }}</span>
        <el-button v-if="index === chatStore.retryableMessageIndex && !chatStore.isActiveChapterReadOnly" size="small" :disabled="chatStore.isSending" @click="chatStore.retryMessage(chatStore.retryableMessageIndex)">重试本轮</el-button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.chat-message-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  max-width: min(88%, 830px);
}

.is-user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.is-bot {
  flex-direction: row;
  align-self: flex-start;
}

.avatar-col {
  flex-shrink: 0;
  margin-top: 16px; /* 对齐消息头与气泡 */
}

.message-avatar {
  border: 2px solid var(--border-glass-strong);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.message-avatar.clickable { cursor: pointer; }
.message-avatar.clickable:hover {
  transform: scale(1.08);
  box-shadow: var(--shadow-md);
}

.avatar-button,
.bookmark-icon {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.avatar-button { display: block; border-radius: 50%; }

.message-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.align-end { flex-direction: row-reverse; }
.align-start { flex-direction: row; }

.bookmark-icon {
  cursor: pointer;
  opacity: 0.3;
  transition: all 0.2s;
  font-size: 14px;
}
.bookmark-icon:hover { opacity: 0.8; transform: scale(1.2); }
.bookmark-icon.active { opacity: 1; color: #fbbf24; }
.chat-message-item:hover .bookmark-icon { opacity: 0.8; }
.chat-message-item:hover .bookmark-icon.active { opacity: 1; }

.bubble-wrapper {
  display: flex;
  flex-direction: column;
}

.message-bubble {
  padding: 12px 18px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.7;
  box-shadow: var(--shadow-sm);
  word-break: break-word;
  transition: transform 0.2s ease;
}

.chat-message-item:hover .message-bubble {
  transform: translateY(-1px);
}

.user-bubble {
  background: var(--user-bubble-bg);
  color: var(--user-bubble-text);
  border-bottom-right-radius: 5px;
  border: 1px solid var(--border-glass-strong);
}

.bot-bubble {
  background: var(--bot-bubble-bg);
  backdrop-filter: blur(8px);
  color: var(--bot-bubble-text);
  border-bottom-left-radius: 5px;
  border: 1px solid var(--bot-bubble-border);
}

.plain { white-space: pre-wrap; }
.delivery-notice { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); padding: 6px 2px; }

@media (max-width: 800px) {
  .chat-message-item {
    max-width: 96%;
    gap: 7px;
  }

  .avatar-col { margin-top: 14px; }

  .message-avatar {
    width: 34px !important;
    height: 34px !important;
  }

  .message-bubble {
    padding: 10px 13px;
    border-radius: 15px;
    font-size: 14px;
    line-height: 1.65;
  }

  .message-header { font-size: 11px; }
  .bookmark-icon { opacity: 0.55; }
}
</style>
