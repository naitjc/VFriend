<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DocumentAdd, MoreFilled, Plus } from '@element-plus/icons-vue'
import { useChatStore } from '../store/chatStore'

const emit = defineEmits(['selected'])
const chatStore = useChatStore()

const createDialogOpen = ref(false)
const isCreating = ref(false)
const isCreatingChapter = ref(false)
const createForm = reactive({ mode: 'free', title: '', goal: '', initialAffection: 10 })

const currentCharacterId = computed(() => chatStore.characterSettings.id || '')
const currentCharacterName = computed(
  () => chatStore.characterSettings.basicInfo?.name || '',
)
const archives = computed(() => {
  const characterId = currentCharacterId.value
  const characterName = currentCharacterName.value
  if (!characterId && !characterName) return []

  return chatStore.relationships.filter((relationship) => (
    (characterId && relationship.characterId === characterId) ||
    (characterName && relationship.characterName === characterName)
  ))
})
const canCreateArchive = computed(
  () => Boolean(currentCharacterName.value) && !chatStore.isSending,
)
const canCreateChapter = computed(
  () => chatStore.isStoryMode &&
    Boolean(chatStore.activeConversationId) &&
    !chatStore.isActiveChapterReadOnly &&
    !chatStore.isSending &&
    !chatStore.isConversationLoading &&
    !isCreatingChapter.value,
)
const chapterActionHint = computed(() => {
  if (chatStore.isSending) return '请等待当前回复完成'
  if (chatStore.isConversationLoading || isCreatingChapter.value) return '正在创建下一章'
  if (chatStore.isActiveChapterReadOnly) return '先返回当前章节，才能进入下一章'
  return ''
})

const formatUpdatedAt = (value) => {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

const displayArchiveTitle = (relationship) => {
  if (relationship.title === `与${relationship.characterName}的关系`) {
    return `${relationship.characterName} · 主线故事`
  }
  if (relationship.title === `${relationship.characterName} · 新关系`) {
    return `${relationship.characterName} · 新故事`
  }
  return relationship.title
}

const archivePreview = relationship => [...(relationship.chapters || [])].reverse().find(chapter => chapter.preview)?.preview || '还没有聊天记录'

const nextDefaultTitle = (mode) => {
  const label = mode === 'story' ? '故事' : '自由聊天'
  const count = archives.value.filter((archive) => archive.mode === mode).length
  return `${currentCharacterName.value} · ${label} ${count + 1}`
}

const chooseMode = (mode) => {
  createForm.mode = mode
  createForm.title = nextDefaultTitle(mode)
  if (mode === 'free') createForm.goal = ''
}

const openCreateDialog = () => {
  if (!currentCharacterName.value) {
    ElMessage.info('请先选择或创建一个角色')
    return
  }
  createForm.mode = 'free'
  createForm.title = nextDefaultTitle('free')
  createForm.goal = ''
  createForm.initialAffection = 10
  createDialogOpen.value = true
}

const submitArchive = async () => {
  const title = createForm.title.trim()
  const goal = createForm.goal.trim()
  if (!title) {
    ElMessage.warning('请输入存档名称')
    return
  }
  if (createForm.mode === 'story' && !goal) {
    ElMessage.warning('故事模式需要设置一个最终目标')
    return
  }

  isCreating.value = true
  try {
    const result = await chatStore.createRelationship(null, {
      title,
      mode: createForm.mode,
      goal,
      initialAffection: createForm.initialAffection,
    })
    if (result) {
      createDialogOpen.value = false
      emit('selected')
    }
  } finally {
    isCreating.value = false
  }
}

const createChapter = async (relationship) => {
  if (!canCreateChapter.value) return
  const currentChapter = chatStore.activeConversation
  const nextNumber = Number(
    currentChapter?.chapterNumber || relationship.chapters?.length || 0,
  ) + 1
  const currentTitle = currentChapter?.title || `第 ${nextNumber - 1} 章`
  try {
    const { value } = await ElMessageBox.prompt(
      `“${currentTitle}”将归档为只读，系统会生成本章提要；关系、记忆和最终目标会继续保留。`,
      `结束本章，进入第 ${nextNumber} 章`,
      {
        inputValue: `第 ${nextNumber} 章`,
        inputPattern: /\S+/,
        inputErrorMessage: '章节名称不能为空',
        confirmButtonText: '确认并进入',
        cancelButtonText: '取消',
      },
    )
    isCreatingChapter.value = true
    const result = await chatStore.createNextChapter({ title: value.trim() })
    if (result) {
      ElMessage.success(`已进入“${result.conversation.title}”`)
      emit('selected')
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '创建章节失败')
    }
  } finally {
    isCreatingChapter.value = false
  }
}

