<script setup>
import { ref, reactive, inject, computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '../store/chatStore'
import {
  Brush,
  ChatLineRound,
  ChatDotRound,
  Connection,
  Download,
  EditPen,
  MoreFilled,
  PictureFilled,
  Reading,
  RefreshLeft,
  Search,
  Setting,
  User,
} from '@element-plus/icons-vue'
import { saveTextFile, openBackupFile } from '../services/archiveFiles'
import { readOptimizedImage } from '../utils/imageFile'
import { isNativeApp } from '../services/platform'
const GuideDrawer = defineAsyncComponent(() => import('./GuideDrawer.vue'))
const ModelSettingsDialog = defineAsyncComponent(() => import('./ModelSettingsDialog.vue'))
const CharacterWizard = defineAsyncComponent(() => import('./CharacterWizard.vue'))

defineProps({
  isMobile: { type: Boolean, default: false },
  settingsOpen: { type: Boolean, default: false },
  conversationsOpen: { type: Boolean, default: true },
})

const emit = defineEmits([
  'select-character',
  'update-background',
  'toggle-settings',
  'toggle-conversations',
])
const chatStore = useChatStore()
const showSnow = inject('showSnow', ref(true))

const characters = ref([])
const selectedCharacterId = ref('')
const backgroundInputRef = ref(null)
const userAvatarInputRef = ref(null)
const showWizard = ref(false)
const showMoreMenu = ref(false)
const nativeSettingsOpen = ref(false)
const guideOpen = ref(false)
const guideLoaded = ref(false)
watch(guideOpen, open => { if (open) guideLoaded.value = true })

const openGuide = () => {
  showMoreMenu.value = false
  guideOpen.value = true
}

const themes = [
  { id: 'default', label: '✨ 默认', color: '#7c83fd' },
  { id: 'dark',    label: '🌙 暗夜', color: '#818cf8' },
  { id: 'sakura',  label: '🌸 樱花', color: '#e879a0' },
  { id: 'ocean',   label: '🌊 海洋', color: '#0ea5e9' },
]
const defaultUserAvatar = '/avatars/用户默认头像.png'

// 合并预设角色 + 自定义角色
const allCharacters = computed(() => [...characters.value, ...chatStore.customCharacters])

watch(
  () => chatStore.characterSettings.id,
  (characterId) => { selectedCharacterId.value = characterId || '' },
  { immediate: true },
)

onMounted(async () => {
  try {
    const response = await fetch('/characters.json')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data)) throw new Error('角色数据格式错误')
    characters.value = data
  } catch (error) {
    console.error('加载角色失败:', error)
    ElMessage.error('预设角色加载失败，请刷新页面重试')
  }

  if (isNativeApp) {
    try {
      const { loadNativeModelSettings } = await import('../services/nativeModelSettings')
      const settings = await loadNativeModelSettings()
      if (!settings.apiKey) nativeSettingsOpen.value = true
    } catch (error) {
      ElMessage.error(`无法读取模型配置：${error.message}`)
    }
  }
})

const onCharacterSelect = () => {
  const char = allCharacters.value.find(c => c.id === selectedCharacterId.value)
  emit('select-character', char || null)
  showMoreMenu.value = false
}

const triggerBackgroundUpload = () => {
  showMoreMenu.value = false
  backgroundInputRef.value?.click()
}
const handleBackgroundChange = async (e) => {
  const file = e.target.files[0]
  try {
    if (file) {
      emit('update-background', await readOptimizedImage(file, { maxDimension: 1920 }))
    }
  } catch (error) {
    ElMessage.error(error.message)
  }
  e.target.value = ''
}

const resetChatBackground = async () => {
  if (!chatStore.chatBackground) return
  try {
    await ElMessageBox.confirm(
      '将移除当前聊天存档的自定义背景，恢复应用默认背景。',
      '恢复默认背景',
      {
        confirmButtonText: '恢复默认',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    emit('update-background', null)
    showMoreMenu.value = false
    ElMessage.success('已恢复默认聊天背景')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '恢复背景失败')
    }
  }
}

const triggerUserAvatarUpload = () => {
  showMoreMenu.value = false
  userAvatarInputRef.value?.click()
}

