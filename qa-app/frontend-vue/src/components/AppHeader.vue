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
import { FIXED_NATIVE_MODEL } from '../services/nativeModelConfig'
import {
  clearWebModelSettings,
  loadWebModelSettings,
  saveWebModelSettings,
} from '../services/webModelSettings'
import { testWebModelConnection } from '../api/chat'

const nativeSettingsService = () => import('../services/nativeModelSettings')
const nativeLlmService = () => import('../services/nativeLlmRuntime')

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
const isTestingNativeModel = ref(false)
const isSavingNativeModel = ref(false)
const nativeModelSettings = reactive({ apiURL: '', apiKey: '' })
const webModelSettings = reactive({ apiURL: '', apiKey: '', model: '' })
const activeModelSettings = computed(() => isNativeApp ? nativeModelSettings : webModelSettings)
const guideOpen = ref(false)
const activeGuideSection = ref(0)
const guideSections = [
  {
    title: '第一次开始聊天',
    summary: '按模型配置、选择角色、创建存档、开始聊天的顺序完成首次使用。',
    steps: [
      { title: '配置模型（可选）', detail: '打开“更多”→“模型 API 设置”。Android 原生版需要填写兼容接口地址和 API Key；Web 版可以填写地址、Key 和模型名，也可以直接使用服务器配置。' },
      { title: '选择角色', detail: '手机端点击右上角“更多”，在“角色”区域选择预设角色；也可以点击“创建角色”制作自己的角色。' },
      { title: '创建聊天存档', detail: '点击顶部的存档按钮，再点击“新建”。选择自由模式或故事模式并填写必要信息后，应用会为当前角色建立独立存档。' },
      { title: '打开已有存档', detail: '以后点击顶部存档按钮，再选择之前的存档即可继续。故事模式还可以在这里切换当前章节或查看过去章节。' },
      { title: '进入聊天', detail: '点击存档名称后抽屉会自动关闭，底部输入框随即可以使用。输入内容后点击“发送”。' },
      { title: '以后继续聊', detail: '应用会自动保存消息和关系状态。下次打开时，重新进入同一个存档即可接着聊。' },
    ],
    tip: '如果输入框是灰色，通常是因为还没有打开存档，或者正在查看只读的过去章节。',
  },
  {
    title: '自由模式与故事模式',
    summary: '创建前先选对模式；存档创建后不会中途改变模式。',
    steps: [
      { title: '自由模式', detail: '适合日常陪伴、随意聊天和长期互动。没有最终目标，也不划分章节；创建时可以设置初始好感度。' },
      { title: '故事模式 Beta（测试版）', detail: 'Beta 表示该模式仍在测试和完善中，并非完整版本，功能与规则以后可能调整。它适合有明确方向的互动故事；创建时必须填写最终目标，新故事从好感度 0 开始。' },
      { title: '如何选择', detail: '只是想聊天就选自由模式；希望围绕“找到失落星图”“一起完成旅行”等目标推进，就选故事模式。' },
      { title: '模式不会中途切换', detail: '存档创建后不能直接把自由模式改成故事模式，反之亦然。需要另一种模式时，请为角色新建独立存档。' },
      { title: '不同存档互不影响', detail: '每个存档都有自己的消息、关系状态、记忆、背景和角色快照，可以为同一角色创建多条独立故事线。' },
    ],
    tip: '不确定时先用自由模式。故事模式更适合愿意主动推动剧情的用户。',
  },
  {
    title: '手机界面怎么用',
    summary: '手机顶部保留存档和更多入口，点击角色头像打开设置。',
    steps: [
      { title: '教程', detail: '在“更多”中点击“使用教程”，可以使用章节选择器快速跳到需要的说明。' },
      { title: '存档', detail: '顶部文件夹按钮用于打开存档与章节。选择内容后会自动返回聊天，不需要手动关闭。' },
      { title: '角色设置', detail: '点击顶部的角色头像，可以查看和修改当前存档中的角色信息。必须先打开一个存档才能使用。' },
      { title: '更多', detail: '三点菜单包含角色切换、创建角色、消息搜索、头像、主题、背景、模型参数、导出和 Android 模型 API 设置。' },
      { title: '聊天输入区', detail: '表情、文本框和发送按钮位于同一行；模型参数可以在“更多”菜单中调节。' },
      { title: '返回聊天', detail: '打开存档或角色设置抽屉后，可以点击顶部关闭按钮，也可以点击抽屉外区域返回聊天。' },
    ],
    tip: '抽屉顶部都有“返回聊天”按钮；也可以点击抽屉外的暗色区域关闭。',
  },
  {
    title: '好感度、情绪与关系',
    summary: '这些状态会改变角色的语气和亲疏，但不会替你决定剧情。',
    steps: [
      { title: '好感度', detail: '好感度表示喜欢的程度，范围是 0～100；数值变化不会越过已确认的关系边界。' },
      { title: '关系阶段', detail: '新存档从初识或熟悉开始；高好感不会自动升级为信任、亲密或伴侣。打开聊天顶部的记忆面板→“关系”→“调整关系”，填写已发生的依据并确认关系阶段。旧存档阶段保持不变。' },
      { title: '情绪', detail: '情绪影响当前回复的轻快、耐心、克制或低落程度。新建存档时会生成初始情绪，之后随互动变化。' },
      { title: '在哪里查看', detail: '打开角色设置，在状态卡片中点击“查看状态”。数值保存在当前存档中，不会影响其他存档。' },
      { title: '状态如何变化', detail: '角色回复完成后，系统会根据本轮互动更新状态。短暂波动是正常的，长期关系更适合从连续多轮互动判断。' },
    ],
    tip: '角色不会直接朗读数值；请从称呼、语气、主动性和回应方式判断变化。',
  },
  {
    title: '故事、章节与分支',
    summary: '故事由你推动，系统只负责保存结构和提出建议。',
    steps: [
      { title: '查看故事状态', detail: '点击聊天顶部“故事与记忆”，查看或修改最终目标、阅读章节回顾，并管理记忆与事项。' },
      { title: '进入下一章', detail: '模型可能在自然收束点给出建议，你也可以在存档抽屉中手动点击“结束本章，进入下一章”。' },
      { title: '过去章节', detail: '结束后的章节是只读的，不能继续发送消息，避免历史内容被意外改写。' },
      { title: '创建分支', detail: '打开过去章节并选择“从这里创建分支故事”，即可继承当时的角色、关系、记忆和目标，之后独立发展。' },
      { title: '确认目标达成', detail: '模型认为最终目标已完成时只会提出建议。确认后故事状态才会变为已达成；如果证据不足，可以选择继续推进。' },
    ],
    tip: '模型的切章和目标达成判断都只是建议，只有你确认后才会改变故事状态。',
  },
  {
    title: '关键事件与记忆',
    summary: '只把真正重要、已经发生的事实写入长期故事记忆。',
    steps: [
      { title: '打开入口', detail: '聊天顶部打开“记忆与进展”（故事模式为“故事与记忆”），先查看已保存内容，再点击编辑按钮修改记忆、场景或事项。重要事件可记录在“记忆”页的共同经历中。' },
      { title: '写清事实', detail: '写成明确结果，例如“我们约定下周一起调查旧车站”，不要只写“车站”或尚未发生的计划。' },
      { title: '保存后的作用', detail: '已确认记忆会在后续章节或继承对话中继续提供给角色；约定的完成、取消请在“事项”页中更新。' },
      { title: '为什么不自动记忆', detail: '普通闲聊不会自动成为长期事实，这样可以避免误解、玩笑或模型猜测污染后续剧情。' },
    ],
    tip: '少而准确的关键事件，比大量零碎记录更能保持角色和故事一致。',
  },
  {
    title: '上下文与继承对话',
    summary: '对话很长时，用继承功能保留重点并释放可用上下文。',
    steps: [
      { title: '容量提醒', detail: '上下文占用升高时，聊天顶部显示容量提醒。估算计入设定、记忆及中英文文本，不等同于服务商的精确 token 账单。' },
      { title: '何时处理', detail: '近期对话按容量自动整理，原始聊天记录保留；70%、85% 和 95% 时分级提醒。若设定或长期记忆本身过长，需要手动精简。' },
      { title: '开启并继承', detail: '点击提醒中的“开启并继承”，系统会创建新存档并带上角色设定、关系、长期记忆、故事目标和最近对话摘要。' },
      { title: '旧存档仍保留', detail: '继承不会删除原存档。你可以回到旧存档查看完整历史，也可以继续使用新存档聊天。' },
    ],
    tip: '看到橙色提醒时就可以继承，不必等到红色上限。',
  },
  {
    title: '角色、头像与外观',
    summary: '角色设定决定“是谁在说话”，外观设置只改变显示效果。',
    steps: [
      { title: '创建角色', detail: '在“更多”菜单点击“创建角色”，再点击“查看填写示例”了解每项应如何描述。填写姓名、身份、性格、语调和背景时越具体，角色表现通常越稳定。' },
      { title: '修改当前角色', detail: '先打开存档，再进入角色设置。修改会保存到当前存档的角色快照，不会自动覆盖其他旧存档。' },
      { title: '头像和聊天背景', detail: '在“更多”菜单中更换我的头像或聊天背景；也可以直接点击消息旁的头像进行更换。' },
      { title: '主题和特效', detail: '在“更多”的外观区域切换主题、背景和雪花特效。关闭特效可以减少低性能手机的视觉负担。' },
    ],
    tip: '修改角色模板后，新建存档会使用最新设定；已有存档仍保留自己的快照。',
  },
  {
    title: '模型 API 设置',
    summary: 'Android 使用本机安全配置；Web 可以临时使用自己的接口，也可以沿用服务器配置。',
    steps: [
      { title: '打开设置', detail: '在 Android 或 Web 版中点击“更多”→“模型 API 设置”。' },
      { title: '填写地址', detail: '输入服务商提供的 OpenAI 兼容 API 地址，通常以 /v1 结尾；不要把聊天网页地址误当成 API 地址。' },
      { title: '填写密钥并测试', detail: '输入自己的 API Key，先点击“测试连接”；测试成功后再保存。Android 密钥保存在手机系统安全存储中，Web 密钥只保存在当前浏览器会话。' },
      { title: '模型名称', detail: 'Android 原生版使用应用内预设模型；Web 版还需要填写服务商支持的模型名称。Web 未设置或点击“使用服务器配置”后，会继续使用服务器已有配置。' },
      { title: '模型参数', detail: '两端都在“更多”中的“模型参数”区域调节 Temperature 和 Top-P，并随当前存档保存。' },
      { title: '连接失败怎么办', detail: '检查网络、地址、密钥余额和服务商是否允许当前模型。部分服务商还会限制地区或并发请求。' },
    ],
    tip: '不要把 API Key 发到聊天消息里，也不要分享包含密钥的截图。',
  },
  {
    title: '数据、导出与排错',
    summary: '了解数据保存位置，可以避免误删和误以为多端会自动同步。',
    steps: [
      { title: '数据保存位置', detail: 'Android 存档保存在手机本地 SQLite；Web 存档保存在 Web 后端。两端目前不会自动同步。' },
      { title: '导出对话', detail: '打开“更多”→“导出对话”，可把当前聊天记录保存为文本文件。导出前请先进入目标存档。' },
      { title: '更新与卸载', detail: '正常覆盖安装新版 APK 通常会保留应用数据；卸载应用会清除手机本地数据，因此卸载前应先导出重要对话。' },
      { title: '删除要谨慎', detail: '删除存档或角色关联存档时会先放入回收站，可恢复其中的消息、章节和状态。' },
      { title: '功能点不了', detail: '先确认已选择角色并打开存档；过去章节只能查看；发送中或加载中时部分按钮会暂时禁用。' },
      { title: '界面异常', detail: '尝试关闭并重新打开应用。若仍有问题，请记录手机型号、系统版本、操作步骤和错误提示，便于定位。' },
    ],
    tip: '重要聊天建议定期导出。卸载 Android 应用前也请先备份需要保留的内容。',
  },
]

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
      const { loadNativeModelSettings } = await nativeSettingsService()
      Object.assign(nativeModelSettings, await loadNativeModelSettings())
      if (!nativeModelSettings.apiKey) nativeSettingsOpen.value = true
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
  const result = await saveTextFile(`Chat-RP_完整备份_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup))
  if (!result.cancelled) ElMessage.success('完整备份已导出')
  showMoreMenu.value = false
})
const importBackup = () => withArchiveAction(async () => {
  const text = await openBackupFile()
  if (text == null) return
  if (text.error) throw new Error(text.error)
  let backup
  try { backup = JSON.parse(text) } catch { throw new Error('无法读取备份，请选择完整备份 JSON 文件') }
  if (backup.format !== 'chat-rp-backup' || backup.version !== 1 || !Array.isArray(backup.relationships)) throw new Error('不是受支持的 Chat RP 完整备份')
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

const openNativeSettings = async () => {
  if (isNativeApp) {
    const { loadNativeModelSettings } = await nativeSettingsService()
    Object.assign(nativeModelSettings, await loadNativeModelSettings())
  } else {
    Object.assign(webModelSettings, loadWebModelSettings())
  }
  nativeSettingsOpen.value = true
  showMoreMenu.value = false
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
      const { saveNativeModelSettings } = await nativeSettingsService()
      const { testNativeModelConnection } = await nativeLlmService()
      const settings = await saveNativeModelSettings(nativeModelSettings)
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

  <el-drawer v-model="guideOpen" title="Chat RP 使用指南" :direction="isMobile ? 'btt' : 'rtl'" :size="isMobile ? '94dvh' : 'min(760px, 92vw)'" class="guide-drawer">
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
