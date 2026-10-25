<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { isNativeApp } from '../services/platform'
import { FIXED_NATIVE_MODEL } from '../services/nativeModelConfig'
import { clearWebModelSettings, loadWebModelSettings, saveWebModelSettings } from '../services/webModelSettings'
import { testWebModelConnection } from '../api/index.js'
const nativeSettingsService = () => import('../services/nativeModelSettings')
const nativeLlmService = () => import('../services/nativeLlmRuntime')
const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const nativeSettingsOpen = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const isTestingNativeModel = ref(false)
const isSavingNativeModel = ref(false)
const nativeModelSettings = reactive({ apiURL: '', apiKey: '' })
const webModelSettings = reactive({ apiURL: '', apiKey: '', model: '' })
const activeModelSettings = computed(() => isNativeApp ? nativeModelSettings : webModelSettings)
const loadSettings = async () => {
  if (isNativeApp) {
    const { loadNativeModelSettings } = await nativeSettingsService()
    Object.assign(nativeModelSettings, await loadNativeModelSettings())
  } else {
    Object.assign(webModelSettings, loadWebModelSettings())
  }
}

const saveNativeSettings = async () => {
  isSavingNativeModel.value = true
  try {
    if (isNativeApp) {
      const { saveNativeModelSettings } = await nativeSettingsService()
      Object.assign(
        nativeModelSettings,
        await saveNativeModelSettings(nativeModelSettings),
      )
    } else {
      Object.assign(webModelSettings, saveWebModelSettings(webModelSettings))
    }
    nativeSettingsOpen.value = false
    ElMessage.success(isNativeApp ? '模型配置已安全保存在本机' : '模型配置已保存到当前浏览器会话')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isSavingNativeModel.value = false
  }
}

const testNativeSettings = async () => {
  isTestingNativeModel.value = true
  try {
    if (isNativeApp) {
      const { normalizeNativeModelSettings } = await nativeSettingsService()
      const { testNativeModelConnection } = await nativeLlmService()
      const settings = normalizeNativeModelSettings(nativeModelSettings)
      Object.assign(nativeModelSettings, settings)
      await testNativeModelConnection(settings)
    } else {
      await testWebModelConnection(webModelSettings)
    }
    ElMessage.success('模型接口连接成功')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isTestingNativeModel.value = false
  }
}

const useServerModelSettings = () => {
  clearWebModelSettings()
  Object.assign(webModelSettings, { apiURL: '', apiKey: '', model: '' })
  nativeSettingsOpen.value = false
  ElMessage.success('已恢复使用服务器模型配置')
}

watch(() => props.modelValue, async value => {
  if (value) {
    try { await loadSettings() } catch (error) { ElMessage.error(error.message); nativeSettingsOpen.value = false }
  }
}, { immediate: true })
</script>
<template>
  <el-dialog
    v-model="nativeSettingsOpen"
    title="模型 API 设置"
    width="min(92vw, 460px)"
    :close-on-click-modal="false"
  >
    <p class="native-settings-note">
      {{ isNativeApp
        ? '聊天数据保存在手机 SQLite 中；以下密钥只保存在系统安全存储，不会写入安装包。'
        : '以下配置只保存在当前浏览器会话，关闭浏览器后清除；未设置时使用服务器模型配置。' }}
    </p>
    <el-form label-position="top">
      <el-form-item label="OpenAI 兼容 API 地址">
        <el-input v-model="activeModelSettings.apiURL" placeholder="https://example.com/v1" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input
          v-model="activeModelSettings.apiKey"
          type="password"
          show-password
          autocomplete="off"
          placeholder="输入你自己的 API Key"
        />
      </el-form-item>
      <el-form-item v-if="!isNativeApp" label="模型名称">
        <el-input v-model="webModelSettings.model" autocomplete="off" placeholder="例如：deepseek-chat" />
      </el-form-item>
      <div v-else class="fixed-model-row">
        <span>固定模型</span>
        <strong>{{ FIXED_NATIVE_MODEL }}</strong>
      </div>
    </el-form>
    <template #footer>
      <el-button v-if="!isNativeApp" @click="useServerModelSettings">
        使用服务器配置
      </el-button>
      <el-button :loading="isTestingNativeModel" @click="testNativeSettings">
        测试连接
      </el-button>
      <el-button type="primary" :loading="isSavingNativeModel" @click="saveNativeSettings">
        保存
      </el-button>
    </template>
  </el-dialog>

</template>

<style scoped>
.native-settings-note {
  margin: 0 0 16px;
  padding: 10px 12px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.6;
}

.fixed-model-row {
  margin-top: 2px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  background: var(--input-bg);
  border: 1px solid var(--border-glass);
  border-radius: 10px;
  font-size: 12px;
}

.fixed-model-row strong {
  color: var(--text-accent);
  font-size: 13px;
}

</style>
