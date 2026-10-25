<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowUp, Reading } from '@element-plus/icons-vue'

const emit = defineEmits(['save', 'close'])

const step = ref(1)
const showExample = ref(false)

const characterExample = [
  { label: '角色姓名', value: '林知夏' },
  { label: '年龄', value: '27' },
  { label: '性别', value: '女' },
  { label: '核心性格', value: '冷静理性，外冷内热，观察细致，有责任感' },
  { label: '语调描述', value: '说话简洁克制，熟悉后会流露温柔，偶尔用轻微的反问表达关心' },
  { label: '身份/职业', value: '城市博物馆的文物修复师，擅长从细节中发现线索' },
]

const form = reactive({
  basicInfo: { name: '', age: '', gender: '' },
  personalityStr: '', // 临时字符串，后续转数组
  speechStyleTone: '',
  backgroundIdentity: '',
})

const generateCharacter = () => {
  if (!form.basicInfo.name.trim()) {
    ElMessage.warning('请先填写角色姓名')
    step.value = 1
    return
  }
  const newChar = {
      id: 'custom_' + Date.now(),
      basicInfo: {
        name: form.basicInfo.name || '未知角色',
        age: form.basicInfo.age,
        gender: form.basicInfo.gender,
        userNickname: '你'
      },
      corePersonality: form.personalityStr.split(/[,，;；]/).map(s => s.trim()).filter(Boolean),
      speechStyle: {
        tone: form.speechStyleTone || '普通',
        habits: [], avoid: []
      },
      behaviorRules: ['遵循设定的性格进行回复', '保持对话的连贯性'],
      background: {
        identity: form.backgroundIdentity,
        residence: '', familyMembers: [], history: ''
      },
      preferences: { likes: [], dislikes: [] },
      relationshipState: {
        affection: 10, mood: 0,
        relationshipStage: 'stranger', distance: 'distant'
      },
      memory: { longTerm: [], relationshipMemory: [] },
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${form.basicInfo.name || 'Robot'}`
  }
  emit('save', newChar)
}

const nextStep = () => {
  if (step.value === 1 && !form.basicInfo.name.trim()) {
    ElMessage.warning('请先填写角色姓名')
    return
  }
  step.value += 1
}
</script>

<template>
  <el-dialog
    :model-value="true"
    @close="emit('close')"
    width="min(500px, calc(100vw - 24px))"
    class="wizard-dialog"
    destroy-on-close
  >
    <div class="wizard-container">
      <h2 class="wizard-title">✨ 创建新角色</h2>

      <div class="example-section">
        <el-button text class="example-toggle" @click="showExample = !showExample">
          <el-icon><Reading /></el-icon>
          <span>{{ showExample ? '收起填写示例' : '查看填写示例' }}</span>
          <el-icon><ArrowUp v-if="showExample" /><ArrowDown v-else /></el-icon>
        </el-button>
        <el-collapse-transition>
          <div v-show="showExample" class="character-example">
            <p>例如，想创建一位冷静但温柔的文物修复师，可以这样填写：</p>
            <dl>
              <template v-for="item in characterExample" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </template>
            </dl>
          </div>
        </el-collapse-transition>
      </div>
      
      <el-steps :active="step" finish-status="success" class="wizard-steps" align-center>
        <el-step title="基础信息" />
        <el-step title="性格特征" />
        <el-step title="背景设定" />
      </el-steps>

      <div class="wizard-content">
        <!-- Step 1 -->
        <div v-show="step === 1" class="step-form">
          <el-form label-position="top">
            <el-form-item label="角色姓名">
              <el-input v-model="form.basicInfo.name" placeholder="请输入姓名"/>
            </el-form-item>
            <div style="display:flex; gap: 10px;">
              <el-form-item label="年龄" style="flex:1">
                <el-input v-model="form.basicInfo.age" placeholder="例如: 25"/>
              </el-form-item>
              <el-form-item label="性别" style="flex:1">
                <el-input v-model="form.basicInfo.gender" placeholder="例如: 男 / 女"/>
              </el-form-item>
            </div>
          </el-form>
        </div>

        <!-- Step 2 -->
        <div v-show="step === 2" class="step-form">
          <el-form label-position="top">
            <el-form-item label="核心性格 (逗号分隔)">
              <el-input 
                v-model="form.personalityStr" 
                type="textarea" :rows="3" 
                placeholder="例如: 傲娇, 毒舌, 嘴硬心软" />
            </el-form-item>
            <el-form-item label="语调描述">
              <el-input v-model="form.speechStyleTone" placeholder="例如: 冰冷但偶尔带有隐忍的温柔"/>
            </el-form-item>
          </el-form>
        </div>

        <!-- Step 3 -->
        <div v-show="step === 3" class="step-form">
          <el-form label-position="top">
            <el-form-item label="身份/职业">
              <el-input v-model="form.backgroundIdentity" placeholder="例如: 血族亲王, 总裁, 学生"/>
            </el-form-item>
            <p class="wizard-hint">
              填写这些要素后，系统将自动帮您补齐剩余的设定骨架。
            </p>
          </el-form>
        </div>
      </div>

      <div class="wizard-footer">
        <el-button @click="emit('close')">取消</el-button>
        <el-button v-if="step > 1" @click="step--" plain>上一步</el-button>
        <el-button v-if="step < 3" type="primary" @click="nextStep">下一步</el-button>
        <el-button v-if="step === 3" type="primary" @click="generateCharacter">
          创建角色
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style>
.wizard-dialog .el-dialog {
  border-radius: 20px !important;
  background: var(--bg-glass) !important;
  backdrop-filter: blur(16px) !important;
  border: 1px solid var(--border-glass-strong) !important;
  padding: 0 !important;
}
.wizard-dialog .el-dialog__header { display: none; }
.wizard-dialog .el-dialog__body { padding: 0 !important; }
</style>

<style scoped>
.wizard-container {
  padding: 30px;
}
.wizard-title {
  text-align: center;
  font-size: 20px;
  color: var(--text-primary);
  margin-block-start: 0;
  margin-block-end: 8px;
}
.example-section {
  margin-bottom: 18px;
}
.example-toggle {
  display: flex;
  margin: 0 auto;
  color: var(--text-accent);
}
.character-example {
  margin-top: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--border-glass);
  border-bottom: 1px solid var(--border-glass);
}
.character-example p {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.character-example dl {
  margin: 0;
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
}
.character-example dt {
  color: var(--text-muted);
}
.character-example dd {
  min-width: 0;
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.wizard-steps {
  margin-bottom: 30px;
}
.step-form {
  min-height: 200px;
}
.wizard-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.wizard-hint {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  background: var(--bg-glass-card);
  padding: 10px;
  border-radius: 8px;
}

:deep(.el-form-item__label) {
  color: var(--text-secondary);
  font-weight: 600;
  padding-bottom: 4px;
}

:deep(.el-input__wrapper), :deep(.el-textarea__inner) {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  box-shadow: none !important;
}
:deep(.el-input__wrapper:hover), :deep(.el-textarea__inner:hover) {
  background: var(--input-bg-focus);
}
:deep(.el-input__wrapper.is-focus), :deep(.el-textarea__inner:focus) {
  background: var(--input-bg-focus);
  border-color: var(--primary);
}
</style>
