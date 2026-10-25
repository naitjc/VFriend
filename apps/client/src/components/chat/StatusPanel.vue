<script setup>
import { computed, ref } from 'vue'
import { useChatStore } from '../../store/chatStore'

const props = defineProps({
  overrideState: { type: Object, default: null }
})

const chatStore = useChatStore()
const state = computed(() => props.overrideState || chatStore.characterSettings.relationshipState)
const showDetails = ref(false)

// 情绪描述
const moodConfig = computed(() => {
  if (!state.value) return { text: '未知', emoji: '😶', cls: 'neutral' }
  const m = state.value.mood
  if (m >= 7)  return { text: '非常开心', emoji: '😄', cls: 'great' }
  if (m >= 3)  return { text: '心情不错', emoji: '😊', cls: 'good' }
  if (m <= -7) return { text: '明显低落', emoji: '😢', cls: 'terrible' }
  if (m <= -3) return { text: '有些沉郁', emoji: '😔', cls: 'bad' }
  return { text: '平静', emoji: '😌', cls: 'neutral' }
})

// 关系阶段
const stageMap = {
  'stranger':     { label: '初识', color: '#94a3b8' },
  'familiar':     { label: '熟悉', color: '#6b7280' },
  'close':        { label: '信任', color: '#60a5fa' },
  'intimate':     { label: '亲密', color: '#f472b6' },
  'life_partner': { label: '长期伴侣', color: '#f97316' },
}

const stageInfo = computed(() => stageMap[state.value?.relationshipStage] || { label: '未知', color: '#94a3b8' })

// 好感度进度条颜色（冷 → 暖 → 热）
const affectionColor = computed(() => {
  const a = state.value?.affection || 0
  if (a >= 90) return '#f97316'   // 橙红 - 相濡以沫
  if (a >= 70) return '#f472b6'   // 粉红 - 亲密
  if (a >= 50) return '#a78bfa'   // 紫 - 接近
  if (a >= 30) return '#60a5fa'   // 蓝 - 熟悉
  return '#94a3b8'                // 灰 - 陌生
})
</script>

<template>
  <div v-if="state" class="status-panel">
    <div class="status-header">
      <div class="status-tags">
        <span class="stage-tag" :style="{ '--stage-color': stageInfo.color }">
          {{ stageInfo.label }}
        </span>
        <span class="mood-tag" :class="moodConfig.cls">
          {{ moodConfig.emoji }} {{ moodConfig.text }}
        </span>
      </div>
      <button
        type="button"
        class="status-toggle"
        :aria-expanded="showDetails"
        @click="showDetails = !showDetails"
      >
        {{ showDetails ? '收起' : '查看状态' }}
      </button>
    </div>

    <Transition name="status-details">
      <div v-if="showDetails" class="status-details">
        <div class="status-item">
          <div class="item-label">
            <span class="label-text">💖 好感度</span>
            <span class="label-val">{{ state.affection }}<span class="unit">/100</span></span>
          </div>
          <div class="progress-wrap">
            <div
              class="progress-bar affection-bar"
              :style="{ width: state.affection + '%', background: affectionColor }"
            ></div>
          </div>
        </div>

        <div class="status-item">
          <div class="item-label">
            <span class="label-text">🌤 情绪值</span>
            <span class="label-val" :class="state.mood < 0 ? 'neg' : 'pos'">
              {{ state.mood > 0 ? '+' : '' }}{{ state.mood }}<span class="unit">/10</span>
            </span>
          </div>
          <div class="progress-wrap">
            <div class="mood-center-line"></div>
            <div
              class="progress-bar mood-bar"
              :style="{
                width: (Math.abs(state.mood) * 5) + '%',
                left: state.mood >= 0 ? '50%' : (50 - Math.abs(state.mood) * 5) + '%',
                background: state.mood >= 0 ? 'linear-gradient(90deg, #34d399, #10b981)' : 'linear-gradient(90deg, #f87171, #ef4444)'
              }"
            ></div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.status-panel {
  padding: 12px;
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  border-radius: 18px;
  border: 1px solid var(--border-color);
  margin-bottom: 16px;
  box-shadow: 0 4px 20px rgba(124, 131, 253, 0.06);
}

/* 顶部 */
.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.status-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.status-toggle {
  flex-shrink: 0;
  padding: 3px 0 3px 8px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.status-toggle:hover {
  color: var(--primary);
}

.status-details {
  padding-top: 14px;
}

.stage-tag {
  background: color-mix(in srgb, var(--stage-color) 12%, transparent);
  color: var(--stage-color);
  border: 1px solid color-mix(in srgb, var(--stage-color) 25%, transparent);
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.4s ease;
}

.mood-tag {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.4s ease;
}
.mood-tag.great   { background: rgba(16, 185, 129, 0.12); color: var(--status-success); border: 1px solid rgba(16,185,129,0.25); }
.mood-tag.good    { background: rgba(52, 211, 153, 0.12); color: var(--status-success); border: 1px solid rgba(52,211,153,0.25); }
.mood-tag.neutral { background: rgba(148,163,184,0.12);   color: var(--text-secondary); border: 1px solid rgba(148,163,184,0.25); }
.mood-tag.bad     { background: rgba(248, 113, 113, 0.12); color: #ef4444; border: 1px solid rgba(248,113,113,0.25); }
.mood-tag.terrible{ background: rgba(239, 68, 68, 0.12);  color: #dc2626; border: 1px solid rgba(239,68,68,0.25); }

/* 状态项 */
.status-item {
  margin-bottom: 12px;
}
.status-item:last-child { margin-bottom: 0; }

.item-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-bottom: 6px;
}

.label-text {
  color: var(--text-secondary);
  font-weight: 500;
}

.label-val {
  font-family: 'Inter', monospace;
  font-weight: 700;
  font-size: 14px;
  color: var(--text-primary);
  transition: color 0.4s;
}
.label-val.pos { color: var(--status-success); }
.label-val.neg { color: #ef4444; }

.unit {
  font-size: 11px;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 1px;
}

/* 进度条 */
.progress-wrap {
  height: 7px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.progress-bar {
  height: 100%;
  border-radius: 10px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1), background 0.6s ease;
}

.affection-bar {
  box-shadow: 0 0 8px rgba(244, 114, 182, 0.4);
}

/* 情绪双向进度条 */
.mood-center-line {
  position: absolute;
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(0,0,0,0.15);
  z-index: 1;
}

.mood-bar {
  position: absolute;
  top: 0;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1), left 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.status-details-enter-active,
.status-details-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.status-details-enter-from,
.status-details-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
