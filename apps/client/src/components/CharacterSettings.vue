<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '../store/chatStore'
import StatusPanel from './chat/StatusPanel.vue'
import { DocumentCopy, User } from '@element-plus/icons-vue'
import { previewCharacter } from '../api/index.js'
import { readOptimizedImage } from '../utils/imageFile'

const chatStore = useChatStore()

const settings = computed(() => chatStore.characterSettings)

const hasCharacter = computed(() => !!settings.value?.basicInfo?.name)
const isReadOnly = computed(() => chatStore.isActiveChapterReadOnly || chatStore.isSending)
const trialInput = ref('')
const trialReply = ref('')
const trialBusy = ref(false)
const runTrial = async () => {
  if (!trialInput.value.trim() || trialBusy.value) return
  const conversationId = chatStore.activeConversationId
  trialBusy.value = true
  trialReply.value = ''
  try {
    const reply = await previewCharacter(JSON.parse(JSON.stringify(settings.value)), trialInput.value)
    if (chatStore.activeConversationId === conversationId) trialReply.value = reply
  }
  catch (error) { ElMessage.error(error.message) }
  finally { trialBusy.value = false }
}
watch(() => chatStore.activeConversationId, () => { trialInput.value = ''; trialReply.value = '' })
const avatarInputRef = ref(null)

// 头像上传
const triggerAvatarUpload = () => {
  avatarInputRef.value?.click()
}

const handleAvatarChange = async (e) => {
  const file = e.target.files[0]
  try {
    if (file) {
      chatStore.setBotAvatar(await readOptimizedImage(file, { maxDimension: 512 }))
    }
  } catch (error) {
    ElMessage.error(error.message)
  }
  e.target.value = ''
}

const arrayJoin = (arr) => (arr || []).join('；')
const arraySplit = (val) => (val || '').split(/[；;]/).map(s => s.trim()).filter(Boolean)

// 导出单角色设定（复制）
const copyCharacterSettings = () => {
  if (!hasCharacter.value) return
  const charData = JSON.stringify(settings.value, null, 2)
  navigator.clipboard.writeText(charData)
    .then(() => ElMessage.success('已复制角色设定 JSON 到剪贴板'))
    .catch(() => ElMessage.error('复制失败，请手动操作'))
}

</script>

<template>
  <el-card class="settings-card">
    <template #header>
      <div class="card-header">
        <div style="display:flex; align-items:center;">
          <el-icon :size="18" style="margin-right: 6px;"><User /></el-icon>
          <span>角色设定</span>
        </div>
        
        <!-- 复制角色设定 JSON 方便分享 -->
        <el-tooltip content="复制角色配置 JSON" placement="top">
          <el-button 
            v-if="hasCharacter"
            circle size="small" 
            :icon="DocumentCopy" 
            @click="copyCharacterSettings"
            style="background: transparent; border: none; font-size: 16px;" 
          />
        </el-tooltip>
      </div>
    </template>

    <div class="settings-body">
      <div v-if="!hasCharacter" class="empty-hint">请选择或创建一个角色</div>
      
      <template v-else>
        <!-- 头像区 -->
        <button
          type="button"
          class="avatar-section"
          :class="{ 'no-cursor': isReadOnly }"
          :disabled="isReadOnly"
          aria-label="更换角色头像"
          @click="triggerAvatarUpload"
        >
          <el-avatar :src="settings.avatar" :size="72" class="char-avatar" />
          <div class="avatar-overlay">
            <span>更换头像</span>
          </div>
          <input ref="avatarInputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="handleAvatarChange" />
        </button>

        <!-- 当前角色名 -->
        <div class="char-name-display">{{ settings.basicInfo.name }}</div>

        <StatusPanel />

        <!-- 折叠面板 -->
        <el-collapse class="settings-collapse">
          
          <!-- 基本信息 -->
          <el-collapse-item name="basic">
            <template #title><span class="collapse-title">📋 基本信息</span></template>
            <div class="form-row">
              <el-form-item label="角色名称" style="flex:2">
                <el-input v-model="settings.basicInfo.name" placeholder="顾时夜" :disabled="isReadOnly" />
              </el-form-item>
              <el-form-item label="年龄" style="flex:1">
                <el-input v-model="settings.basicInfo.age" placeholder="31" :disabled="isReadOnly" />
              </el-form-item>
            </div>
            <div class="form-row">
              <el-form-item label="性别" style="flex:1">
                <el-input v-model="settings.basicInfo.gender" placeholder="男" :disabled="isReadOnly" />
              </el-form-item>
              <el-form-item label="称呼用户" style="flex:1.5">
                <el-input v-model="settings.basicInfo.userNickname" placeholder="夫人" :disabled="isReadOnly" />
              </el-form-item>
            </div>
          </el-collapse-item>

          <!-- 性格与风格 -->
          <el-collapse-item name="personality">
            <template #title><span class="collapse-title">🎭 性格与风格</span></template>
            <el-form-item label="核心性格 (分号分隔)">
              <el-input
                :model-value="arrayJoin(settings.corePersonality)"
                @update:model-value="val => settings.corePersonality = arraySplit(val)"
                :disabled="isReadOnly"
                type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
              />
            </el-form-item>
            <el-form-item label="语调描述">
              <el-input v-model="settings.speechStyle.tone" :disabled="isReadOnly" />
            </el-form-item>
          </el-collapse-item>

          <el-collapse-item name="examples">
            <template #title><span class="collapse-title">💬 示例对话与试聊</span></template>
            <el-form-item label="示例对话">
              <el-input v-model="settings.exampleDialogue" type="textarea" :rows="5" maxlength="4000" show-word-limit :disabled="isReadOnly" placeholder="用户：今天不太开心。&#10;角色：要不要坐一会儿？不想说也没关系。" />
            </el-form-item>
            <p class="trial-help">示例只用于学习语气，不会当成已经发生的剧情。</p>
            <el-input v-model="trialInput" type="textarea" :rows="3" maxlength="12000" :disabled="trialBusy" placeholder="输入一句话，看看角色怎样回应" />
            <el-button class="trial-button" :loading="trialBusy" :disabled="!trialInput.trim() || chatStore.isSending" @click="runTrial">试聊</el-button>
            <p class="trial-help">使用当前模型接口；试聊不写入聊天存档，不改变关系和记忆。</p>
            <p v-if="trialReply" class="trial-reply">{{ trialReply }}</p>
          </el-collapse-item>

          <!-- 行为与背景 -->
          <el-collapse-item name="background">
            <template #title><span class="collapse-title">📖 背景设定</span></template>
            <el-form-item label="身份标签">
              <el-input v-model="settings.background.identity" :disabled="isReadOnly" />
            </el-form-item>
            <el-form-item label="行为准则 (分号分隔)">
              <el-input
                :model-value="arrayJoin(settings.behaviorRules)"
                @update:model-value="val => settings.behaviorRules = arraySplit(val)"
                :disabled="isReadOnly"
                type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
              />
            </el-form-item>
          </el-collapse-item>
          
        </el-collapse>
      </template>
    </div>
  </el-card>