const handleUserAvatarChange = async (e) => {
  const file = e.target.files[0]
  try {
    if (file) {
      chatStore.setUserAvatar(await readOptimizedImage(file, { maxDimension: 512 }))
      ElMessage.success('我的头像已更新')
    }
  } catch (error) {
    ElMessage.error(error.message)
  }
  e.target.value = ''
}

const resetUserAvatar = async () => {
  if (chatStore.userAvatar === defaultUserAvatar) return
  try {
    await ElMessageBox.confirm(
      '将当前聊天存档中的个人头像恢复为默认头像。',
      '恢复默认头像',
      {
        confirmButtonText: '恢复默认',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    chatStore.setUserAvatar(defaultUserAvatar)
    showMoreMenu.value = false
    ElMessage.success('已恢复默认头像')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '恢复头像失败')
    }
  }
}

const deleteCustomChar = async (character) => {
  const characterName = character.basicInfo?.name || '未命名角色'
  const archiveCount = chatStore.relationships.filter(relationship => (
    relationship.characterId === character.id
    || relationship.characterName === characterName
  )).length
  const archiveText = archiveCount
    ? `，以及与该角色关联的 ${archiveCount} 个聊天存档和其中全部章节`
    : ''
  try {
    await ElMessageBox.confirm(
      `将移除角色“${characterName}”${archiveText}。关联存档会放入回收站，恢复存档时会带回角色设定。`,
      '确认删除角色',
      {
        confirmButtonText: '删除角色',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true,
      },
    )
  } catch {
    return
  }

  try {
    await chatStore.deleteCustomCharacter(character.id)
    if (selectedCharacterId.value === character.id) selectedCharacterId.value = ''
    showMoreMenu.value = false
    ElMessage.success(archiveCount ? '角色和关联存档已删除' : '角色已删除')
  } catch (error) {
    ElMessage.error(error.message)
  }
}

