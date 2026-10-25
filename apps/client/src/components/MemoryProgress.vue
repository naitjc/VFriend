<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElTabs, ElTabPane } from 'element-plus'
import { Notebook, EditPen } from '@element-plus/icons-vue'
import 'element-plus/theme-chalk/el-tabs.css'
import 'element-plus/theme-chalk/el-tab-pane.css'
import { useChatStore } from '../store/chatStore'
import rules from '@vfriend/core/rules'

const store = useChatStore()
const open = ref(false)
const busy = ref(false)
const editing = ref(false)
const activeTab = ref('memory')
const draft = ref(rules.normalizeMemory(null))
const facts = ref('')
const events = ref('')
const stage = ref('stranger')
const evidence = ref('')
const sourceId = ref('')
const originalDraft = ref('')
const disabled = computed(() => busy.value || store.isSending || store.isConversationLoading || store.isActiveChapterReadOnly || sourceId.value !== store.activeConversationId)
const currentMemory = computed(() => rules.normalizeMemory(store.characterSettings.memory))
const currentStage = computed(() => rules.STAGES[store.characterSettings.relationshipState?.relationshipStage] || '初识')
const statusNames = { open: '未完成', done: '已完成', cancelled: '已取消' }
const serializeDraft = () => JSON.stringify({ memory: draft.value, facts: facts.value, events: events.value, stage: stage.value, evidence: evidence.value })
const dirty = computed(() => editing.value && serializeDraft() !== originalDraft.value)
const chapterRecap = computed(() => store.activeConversation?.summary || rules.textContent((store.apiHistory || []).find(item => item.role === 'system' && rules.textContent(item.content).startsWith('[上一章提要]'))?.content).replace(/^\[上一章提要\]\s*/, '') || '结束章节后，这里会留下本章回顾。')
const loadDraft = () => {
  sourceId.value = store.activeConversationId
  draft.value = rules.normalizeMemory(store.characterSettings.memory)
  facts.value = draft.value.longTerm.join('\n')
  events.value = draft.value.relationshipMemory.join('\n')
  stage.value = store.characterSettings.relationshipState?.relationshipStage || 'stranger'
  evidence.value = store.characterSettings.relationshipState?.stageEvidence || ''
  originalDraft.value = serializeDraft()
}
const show = () => {
  loadDraft()
  editing.value = false
  activeTab.value = store.isStoryMode ? 'story' : 'memory'
  open.value = true
}
watch(() => store.activeConversationId, () => { open.value = false; editing.value = false })
const beginEdit = () => { loadDraft(); editing.value = true }
const cancelEdit = () => { loadDraft(); editing.value = false }
const closePanel = async (done) => {
  if (busy.value) return
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('这次编辑尚未保存。关闭后将放弃这些修改。', '放弃未保存的修改？', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' })
    } catch { return }
  }
  editing.value = false
  if (typeof done === 'function') done()
  else open.value = false
}
const lines = value => value.split('\n').map(line => line.trim()).filter(Boolean)
const save = async () => {
  if (disabled.value) return
  const memory = rules.normalizeMemory(draft.value)
  memory.longTerm = lines(facts.value)
  memory.relationshipMemory = lines(events.value)
  const previous = currentMemory.value.continuity
  if (memory.continuity.location !== previous.location || memory.continuity.present !== previous.present) delete memory.continuity.sceneEvidence
  for (const item of memory.continuity.pending) {
    const original = previous.pending.find(entry => entry.id === item.id)
    if (!original || original.text !== item.text || original.status !== item.status) delete item.evidence
  }
  if (memory.continuity.pending.some(item => !item.text.trim())) return ElMessage.warning('请填写事项内容，或删除空事项。')
  busy.value = true
  try {
    await store.saveMemoryAndProgress(memory)
    editing.value = false
    loadDraft()
    ElMessage.success('记忆与进展已保存')
  } catch (error) { ElMessage.error(error.message) }
  finally { busy.value = false }
}
const confirmStage = async () => {
  if (disabled.value) return
  try {
    rules.confirmRelationship(store.characterSettings.relationshipState, stage.value, evidence.value)
    await ElMessageBox.confirm(`将关系设为“${rules.STAGES[stage.value]}”。依据：${evidence.value.trim()}`, '确认关系变化', { confirmButtonText: '确认变化', cancelButtonText: '取消' })
    if (disabled.value) return
    busy.value = true
    await store.confirmRelationshipStage(stage.value, evidence.value)
    editing.value = false
    loadDraft()
    ElMessage.success('关系阶段已确认')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message)
  } finally { busy.value = false }
}
const addItem = () => {
  if (draft.value.continuity.pending.length >= 40) return ElMessage.warning('最多保留 40 个事项，请先整理已结束的事项。')
  draft.value.continuity.pending.push({ id: crypto.randomUUID(), text: '', status: 'open' })
}
const editGoal = async () => {
  if (disabled.value) return
  const relationshipId = store.activeRelationshipId
  try {
    const { value } = await ElMessageBox.prompt('写下故事最终想要抵达的结果。修改目标后，达成状态会重新变为进行中。', '修改最终目标', {
      inputValue: store.activeRelationship?.goal || '', inputType: 'textarea',
      inputValidator: value => Boolean(value?.trim()) && value.trim().length <= 500 || '请填写 1～500 字的目标',
      confirmButtonText: '保存目标', cancelButtonText: '取消',
    })
    if (disabled.value || relationshipId !== store.activeRelationshipId) return
    busy.value = true
    await store.updateStoryGoal(relationshipId, value.trim())
    ElMessage.success('目标已保存')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message) }
  finally { busy.value = false }
}
const reopenGoal = async () => {
  if (disabled.value) return
  const relationshipId = store.activeRelationshipId
  try {
    await ElMessageBox.confirm('保留目标内容，将状态改回“进行中”。', '重新开启目标', { confirmButtonText: '重新开启', cancelButtonText: '取消' })
    if (disabled.value || relationshipId !== store.activeRelationshipId) return
    busy.value = true
    await store.reopenStoryGoal(relationshipId)
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message) }
  finally { busy.value = false }
}
</script>