</template>

<style scoped>
.trial-help { color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.trial-button { margin-top: 10px; }
.trial-reply { white-space: pre-wrap; overflow-wrap: anywhere; padding: 10px; background: var(--bg-glass); border-radius: 8px; }
.settings-card {
  width: 300px;
  height: 100%;
  flex-shrink: 0;
  border-radius: 20px;
  background: var(--bg-glass-card) !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-glass);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

:deep(.el-card__header) {
  padding: 12px 16px;
  background: var(--bg-glass-hover);
  border-bottom: 1px solid var(--border-glass);
}

:deep(.el-card__body) {
  height: calc(100% - 50px);
  padding: 0;
}

.settings-body {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
  scrollbar-width: none;
}
.settings-body::-webkit-scrollbar { display: none; }

.empty-hint {
  text-align: center;
  margin-top: 50px;
  color: var(--text-muted);
  font-size: 14px;
}

/* 头像区域 */
.avatar-section {
  position: relative;
  width: 72px;
  height: 72px;
  margin: 0 auto 10px;
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
  border: 0;
  background: transparent;
}
.avatar-section.no-cursor { cursor: default; }
.avatar-section.no-cursor .avatar-overlay { display: none; }

.char-avatar {
  width: 72px !important;
  height: 72px !important;
  border: 3px solid var(--border-glass-strong);
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0,0,0,0.45);
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-section:hover .avatar-overlay { opacity: 1; }
.avatar-section:not(.no-cursor):hover .char-avatar { transform: scale(1.03); }

/* 角色名 */
.char-name-display {
  text-align: center;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 14px;
  letter-spacing: 0.5px;
}

/* 折叠面板 */
.settings-collapse { border: none; }

:deep(.el-collapse-item__header) {
  background: transparent;
  border: none;
  font-size: 13px;
  height: 36px;
  padding: 0 4px;
  border-radius: 8px;
  transition: background 0.2s;
  color: var(--text-primary);
}
:deep(.el-collapse-item__header:hover) { background: var(--bg-glass-hover); }
:deep(.el-collapse-item__wrap) { background: transparent; border: none; }
:deep(.el-collapse-item__content) { padding: 8px 4px 4px; }

.collapse-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* 表单 */
.form-row { display: flex; gap: 10px; }

:deep(.el-form-item) { margin-bottom: 10px; }
:deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  padding-bottom: 3px;
}

:deep(.el-input__wrapper), :deep(.el-textarea__inner) {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  box-shadow: none !important;
  font-size: 13px;
  transition: all 0.3s ease;
  color: var(--text-primary);
}
:deep(.el-input__wrapper:hover), :deep(.el-textarea__inner:hover) {
  background: var(--input-bg-focus);
}
:deep(.el-input__wrapper.is-focus), :deep(.el-textarea__inner:focus) {
  background: var(--input-bg-focus);
  border-color: var(--primary);
}
:deep(.el-input.is-disabled .el-input__wrapper), :deep(.el-textarea.is-disabled .el-textarea__inner) {
  background: var(--bg-glass);
  color: var(--text-secondary);
}

@media (max-width: 1000px) { .settings-card { width: 240px; } }
@media (max-width: 800px) {
  .settings-card { width: 100% !important; height: 100% !important; }
  .form-row { flex-direction: column; gap: 0; }
  :deep(.el-collapse-item__header) { min-height: 44px; height: auto; }
  :deep(.el-input__wrapper) { min-height: 42px; }
  :deep(.el-textarea__inner) { min-height: 84px !important; }
}
</style>