const archiveWorking = ref(false)
const trashOpen = ref(false)
const deletedArchives = ref([])
const withArchiveAction = async action => {
  if (archiveWorking.value || chatStore.isSending) return
  archiveWorking.value = true
  try { await action() } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '操作失败')
  } finally { archiveWorking.value = false }
}
const exportHistory = () => withArchiveAction(async () => {
  const lines = chatStore.conversationHistory.map(m => {
    const name = m.displayRole === 'user' ? '我' : (m.characterName || chatStore.characterSettings.basicInfo.name || '角色')
    return `[${m.timestamp || ''}] [${name}]: ${m.content}${m.delivery === 'failed' || m.delivery === 'stopped' ? '\n[未完成]' : ''}`
  })
  await saveTextFile(`对话记录_${new Date().toISOString().slice(0, 10)}.txt`, lines.join('\n\n'), 'text/plain')
  showMoreMenu.value = false
})
const exportBackup = () => withArchiveAction(async () => {
  const backup = await chatStore.exportBackup()
  const result = await saveTextFile(`VFriend_完整备份_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup))
  if (!result.cancelled) ElMessage.success('完整备份已导出')
  showMoreMenu.value = false
})
const importBackup = () => withArchiveAction(async () => {
  const text = await openBackupFile()
  if (text == null) return
  if (text.error) throw new Error(text.error)
  let backup
  try { backup = JSON.parse(text) } catch { throw new Error('无法读取备份，请选择完整备份 JSON 文件') }
  if (backup.format !== 'chat-rp-backup' || backup.version !== 1 || !Array.isArray(backup.relationships)) throw new Error('不是受支持的 VFriend 完整备份')
  await ElMessageBox.confirm(`将新增 ${backup.relationships.length} 个存档副本，包含角色设定、关系、记忆和全部章节。`, '导入完整备份', { confirmButtonText: '导入副本', cancelButtonText: '取消' })
  const result = await chatStore.importBackup(backup)
  ElMessage.success(`已导入 ${result.importedCount} 个存档`)
  showMoreMenu.value = false
})
const openTrash = () => withArchiveAction(async () => {
  deletedArchives.value = await chatStore.listDeletedArchives()
  trashOpen.value = true
  showMoreMenu.value = false
})
const restoreDeleted = id => withArchiveAction(async () => {
  await chatStore.restoreDeletedArchive(id)
  deletedArchives.value = await chatStore.listDeletedArchives()
  ElMessage.success('存档及全部章节已恢复')
})

const applyTheme = (theme) => {
  chatStore.setTheme(theme)
  showMoreMenu.value = false
}

const openWizard = () => {
  showWizard.value = true
  showMoreMenu.value = false
}

const openNativeSettings = () => {
  nativeSettingsOpen.value = true
  showMoreMenu.value = false
}

const onWizardSave = (character) => {
  chatStore.saveCustomCharacter(character)
  showWizard.value = false
  emit('select-character', character)
}

const displayName = computed(() => {
  return chatStore.characterSettings.basicInfo.name || ''
})
</script>

<template>
  <el-header class="app-header">
    <div class="header-left">
      <span class="brand-wordmark" title="VFriend" aria-label="VFriend">VFriend</span>
      <el-select
        v-if="!isMobile"
        v-model="selectedCharacterId"
        placeholder="✨ 选择角色"
        @change="onCharacterSelect"
        class="character-select"
      >
        <el-option-group label="预设角色">
          <el-option v-for="c in characters" :key="c.id" :value="c.id" :label="c.basicInfo.name" />
        </el-option-group>
        <el-option-group v-if="chatStore.customCharacters.length" label="我的角色">
          <el-option v-for="c in chatStore.customCharacters" :key="c.id" :value="c.id" :label="c.basicInfo.name">
            <span style="flex: 1;">{{ c.basicInfo.name }}</span>
            <el-button
              size="small"
              type="danger"
              text
              :aria-label="`删除角色 ${c.basicInfo.name}`"
              @click.stop="deleteCustomChar(c)"
              style="padding: 0 4px; margin-left: 8px; font-size: 12px;"
            >✕</el-button>
          </el-option>
        </el-option-group>
      </el-select>

      <template v-if="chatStore.characterSettings.basicInfo.name">
        <el-button
          class="header-avatar-button"
          :class="{ active: settingsOpen }"
          :disabled="!chatStore.activeConversationId"
          aria-label="打开角色设置"
          title="角色设置"
          circle
          @click="emit('toggle-settings')"
        >
          <el-avatar :src="chatStore.characterSettings.avatar" :size="30" class="header-avatar" />
        </el-button>
      </template>

      <span class="header-char-name">{{ displayName || '选择角色' }}</span>
    </div>

    <div class="header-right">
      <el-tooltip :content="conversationsOpen ? '收起聊天存档' : '展开聊天存档'" placement="bottom">
        <el-button
          :icon="ChatLineRound"
          class="icon-btn"
          :class="{ active: conversationsOpen }"
          aria-label="聊天存档"
          @click="emit('toggle-conversations')"
        />
      </el-tooltip>

      <template v-if="!isMobile">
        <el-tooltip content="创建新角色" placement="bottom">
          <el-button :icon="EditPen" class="icon-btn" aria-label="创建新角色" @click="openWizard" />
        </el-tooltip>
      </template>

      <el-tooltip v-if="!isMobile" content="搜索消息" placement="bottom">
        <el-button
          :icon="Search"
          class="icon-btn"
          :class="{ active: chatStore.showSearch }"
          aria-label="搜索消息"
          @click="chatStore.toggleSearch()"
        />
      </el-tooltip>

      <el-popover
        v-model:visible="showMoreMenu"
        placement="bottom-end"
        :width="300"
        trigger="click"
        popper-class="app-more-popover"
      >
        <template #reference>
          <el-button
            :icon="MoreFilled"
            class="icon-btn"
            aria-label="更多操作"
            title="更多操作"
          />
        </template>

        <div class="more-menu">
          <section class="menu-section">
            <div class="menu-actions-grid single-action">
              <el-button class="menu-action" @click="openGuide">
                <el-icon><Reading /></el-icon><span>使用教程</span>
              </el-button>
            </div>
          </section>
          <section v-if="isMobile" class="menu-section">
            <div class="menu-section-title">查找</div>
            <div class="menu-actions-grid single-action">
              <el-button class="menu-action" :class="{ active: chatStore.showSearch }" :disabled="!chatStore.activeConversationId" @click="chatStore.toggleSearch(); showMoreMenu = false">
                <el-icon><Search /></el-icon>
                <span>搜索消息</span>
              </el-button>
            </div>
          </section>

          <section v-if="isMobile" class="menu-section">
            <div class="menu-section-title">角色</div>
            <el-select
              v-model="selectedCharacterId"
              placeholder="切换角色"
              @change="onCharacterSelect"
              class="menu-character-select"
            >
              <el-option-group label="预设角色">
                <el-option v-for="c in characters" :key="c.id" :value="c.id" :label="c.basicInfo.name" />
              </el-option-group>
              <el-option-group v-if="chatStore.customCharacters.length" label="我的角色">
                <el-option v-for="c in chatStore.customCharacters" :key="c.id" :value="c.id" :label="c.basicInfo.name" />
              </el-option-group>
            </el-select>
            <div v-if="chatStore.customCharacters.length" class="mobile-character-list">
              <div class="mobile-character-list-title">管理我的角色</div>
              <div
                v-for="c in chatStore.customCharacters"
                :key="`manage-${c.id}`"
                class="mobile-character-row"
              >
                <span>{{ c.basicInfo.name }}</span>
                <el-button
                  type="danger"
                  text
                  size="small"
                  :aria-label="`删除角色 ${c.basicInfo.name}`"
                  @click="deleteCustomChar(c)"
                >删除</el-button>
              </div>
            </div>
            <div class="menu-actions-grid compact-actions single-action">
              <el-button class="menu-action" @click="openWizard">
                <el-icon><EditPen /></el-icon>
                <span>创建角色</span>
              </el-button>
            </div>
          </section>

          <section class="menu-section">
            <div class="menu-section-title"><el-icon><User /></el-icon> 我的头像</div>
            <div class="user-avatar-setting">
              <el-avatar :src="chatStore.userAvatar" :size="42" />
              <div class="user-avatar-actions">
                <el-button
                  size="small"
                  :disabled="chatStore.isActiveChapterReadOnly"
                  @click="triggerUserAvatarUpload"
                >更换头像</el-button>
                <el-button
                  size="small"
                  text
                  :disabled="chatStore.userAvatar === defaultUserAvatar || chatStore.isActiveChapterReadOnly"
                  @click="resetUserAvatar"
                >恢复默认</el-button>
              </div>
            </div>
          </section>

          <section class="menu-section">
            <div class="menu-section-title"><el-icon><Brush /></el-icon> 外观</div>
            <div class="theme-grid">
              <button
                v-for="t in themes" :key="t.id"
                type="button"
                class="theme-item"
                :class="{ selected: chatStore.currentTheme === t.id }"
                :style="{ '--dot-color': t.color }"
                @click="applyTheme(t.id)"
              >
                <span class="theme-dot"></span>
                <span>{{ t.label }}</span>
              </button>
            </div>
            <div class="menu-actions-grid">
              <el-button class="menu-action" :class="{ active: showSnow }" @click="showSnow = !showSnow">
                <span class="menu-action-emoji">❄</span>
                <span>{{ showSnow ? '关闭特效' : '开启特效' }}</span>
              </el-button>
              <el-button class="menu-action" @click="triggerBackgroundUpload">
                <el-icon><PictureFilled /></el-icon>
                <span>{{ chatStore.chatBackground ? '更换背景' : '聊天背景' }}</span>
              </el-button>
              <el-button
                class="menu-action background-reset-action"
                :disabled="!chatStore.chatBackground"
                @click="resetChatBackground"
              >
                <el-icon><RefreshLeft /></el-icon>
                <span>恢复默认背景</span>
              </el-button>
            </div>
          </section>

          <section class="menu-section">
            <div class="menu-section-title"><el-icon><ChatDotRound /></el-icon> 对话</div>
            <div class="menu-actions-grid">
              <el-button class="menu-action" :disabled="!chatStore.conversationHistory.length" @click="exportHistory">
                <el-icon><Download /></el-icon>
                <span>导出聊天文本</span>
              </el-button>
            </div>
          </section>

          <section class="menu-section">
            <div class="menu-section-title">存档与备份</div>
            <div class="menu-actions-grid">
              <el-button class="menu-action" :disabled="chatStore.isSending || archiveWorking" @click="exportBackup">完整备份</el-button>
              <el-button class="menu-action" :disabled="chatStore.isSending || archiveWorking" @click="importBackup">导入备份</el-button>
              <el-button class="menu-action" :disabled="chatStore.isSending || archiveWorking" @click="openTrash">回收站</el-button>
            </div>
          </section>
          <section class="menu-section model-params-section">
            <div class="menu-section-title"><el-icon><Setting /></el-icon> 模型参数</div>
            <div class="model-param-row">
              <div class="model-param-label">
                <span>Temperature</span>
                <strong>{{ chatStore.modelParams.temperature.toFixed(2) }}</strong>
              </div>
              <el-slider
                v-model="chatStore.modelParams.temperature"
                :min="0"
                :max="1"
                :step="0.01"
                :show-tooltip="false"
                aria-label="Temperature"
              />
            </div>
            <div class="model-param-row">
              <div class="model-param-label">
                <span>Top-P</span>
                <strong>{{ chatStore.modelParams.top_p.toFixed(2) }}</strong>
              </div>
              <el-slider
                v-model="chatStore.modelParams.top_p"
                :min="0.01"
                :max="1"
                :step="0.01"
                :show-tooltip="false"
                aria-label="Top-P"
              />
            </div>
          </section>

          <section class="menu-section">
            <div class="menu-section-title"><el-icon><Connection /></el-icon> 模型服务</div>
            <div class="menu-actions-grid single-action">
              <el-button class="menu-action" @click="openNativeSettings">
                <el-icon><Setting /></el-icon>
                <span>模型 API 设置</span>
              </el-button>
            </div>
          </section>
        </div>
      </el-popover>

      <input ref="backgroundInputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="handleBackgroundChange">
      <input ref="userAvatarInputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="handleUserAvatarChange">
    </div>
  </el-header>

  <el-dialog v-model="trashOpen" title="存档回收站" width="min(92vw, 520px)">
    <p class="native-settings-note">删除的存档保留在这里，可恢复全部章节、角色、关系与记忆。</p>
    <p v-if="!deletedArchives.length" class="native-settings-note">回收站为空</p>
    <div v-for="item in deletedArchives" :key="item.id" class="trash-row">
      <div><strong>{{ item.title }}</strong><small>{{ new Date(item.deletedAt).toLocaleString('zh-CN') }}</small></div>
      <el-button :disabled="archiveWorking || chatStore.isSending" @click="restoreDeleted(item.id)">恢复存档</el-button>
    </div>
  </el-dialog>
  <!-- 角色创建向导 -->
  <CharacterWizard v-if="showWizard" @save="onWizardSave" @close="showWizard = false" />

  <ModelSettingsDialog v-if="nativeSettingsOpen" v-model="nativeSettingsOpen" />

  <GuideDrawer v-if="guideLoaded" v-model="guideOpen" :is-mobile="isMobile" />

</template>

<style scoped>
.app-header {
  height: auto !important;
  padding: 10px 18px;
  background: var(--bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--border-glass-strong);
  box-shadow: var(--shadow-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: var(--transition);
}

.brand-wordmark { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; padding-right: 12px; border-right: 1px solid var(--border-glass-strong); color: var(--text-accent); font-size: 18px; font-weight: 750; line-height: 1.1; letter-spacing: -0.4px; }

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.guide-button { padding-inline: 10px; }

.character-select { width: 150px; }
:deep(.character-select .el-input__wrapper) {
  border-radius: 12px;
  background: var(--input-bg);
  border: 1px solid var(--border-glass);
  box-shadow: none !important;
  color: var(--text-primary);
}

.header-avatar {
  border: 2px solid rgba(124, 131, 253, 0.4);
  box-shadow: var(--shadow-primary);
}

.header-avatar-button {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  padding: 1px !important;
  overflow: hidden;
  background: transparent !important;
  border: 1px solid transparent !important;
}

.header-avatar-button.active {
  border-color: var(--primary) !important;
}

.header-avatar-button:disabled {
  opacity: 0.55;
}

.header-char-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-accent);
  letter-spacing: 0.3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 图标按钮 */
.icon-btn {
  width: 34px !important; height: 34px !important;
  border-radius: 10px !important;
  background: var(--bg-glass) !important;
  border: 1px solid var(--border-glass) !important;
  font-size: 15px;
  transition: var(--transition);
  padding: 0 !important;
  color: var(--text-primary) !important;
  min-width: unset !important;
}
.icon-btn:hover {
  background: var(--bg-glass-hover) !important;
  transform: translateY(-1px);
  box-shadow: var(--shadow-primary);
}
.icon-btn.active {
  background: rgba(124, 131, 253, 0.2) !important;
  border-color: var(--primary) !important;
}
.more-menu {
  color: var(--text-primary);
}

.menu-section + .menu-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-glass);
}

.menu-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 9px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.menu-character-select {
  width: 100%;
  margin-bottom: 8px;
}

.mobile-character-list {
  margin: 2px 0 8px;
  padding: 7px 9px;
  border: 1px solid var(--border-glass);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-glass) 88%, transparent);
}

.mobile-character-list-title {
  margin-bottom: 2px;
  color: var(--text-muted);
  font-size: 10px;
}

.mobile-character-row {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.mobile-character-row :deep(.el-button) {
  margin: 0;
  padding: 4px;
}

.menu-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.user-avatar-setting {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar-setting :deep(.el-avatar) {
  flex-shrink: 0;
  border: 2px solid var(--border-glass-strong);
}

.user-avatar-actions {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.user-avatar-actions :deep(.el-button) {
  margin: 0;
}

.compact-actions {
  margin-top: 0;
}

.single-action {
  grid-template-columns: 1fr;
}

.menu-action {
  width: 100%;
  margin: 0 !important;
  justify-content: flex-start;
  gap: 7px;
  border-radius: 10px;
  color: var(--text-secondary);
  background: var(--bg-glass);
  border-color: var(--border-glass);
}

.menu-action:hover,
.menu-action.active {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 45%, transparent);
  background: color-mix(in srgb, var(--primary) 9%, transparent);
}

.background-reset-action {
  grid-column: 1 / -1;
}

.model-param-row + .model-param-row {
  margin-top: 10px;
}

.model-param-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.model-param-label strong {
  color: var(--text-accent);
  font-family: monospace;
  font-size: 12px;
}

.model-param-row :deep(.el-slider) {
  height: 24px;
}

.menu-action-emoji {
  width: 1em;
  text-align: center;
}

.native-settings-note {
  margin: 0 0 16px;
  padding: 10px 12px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.6;
}

.danger-action,
.danger-action:hover {
  color: #dc2626;
}

.theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.theme-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  text-align: left;
  background: transparent;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.theme-item:hover { background: var(--bg-glass-hover); }
.theme-item.selected { border-color: var(--dot-color); background: color-mix(in srgb, var(--dot-color) 8%, transparent); }
.theme-dot {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--dot-color);
  flex-shrink: 0;
}

@media (max-width: 800px) {
  .app-header {
    min-height: 52px;
    padding: 8px 10px;
    margin-bottom: 10px;
    border-radius: 16px;
  }

  .brand-wordmark { font-size: 15px; padding-right: 8px; }

  .header-left {
    gap: 8px;
    max-width: calc(100% - 128px);
  }

  .header-avatar {
    width: 30px !important;
    height: 30px !important;
  }

  .header-char-name {
    font-size: 13px;
  }

  .header-right {
    gap: 4px;
  }

  .icon-btn {
    width: 36px !important;
    height: 36px !important;
  }
}
</style>

<style>
.guide-drawer { max-width: 100vw; max-height: 100dvh; }
.guide-drawer .el-drawer__header {
  flex-shrink: 0;
  margin-bottom: 0;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-glass);
}
.guide-drawer .el-drawer__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 18px;
}
@media (max-width: 800px) {
  .app-more-popover {
    max-width: calc(100vw - 20px) !important;
    max-height: calc(100dvh - 82px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .guide-drawer .el-drawer__header {
    min-height: 58px;
    margin-bottom: 0;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-glass);
  }

  .guide-drawer .el-drawer__body {
    min-height: 0;
    padding: 14px 16px max(16px, env(safe-area-inset-bottom)) !important;
  }
}
</style>

<style scoped>
.trash-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border-glass); }
.trash-row div { display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
.trash-row small { color: var(--text-secondary); }
</style>