const selectArchive = async (relationship) => {
  if (relationship.id === chatStore.activeRelationshipId) {
    await chatStore.closeActiveConversation()
    emit('selected')
    return
  }
  await chatStore.switchRelationship(relationship.id)
  emit('selected')
}

const selectChapter = async (id) => {
  await chatStore.switchConversation(id)
  emit('selected')
}

const renameArchive = async (relationship) => {
  try {
    const { value } = await ElMessageBox.prompt('输入新的存档名称', '重命名存档', {
      inputValue: displayArchiveTitle(relationship),
      inputPattern: /\S+/,
      inputErrorMessage: '存档名称不能为空',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    await chatStore.renameRelationship(relationship.id, value.trim())
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '重命名失败')
    }
  }
}

const renameChapter = async (chapter) => {
  try {
    const { value } = await ElMessageBox.prompt('输入新的章节名称', '重命名章节', {
      inputValue: chapter.title,
      inputPattern: /\S+/,
      inputErrorMessage: '章节名称不能为空',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    await chatStore.renameConversation(chapter.id, value.trim())
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '重命名失败')
    }
  }
}

const forkChapter = async (relationship, chapter) => {
  const storyCount = archives.value.filter((archive) => archive.mode === 'story').length
  try {
    const { value } = await ElMessageBox.prompt(
      `分支故事会继承“${chapter.title}”结束时的关系、记忆和最终目标，之后独立发展。`,
      '从这里创建分支故事',
      {
        inputValue: `${relationship.characterName} · 分支故事 ${storyCount + 1}`,
        inputPattern: /\S+/,
        inputErrorMessage: '故事名称不能为空',
        confirmButtonText: '创建分支',
        cancelButtonText: '取消',
      },
    )
    await chatStore.forkFromConversation(chapter.id, value.trim())
    emit('selected')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '创建分支失败')
    }
  }
}