<template>
  <el-button class="memory-trigger" :icon="Notebook" :disabled="store.isConversationLoading" @click="show">{{ store.isStoryMode ? '故事与记忆' : '记忆与进展' }}</el-button>
  <el-drawer v-model="open" title="记忆与进展" size="520px" class="memory-panel" append-to-body :before-close="closePanel" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
    <div class="memory-intro"><span class="memory-character">{{ store.characterSettings.basicInfo?.name }}</span><span class="stage-badge">{{ currentStage }}</span></div>
    <p v-if="store.isActiveChapterReadOnly" class="help">这是归档章节。创建分支后可以继续编辑。</p>
    <p v-else-if="store.isSending" class="help" role="status">本轮回复完成后可以编辑；现在仍可查看已有内容。</p>
    <el-tabs v-model="activeTab">
      <el-tab-pane v-if="store.isStoryMode" label="故事" name="story" :disabled="editing">
        <section class="reading-section">
          <div class="section-heading"><h3>最终目标</h3><span class="item-status" :class="store.activeRelationship?.goalStatus === 'achieved' ? 'done' : 'open'">{{ store.activeRelationship?.goalStatus === 'achieved' ? '已达成' : '进行中' }}</span></div>
          <p class="goal-text">{{ store.activeRelationship?.goal || '尚未设置目标' }}</p>
          <p v-if="store.activeRelationship?.goalResolution" class="help">确认依据：{{ store.activeRelationship.goalResolution }}</p>
          <div class="item-actions">
            <el-button text :icon="EditPen" :disabled="disabled" @click="editGoal">修改目标</el-button>
            <el-button v-if="store.activeRelationship?.goalStatus === 'achieved'" text :disabled="disabled" @click="reopenGoal">重新开启</el-button>
          </div>
        </section>
        <section class="reading-section"><h3>第 {{ store.activeConversation?.chapterNumber || 1 }} 章 · {{ store.activeConversation?.title }}</h3><p class="help">{{ chapterRecap }}</p></section>
        <p class="help">章节切换与分支在“聊天存档”中操作。行动和故事节奏始终由你决定。</p>
      </el-tab-pane>
      <el-tab-pane label="记忆" name="memory" :disabled="editing && activeTab !== 'memory'">
        <template v-if="!editing">
          <section class="reading-section"><h3>重要事实与偏好</h3><ul v-if="currentMemory.longTerm.length" class="memory-list"><li v-for="(fact, index) in currentMemory.longTerm" :key="index">{{ fact }}</li></ul><p v-else class="empty-copy">还没有记录。可以记下你希望角色记住的事。</p></section>
          <section class="reading-section"><h3>共同经历</h3><ul v-if="currentMemory.relationshipMemory.length" class="memory-list"><li v-for="(event, index) in currentMemory.relationshipMemory" :key="index">{{ event }}</li></ul><p v-else class="empty-copy">共同经历会从这里延续到后续章节。</p></section>
          <p class="help">这些内容由你确认，模型不会自动改写。</p>
        </template>
        <template v-else>
          <label class="field-label" for="memory-facts">重要事实与偏好（每行一条）</label><el-input id="memory-facts" v-model="facts" type="textarea" :rows="5" :disabled="disabled" placeholder="例如：我不喝咖啡" />
          <label class="field-label" for="memory-events">共同经历（每行一条）</label><el-input id="memory-events" v-model="events" type="textarea" :rows="5" :disabled="disabled" placeholder="只记录已经发生并确认的经历" />
        </template>
      </el-tab-pane>
      <el-tab-pane label="事项" name="items" :disabled="editing && activeTab !== 'items'">
        <template v-if="!editing">
          <section v-if="store.isStoryMode" class="reading-section scene-reading"><h3>当前场景</h3><dl><dt>地点</dt><dd>{{ currentMemory.continuity.location || '尚未明确' }}</dd><dt>在场人物</dt><dd>{{ currentMemory.continuity.present || '尚未明确' }}</dd></dl></section>
          <h3>约定与未解决事项</h3>
          <p v-if="!currentMemory.continuity.pending.length" class="empty-copy">暂无事项。明确的约定会尝试自动整理，也可以手动添加。</p>
          <article v-for="item in currentMemory.continuity.pending" :key="item.id" class="pending-item reading-item"><span class="item-status" :class="item.status">{{ statusNames[item.status] || '未完成' }}</span><p>{{ item.text }}</p><details v-if="item.evidence"><summary>查看整理依据</summary><p class="help">{{ item.evidence }}</p></details></article>
          <p class="help">模型整理的场景和事项可能有误，可通过编辑修正，或标记为完成、取消。</p>
        </template>
        <template v-else>
          <template v-if="store.isStoryMode"><label class="field-label" for="scene-location">当前地点</label><el-input id="scene-location" v-model="draft.continuity.location" maxlength="200" :disabled="disabled" /><label class="field-label" for="scene-present">在场人物</label><el-input id="scene-present" v-model="draft.continuity.present" maxlength="200" :disabled="disabled" /></template>
          <h3 class="field-label">约定与未解决事项</h3>
          <div v-for="item in draft.continuity.pending" :key="item.id" class="pending-item">
            <el-input v-model="item.text" type="textarea" :rows="2" maxlength="400" :disabled="disabled" aria-label="事项内容" />
            <div class="item-actions"><el-select v-model="item.status" :disabled="disabled" aria-label="事项状态"><el-option label="未完成" value="open" /><el-option label="已完成" value="done" /><el-option label="已取消" value="cancelled" /></el-select><el-button text type="danger" :disabled="disabled" @click="draft.continuity.pending = draft.continuity.pending.filter(entry => entry.id !== item.id)">删除</el-button></div>
          </div>
          <el-button :disabled="disabled" @click="addItem">添加事项</el-button>
        </template>
      </el-tab-pane>
      <el-tab-pane label="关系" name="relationship" :disabled="editing && activeTab !== 'relationship'">
        <template v-if="!editing"><section class="reading-section"><h3>当前关系</h3><p class="relationship-label">{{ currentStage }}</p><p class="help">{{ store.characterSettings.relationshipState?.stageEvidence || '沿用当前存档的关系阶段。' }}</p></section><p class="help">好感表示喜欢的程度，情绪表示当下感受。重大关系变化需要已发生的互动依据，高分不会自动变成承诺。</p></template>
        <template v-else><label class="field-label">关系阶段</label><el-select v-model="stage" :disabled="disabled" aria-label="关系阶段"><el-option v-for="(label, value) in rules.STAGES" :key="value" :label="label" :value="value" /></el-select><label class="field-label" for="relationship-evidence">变化依据</label><el-input id="relationship-evidence" v-model="evidence" type="textarea" :rows="5" maxlength="600" show-word-limit :disabled="disabled" placeholder="例如：共同完成调查后，我们明确表达了对彼此的信任。" /></template>
      </el-tab-pane>
    </el-tabs>
    <template #footer>
      <div class="memory-footer">
        <el-button v-if="editing" :disabled="busy" @click="cancelEdit">取消编辑</el-button><el-button v-else @click="closePanel()">返回聊天</el-button>
        <el-button v-if="editing" type="primary" :loading="busy" :disabled="disabled" @click="activeTab === 'relationship' ? confirmStage() : save()">{{ activeTab === 'relationship' ? '确认关系变化' : '保存修改' }}</el-button>
        <el-button v-else-if="activeTab !== 'story'" :icon="EditPen" :disabled="disabled" @click="beginEdit">{{ activeTab === 'relationship' ? '调整关系' : activeTab === 'items' ? '编辑场景与事项' : '编辑记忆' }}</el-button>
      </div>
    </template>
  </el-drawer>
