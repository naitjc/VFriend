<script setup>
import AppHeader from './components/AppHeader.vue'
import CharacterSettings from './components/CharacterSettings.vue'
import ChatArea from './components/ChatArea.vue'
import ConversationSidebar from './components/ConversationSidebar.vue'
import SnowEffect from './components/SnowEffect.vue'
import PopupModal from './components/PopupModal.vue'
import { useChatStore } from './store/chatStore'
import { ref, computed, provide, onMounted, onBeforeUnmount, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'

const chatStore = useChatStore()
const hasSelectedArchive = computed(() => Boolean(chatStore.activeConversationId))
const showSnow = ref(true)
const isMobile = ref(false)
const showDesktopConversations = ref(true)
const settingsDrawerOpen = ref(false)
const conversationDrawerOpen = ref(false)
let mobileMediaQuery
provide('showSnow', showSnow)

const syncLayout = (event) => {
  isMobile.value = event.matches
  if (!event.matches) {
    settingsDrawerOpen.value = false
    conversationDrawerOpen.value = false
  }
}

onMounted(async () => {
  document.documentElement.setAttribute('data-theme', chatStore.currentTheme)

  mobileMediaQuery = window.matchMedia('(max-width: 800px)')
  syncLayout(mobileMediaQuery)
  mobileMediaQuery.addEventListener('change', syncLayout)
  await chatStore.initializeConversations()
})

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener('change', syncLayout)
  chatStore.persistActiveConversation({ force: true })
})

const handleCharacterSelect = (character) => chatStore.setCharacter(character)
const handleBackgroundUpdate = (bg) => chatStore.setChatBackground(bg)
const toggleSettings = () => {
  if (!hasSelectedArchive.value) return
  conversationDrawerOpen.value = false
  settingsDrawerOpen.value = !settingsDrawerOpen.value
}

const toggleConversations = () => {
  if (isMobile.value) {
    settingsDrawerOpen.value = false
    conversationDrawerOpen.value = !conversationDrawerOpen.value
    return
  }
  showDesktopConversations.value = !showDesktopConversations.value
}

// 角色表单和模型滑块会直接修改响应式对象，在这里统一触发防抖保存。
watch(
  () => ({
    userAvatar: chatStore.userAvatar,
    characterSettings: chatStore.characterSettings,
    chatBackground: chatStore.chatBackground,
    modelParams: chatStore.modelParams,
    bookmarkedIndices: chatStore.bookmarkedIndices,
    searchQuery: chatStore.searchQuery,
    showSearch: chatStore.showSearch,
    characterDefaults: chatStore._characterDefaults,
  }),
  () => chatStore.scheduleConversationSave(),
  { deep: true },
)
</script>

<template>
  <div id="app-root">
    <PopupModal />
    <SnowEffect v-if="showSnow" />

    <el-container direction="vertical">
      <AppHeader
        :is-mobile="isMobile"
        :settings-open="settingsDrawerOpen"
        :conversations-open="isMobile ? conversationDrawerOpen : showDesktopConversations"
        @select-character="handleCharacterSelect"
        @update-background="handleBackgroundUpdate"
        @toggle-settings="toggleSettings"
        @toggle-conversations="toggleConversations"
      />
      <el-main>
        <Transition name="settings-panel">
          <ConversationSidebar v-if="!isMobile && showDesktopConversations" />
        </Transition>
        <ChatArea v-if="hasSelectedArchive" :is-mobile="isMobile" />
        <section v-else class="mobile-empty-state">
          <span class="mobile-empty-icon">💬</span>
          <strong>先打开一个聊天存档</strong>
          <p>存档会保存聊天记录、关系状态和角色设定。</p>
          <el-button type="primary" @click="isMobile ? conversationDrawerOpen = true : showDesktopConversations = true">选择或新建存档</el-button>
        </section>
      </el-main>
    </el-container>

    <el-drawer
      v-if="isMobile"
      v-model="conversationDrawerOpen"
      direction="ltr"
      size="88%"
      :with-header="false"
      class="conversation-drawer"
    >
      <div class="mobile-drawer-header">
        <span>选择聊天内容</span>
        <el-button
          :icon="Close"
          circle
          text
          aria-label="返回聊天"
          @click="conversationDrawerOpen = false"
        />
      </div>
      <ConversationSidebar @selected="conversationDrawerOpen = false" />
    </el-drawer>

    <el-drawer
      v-model="settingsDrawerOpen"
      :direction="isMobile ? 'ltr' : 'rtl'"
      :size="isMobile ? '100%' : '380px'"
      :with-header="false"
      class="settings-drawer"
    >
      <div class="mobile-drawer-header">
        <span>角色设置</span>
        <el-button
          :icon="Close"
          circle
          text
          aria-label="关闭角色设置"
          @click="settingsDrawerOpen = false"
        />
      </div>
      <CharacterSettings v-if="hasSelectedArchive" />
    </el-drawer>
  </div>
</template>

<style scoped>
#app-root {
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

:deep(.el-container) {
  box-sizing: border-box;
  height: 92vh;
  width: 96vw;
  max-width: 1450px;
}

:deep(.el-main) {
  overflow: hidden;
  padding: 0;
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

  .mobile-empty-state {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 28px;
    border: 1px solid var(--border-glass);
    border-radius: 16px;
    background: var(--bg-glass-card);
    color: var(--text-secondary);
    text-align: center;
  }

  .mobile-empty-state strong { color: var(--text-primary); font-size: 17px; }
  .mobile-empty-state p { max-width: 260px; margin: 8px 0 18px; font-size: 13px; line-height: 1.6; }
  .mobile-empty-icon { margin-bottom: 12px; font-size: 34px; }

@media (max-width: 800px) {
  #app-root {
    align-items: stretch;
  }

  :deep(.el-container) {
    width: 100%;
    height: 100dvh;
    max-width: none;
    padding: max(6px, env(safe-area-inset-top)) 6px max(6px, env(safe-area-inset-bottom));
  }

  :deep(.el-main) {
    overflow: hidden;
    gap: 0;
  }


}
</style>

<style>
.settings-drawer.el-drawer {
  max-width: 380px;
  background: var(--panel-bg);
}

.conversation-drawer.el-drawer {
  max-width: 360px;
  background: var(--bg-gradient);
}

.conversation-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mobile-drawer-header {
  height: 54px;
  padding: 0 12px 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
  background: var(--bg-glass-hover);
  border-bottom: 1px solid var(--border-glass);
}

.settings-drawer .settings-card {
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
  min-height: 0;
  flex: 1;
  border: none;
  border-radius: 0;
}

.settings-drawer .settings-card > .el-card__header {
  display: none;
}

.settings-drawer .settings-card > .el-card__body {
  height: 100% !important;
}

.conversation-drawer .conversation-sidebar-root {
  min-height: 0;
  flex: 1;
}

@media (max-width: 480px) {
  .conversation-drawer.el-drawer,
  .settings-drawer.el-drawer {
    width: 100% !important;
    max-width: none;
  }
}
</style>