const removeArchive = async (relationship) => {
  const contentLabel = relationship.mode === 'story' ? '其中的全部章节' : '全部聊天记录'
  try {
    await ElMessageBox.confirm(
      `删除“${displayArchiveTitle(relationship)}”和${contentLabel}？存档会放入回收站，可从“更多 → 回收站”恢复。`,
      '删除存档',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
    await chatStore.deleteRelationship(relationship.id)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

const handleArchiveCommand = (command, relationship) => {
  if (command === 'rename') renameArchive(relationship)
  if (command === 'delete') removeArchive(relationship)
}

const handleChapterCommand = (command, relationship, chapter) => {
  if (command === 'rename') renameChapter(chapter)
  if (command === 'fork') forkChapter(relationship, chapter)
}
</script>

<template>
  <div class="conversation-sidebar-root">
  <aside class="conversation-sidebar">
    <div class="conversation-header">
      <div class="header-copy">
        <div class="conversation-title">聊天存档</div>
        <div class="conversation-subtitle">
          {{ currentCharacterName ? `${currentCharacterName} · 两种聊天模式` : '先选择一个角色' }}
        </div>
      </div>
      <el-button
        :icon="Plus"
        type="primary"
        plain
        size="small"
        class="new-archive-button"
        :disabled="!canCreateArchive"
        @click="openCreateDialog"
      >
        新建
      </el-button>
    </div>

    <div class="conversation-list">
      <div v-if="chatStore.isConversationLoading && !archives.length" class="list-state">
        <span class="loading-dot"></span>
        正在加载存档
      </div>

      <div v-else-if="!archives.length" class="empty-state">
        <strong>{{ currentCharacterName ? '还没有聊天存档' : '请先选择角色' }}</strong>
        <span>
          {{ currentCharacterName ? '可以随便聊，也可以带着最终目标进入一段故事。' : '选择角色后，再决定用哪种模式开始。' }}
        </span>
        <el-button
          v-if="currentCharacterName"
          type="primary"
          size="small"
          :icon="Plus"
          @click="openCreateDialog"
        >
          选择聊天模式
        </el-button>
      </div>

      <section
        v-for="relationship in archives"
        :key="relationship.id"
        class="archive-card"
        :class="{
          active: relationship.id === chatStore.activeRelationshipId,
          story: relationship.mode === 'story',
        }"
        :data-relationship-id="relationship.id"
      >
        <div class="archive-card-header">
          <button
            type="button"
            class="archive-main"
            @click="selectArchive(relationship)"
          >
            <span class="archive-title-row">
              <span class="archive-title">{{ displayArchiveTitle(relationship) }}</span>
              <span
                v-if="relationship.id === chatStore.activeRelationshipId"
                class="current-badge"
              >
                当前
              </span>
            </span>
            <span class="archive-meta-row">
              <span class="mode-badge" :class="relationship.mode">
                {{ relationship.mode === 'story' ? '故事模式 Beta（测试版）' : '自由模式' }}
              </span>
              <span class="archive-meta">
                <template v-if="relationship.mode === 'story'">
                  {{ relationship.chapters?.length || 0 }} 章 ·
                </template>
                {{ formatUpdatedAt(relationship.updatedAt) }}
              </span>
            </span>
            <span class="archive-preview">{{ archivePreview(relationship) }}</span>
          </button>

          <el-dropdown
            trigger="click"
            placement="bottom-end"
            @command="(command) => handleArchiveCommand(command, relationship)"
          >
            <el-button
              :icon="MoreFilled"
              text
              circle
              size="small"
              class="more-button"
              aria-label="存档操作"
              @click.stop
            />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename">重命名存档</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除存档</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div
          v-if="relationship.id === chatStore.activeRelationshipId"
          class="active-archive-content"
        >
          <div v-if="relationship.mode === 'free'" class="free-mode-note">
            <span class="mode-note-icon">☁️</span>
            <span>
              <strong>随便聊</strong>
              <small>不设目标，也不划分章节。</small>
            </span>
          </div>

          <template v-else>
            <div class="chapter-heading">
              <span>主线章节</span>
              <small>由你手动推进</small>
            </div>

            <div class="chapter-list" aria-label="主线章节">
              <div
                v-for="chapter in relationship.chapters"
                :key="chapter.id"
                class="chapter-row"
                :class="{
                  active: chapter.id === chatStore.activeConversationId,
                  closed: chapter.status === 'closed',
                }"
                :data-chapter-id="chapter.id"
              >
                <button
                  type="button"
                  class="chapter-main"
                  @click="selectChapter(chapter.id)"
                >
                  <span class="chapter-marker">{{ chapter.chapterNumber }}</span>
                  <span class="chapter-copy">
                    <span class="chapter-title">{{ chapter.title }}</span>
                    <span class="chapter-meta">
                      {{ chapter.status === 'closed' ? '过去章节' : '当前章节' }}
                      <template v-if="formatUpdatedAt(chapter.updatedAt)">
                        · {{ formatUpdatedAt(chapter.updatedAt) }}
                      </template>
                    </span>
                  </span>
                </button>

                <el-dropdown
                  trigger="click"
                  placement="bottom-end"
                  @command="(command) => handleChapterCommand(command, relationship, chapter)"
                >
                  <el-button
                    :icon="MoreFilled"
                    text
                    circle
                    size="small"
                    class="more-button chapter-more"
                    aria-label="章节操作"
                    @click.stop
                  />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="rename">重命名章节</el-dropdown-item>
                      <el-dropdown-item command="fork">从这里创建分支故事</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>

            <el-tooltip
              :disabled="canCreateChapter"
              :content="chapterActionHint"
              placement="top"
            >
              <el-button
                :icon="DocumentAdd"
                class="new-chapter-button"
                :disabled="!canCreateChapter"
                :loading="isCreatingChapter"
                @click="createChapter(relationship)"
              >
                结束本章，进入下一章
              </el-button>
            </el-tooltip>
          </template>
        </div>
      </section>

      <div v-if="chatStore.persistenceError" class="persistence-error">
        {{ chatStore.persistenceError }}
      </div>
    </div>
  </aside>

  <el-dialog
    v-model="createDialogOpen"
    title="新建聊天存档"
    width="min(460px, calc(100vw - 24px))"
    class="chat-mode-dialog"
    append-to-body
    :close-on-click-modal="false"
  >
    <div class="dialog-intro">先选择聊天方式。模式创建后固定，避免聊天过程中规则突然改变。</div>

    <div class="mode-options" role="radiogroup" aria-label="聊天模式">
      <button
        type="button"
        class="mode-option free"
        :class="{ selected: createForm.mode === 'free' }"
        role="radio"
        :aria-checked="createForm.mode === 'free'"
        @click="chooseMode('free')"
      >
        <span class="mode-option-icon">☁️</span>
        <span class="mode-option-copy">
          <strong>自由模式</strong>
          <small>任意聊天，不设主线和章节</small>
        </span>
      </button>

      <button
        type="button"
        class="mode-option story"
        :class="{ selected: createForm.mode === 'story' }"
        role="radio"
        :aria-checked="createForm.mode === 'story'"
        @click="chooseMode('story')"
      >
        <span class="mode-option-icon">🎯</span>
        <span class="mode-option-copy">
          <strong>故事模式 <em class="beta-label">Beta</em></strong>
          <small>测试阶段，并非完整版本；设定最终目标后由你推进章节</small>
        </span>
      </button>
    </div>

    <el-form label-position="top" class="archive-form">
      <el-form-item label="存档名称" required>
        <el-input
          v-model="createForm.title"
          maxlength="80"
          placeholder="给这段聊天起个名字"
        />
      </el-form-item>
      <el-form-item v-if="createForm.mode === 'story'" label="最终目标" required>
        <el-input
          v-model="createForm.goal"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="例如：和六花一起找到失落的不可视境界线"
        />
        <div class="goal-help">模型会记住方向，但行动、节奏与章节都由你决定。</div>
      </el-form-item>
      <el-form-item v-if="createForm.mode === 'free'" label="初始好感度">
        <div class="affection-input">
          <el-slider v-model="createForm.initialAffection" :min="0" :max="100" :step="1" />
          <span class="affection-value">{{ createForm.initialAffection }}/100</span>
        </div>
        <div class="goal-help">仅影响这次自由模式存档的初始关系。</div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="createDialogOpen = false">取消</el-button>
      <el-button type="primary" :loading="isCreating" @click="submitArchive">
        {{ createForm.mode === 'story' ? '开始故事' : '开始聊天' }}
      </el-button>
    </template>
  </el-dialog>
  </div>
</template>

<style scoped>
.conversation-sidebar-root {
  width: 286px;
  height: 100%;
  flex-shrink: 0;
}

.conversation-sidebar {
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-glass);
  border-radius: 20px;
  background: var(--bg-glass-card);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-md);
}