</template>
<style scoped>
.memory-trigger { flex-shrink: 0; }
.memory-intro, .section-heading, .item-actions, .memory-footer { display: flex; align-items: center; gap: 10px; }
.memory-intro { margin-bottom: 20px; }
.memory-character { font-size: 18px; font-weight: 700; }
.stage-badge, .item-status { padding: 4px 9px; border-radius: 20px; background: var(--bg-glass-hover); color: var(--text-accent); font-size: 12px; font-weight: 600; }
.item-status.done { color: var(--status-success); background: color-mix(in srgb, var(--status-success) 10%, transparent); }
.item-status.cancelled { color: var(--text-secondary); }
.help, .empty-copy { color: var(--text-secondary); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
h3 { margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: var(--text-primary); overflow-wrap: anywhere; }
.section-heading { justify-content: space-between; }
.section-heading h3 { margin: 0; }
.goal-text, .reading-item p { font-size: 15px; line-height: 1.8; margin: 12px 0; overflow-wrap: anywhere; }
.reading-section { margin-bottom: 20px; padding: 18px; border: 1px solid var(--border-glass); border-radius: 14px; background: var(--bg-glass); }
.memory-list { margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.9; overflow-wrap: anywhere; }
.memory-list li + li { margin-top: 8px; }
.field-label { display: block; margin: 18px 0 8px; font-size: 13px; font-weight: 600; }
.pending-item { margin: 12px 0; padding: 14px; border: 1px solid var(--border-glass); border-radius: 12px; }
.item-actions { margin-top: 10px; flex-wrap: wrap; }
.item-actions .el-select { width: 130px; }
details summary { cursor: pointer; font-size: 12px; color: var(--text-secondary); }
dl { display: grid; grid-template-columns: 70px 1fr; gap: 12px; font-size: 14px; line-height: 1.6; }
dt { color: var(--text-secondary); } dd { margin: 0; overflow-wrap: anywhere; }
.relationship-label { margin: 8px 0; font-size: 24px; font-weight: 600; color: var(--text-accent); }
.memory-footer { justify-content: space-between; }
</style>
<style>
.memory-panel.el-drawer { max-width: 100vw; background: var(--panel-bg); color: var(--text-primary); }
.memory-panel .el-drawer__header { margin: 0; padding: 22px 24px; border-bottom: 1px solid var(--border-glass); color: var(--text-primary); }
.memory-panel .el-drawer__body { padding: 20px 24px; }
.memory-panel .el-drawer__footer { padding: 16px 24px max(16px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border-glass); }
.memory-panel .el-tabs__item { font-size: 14px; }
@media (max-width: 600px) {
  .memory-panel.el-drawer { width: 100% !important; }
  .memory-panel .el-drawer__body { padding: 16px; }
  .memory-panel .el-drawer__header { padding: max(18px, env(safe-area-inset-top)) 16px 18px; }
  .memory-panel .el-drawer__footer { padding-left: 16px; padding-right: 16px; }
}
</style>
