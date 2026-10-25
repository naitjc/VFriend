<script setup>
import { computed, ref } from 'vue'
import { guideSections } from '../content/guideSections'
const props = defineProps({ modelValue: Boolean, isMobile: Boolean })
const emit = defineEmits(['update:modelValue'])
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const activeGuideSection = ref(0)
</script>
<template>
  <el-drawer v-model="open" title="VFriend 使用指南" :direction="isMobile ? 'btt' : 'rtl'" :size="isMobile ? '94dvh' : 'min(760px, 92vw)'" class="guide-drawer">
    <div class="guide-layout">
      <nav v-if="!isMobile" class="guide-nav" aria-label="教程章节">
        <button v-for="(section, index) in guideSections" :key="section.title" type="button" :class="{ active: activeGuideSection === index }" @click="activeGuideSection = index">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ section.title }}
        </button>
      </nav>
      <el-select v-else v-model="activeGuideSection" class="guide-mobile-select" aria-label="选择教程章节">
        <el-option v-for="(section, index) in guideSections" :key="section.title" :label="`${index + 1}. ${section.title}`" :value="index" />
      </el-select>
      <article class="guide-content">
        <div class="guide-progress">第 {{ activeGuideSection + 1 }} 章，共 {{ guideSections.length }} 章</div>
        <section>
          <h3>{{ guideSections[activeGuideSection].title }}</h3>
          <p class="guide-lead">{{ guideSections[activeGuideSection].summary }}</p>
          <ol class="guide-steps">
            <li v-for="step in guideSections[activeGuideSection].steps" :key="step.title">
              <strong>{{ step.title }}</strong>
              <p>{{ step.detail }}</p>
            </li>
          </ol>
          <div class="guide-tip"><strong>小提示</strong><span>{{ guideSections[activeGuideSection].tip }}</span></div>
        </section>
      </article>
    </div>
  </el-drawer>
</template>
<style scoped>
.guide-layout { display: flex; gap: 20px; height: 100%; min-height: 0; overflow: hidden; }
.guide-nav { min-height: 0; overflow-y: auto; overscroll-behavior: contain; width: 180px; flex: 0 0 180px; display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border-glass); padding-right: 14px; }
.guide-nav button { border: 0; border-radius: 8px; padding: 9px 10px; text-align: left; background: transparent; color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 12px; }
.guide-nav button span { display: inline-block; width: 26px; color: var(--text-muted); font-size: 10px; }
.guide-nav button:hover, .guide-nav button.active { background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--text-primary); }
.guide-nav button.active span { color: var(--primary); }

.guide-content { min-width: 0; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; overflow-wrap: anywhere; padding-right: 8px; color: var(--text-secondary); line-height: 1.65; }
.guide-content section { padding: 10px 0; border-top: 1px solid var(--border-glass); }
.guide-content h3 { margin: 0 0 6px; color: var(--text-primary); font-size: 20px; }
.guide-content p { margin: 4px 0; font-size: 13px; }
.guide-lead { color: var(--text-secondary); }
.guide-progress { margin-bottom: 8px; color: var(--primary); font-size: 11px; font-weight: 700; }
.guide-steps { margin: 18px 0 0; padding: 0; list-style: none; counter-reset: guide-step; }
.guide-steps li { position: relative; margin: 0 0 12px; padding: 12px 14px 12px 48px; border: 1px solid var(--border-glass); border-radius: 12px; background: var(--bg-glass); counter-increment: guide-step; }
.guide-steps li::before { position: absolute; top: 12px; left: 13px; width: 24px; height: 24px; display: grid; place-items: center; content: counter(guide-step); border-radius: 50%; background: color-mix(in srgb, var(--primary) 16%, transparent); color: var(--primary); font-size: 11px; font-weight: 800; }
.guide-steps strong { color: var(--text-primary); font-size: 13px; }
.guide-steps p { color: var(--text-secondary); line-height: 1.65; }
.guide-tip { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; border-radius: 12px; background: color-mix(in srgb, #f59e0b 10%, var(--bg-glass)); color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.guide-tip strong { color: #b45309; }
.guide-mobile-select { width: 100%; flex-shrink: 0; }

@media (max-width: 800px) {
  .guide-layout { height: 100%; flex-direction: column; gap: 12px; }
  .guide-content { max-height: none; flex: 1; padding-right: 2px; }
  .guide-content h3 { font-size: 18px; }
  .guide-steps li { padding: 11px 12px 11px 44px; }
}


</style>