.conversation-header {
  min-height: 66px;
  padding: 10px 10px 10px 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--border-glass);
  background: var(--bg-glass-hover);
}

.header-copy { min-width: 0; }
.conversation-title {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 750;
}

.conversation-subtitle {
  max-width: 165px;
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-archive-button {
  flex-shrink: 0;
  margin: 0;
  border-radius: 9px;
}

.conversation-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.archive-card {
  margin-bottom: 9px;
  overflow: hidden;
  border: 1px solid var(--border-glass);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-glass-card) 90%, transparent);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.archive-card.active {
  border-color: color-mix(in srgb, var(--primary) 42%, transparent);
  box-shadow: 0 5px 16px color-mix(in srgb, var(--primary) 9%, transparent);
}

.archive-card.story.active {
  border-color: color-mix(in srgb, #8b5cf6 42%, transparent);
  box-shadow: 0 5px 16px color-mix(in srgb, #8b5cf6 9%, transparent);
}

.archive-card-header {
  min-height: 58px;
  padding: 8px 6px 8px 11px;
  display: flex;
  align-items: center;
  gap: 3px;
  background: var(--bg-glass-hover);
}

.archive-main {
  min-width: 0;
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.archive-title-row,
.archive-meta-row {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
}

.archive-title {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-badge,
.mode-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.current-badge {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary);
}

.archive-meta-row { margin-top: 4px; }
.mode-badge.free {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
}
.mode-badge.story {
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
}
.beta-label {
  margin-left: 3px;
  color: #b45309;
  font-size: 0.72em;
  font-style: normal;
  letter-spacing: 0.02em;
}
.archive-meta,
.chapter-meta {
  color: var(--text-muted);
  font-size: 11px;
}

.more-button {
  flex-shrink: 0;
  margin: 0;
  color: var(--text-secondary);
}

.active-archive-content {
  padding: 8px;
  border-top: 1px solid color-mix(in srgb, var(--border-glass) 80%, transparent);
}

.free-mode-note {
  padding: 9px 10px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 10px;
  background: rgba(14, 165, 233, 0.07);
  color: var(--text-secondary);
}

.mode-note-icon { font-size: 18px; }
.free-mode-note span:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.free-mode-note strong { color: var(--text-primary); font-size: 11px; }
.free-mode-note small { margin-top: 2px; color: var(--text-muted); font-size: 11px; }

.chapter-heading {
  margin: 10px 4px 5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}
.chapter-heading small { color: var(--text-muted); font-size: 11px; font-weight: 400; }

.chapter-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.chapter-list::before {
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 16px;
  width: 1px;
  content: '';
  background: color-mix(in srgb, var(--border-glass) 75%, transparent);
}

.chapter-row {
  min-width: 0;
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
}
.chapter-row:hover { background: var(--bg-glass-hover); }
.chapter-row.active {
  border-color: rgba(139, 92, 246, 0.26);
  background: rgba(139, 92, 246, 0.07);
}
.chapter-row.closed .chapter-marker { opacity: 0.72; }

.chapter-main {
  min-width: 0;
  flex: 1;
  padding: 7px 3px 7px 5px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.chapter-marker {
  z-index: 1;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-glass);
  border-radius: 50%;
  background: var(--bg-glass-card);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 750;
}
.chapter-row.active .chapter-marker {
  border-color: #8b5cf6;
  background: #8b5cf6;
  color: white;
}

.chapter-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.chapter-title {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chapter-more { width: 24px; height: 24px; }

.new-chapter-button {
  width: 100%;
  margin: 8px 0 0;
  border-style: dashed;
  border-radius: 9px;
  color: #7c3aed;
  background: rgba(139, 92, 246, 0.05);
}

.list-state,
.empty-state,
.persistence-error {
  margin: 18px 8px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}
.empty-state {
  min-height: 175px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.empty-state strong { color: var(--text-primary); font-size: 13px; }
.empty-state span { max-width: 205px; }
.empty-state :deep(.el-button) { margin: 3px 0 0; }
.persistence-error {
  padding: 8px;
  color: #dc2626;
  border-radius: 10px;
  background: rgba(220, 38, 38, 0.08);
}
.loading-dot {
  width: 7px;
  height: 7px;
  margin-right: 5px;
  display: inline-block;
  border-radius: 50%;
  background: var(--primary);
  animation: pulse 1s ease-in-out infinite alternate;
}

.dialog-intro {
  margin: -4px 0 14px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.mode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.mode-option {
  padding: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  background: var(--bg-glass-hover);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: 0.2s ease;
}
.mode-option:hover { transform: translateY(-1px); }
.mode-option.free.selected {
  border-color: rgba(14, 165, 233, 0.55);
  background: rgba(14, 165, 233, 0.08);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.08);
}
.mode-option.story.selected {
  border-color: rgba(139, 92, 246, 0.55);
  background: rgba(139, 92, 246, 0.08);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.08);
}
.mode-option-icon { flex-shrink: 0; font-size: 22px; }
.mode-option-copy { min-width: 0; display: flex; flex-direction: column; }
.mode-option-copy strong { color: var(--text-primary); font-size: 13px; }
.mode-option-copy small { margin-top: 3px; color: var(--text-muted); font-size: 12px; line-height: 1.4; }
.archive-form { margin-top: 16px; }
.archive-form :deep(.el-form-item) { margin-bottom: 14px; }
.goal-help { margin-top: 5px; color: var(--text-muted); font-size: 12px; }
.affection-input { display: flex; align-items: center; gap: 14px; width: 100%; }
.affection-input .el-slider { flex: 1; }
.affection-value { min-width: 52px; color: var(--text-primary); font-variant-numeric: tabular-nums; text-align: right; }

@keyframes pulse { to { opacity: 0.25; } }

@media (max-width: 1100px) { .conversation-sidebar-root { width: 244px; } }
@media (max-width: 800px) {
  .conversation-sidebar-root { width: 100%; }
  .conversation-sidebar {
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
  .mode-options { grid-template-columns: 1fr; }
}
</style>

<style scoped>
.archive-preview { display: block; font-size: 12px; line-height: 1.6; margin-top: 7px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 205px; }
</style>
