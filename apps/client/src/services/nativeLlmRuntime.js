import sessions from '@vfriend/core/session'
import advisors from '@vfriend/core/advisors'
import { CapacitorHttp } from '@capacitor/core'
import { loadNativeModelSettings } from './nativeModelSettings'
import { nativeModelRequest } from './nativeTransport'

const requireSettings = async () => {
  const settings = await loadNativeModelSettings()
  if (!settings.apiKey) throw new Error('请先在“更多操作”中配置模型 API')
  return settings
}
const callWithSettings = async (settings, messages, options = {}) => {
  const data = await nativeModelRequest(settings, messages, options)
  if (!data?.choices?.[0]?.message) throw new Error('模型响应格式错误')
  if (data.choices[0].finish_reason && data.choices[0].finish_reason !== 'stop') throw new Error('模型回复未完整结束，请重试；本轮状态未提交')
  return data
}
export async function callNativeLLM(messages, options = {}) {
  return callWithSettings(await requireSettings(), messages, options)
}
export async function testNativeModelConnection(settings) {
  const target = `${String(settings.apiURL || '').replace(/\/$/, '').replace(/\/chat\/completions$/, '')}/models`
  const response = await CapacitorHttp.get({
    url: target,
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    connectTimeout: 15000,
    readTimeout: 15000,
    responseType: 'json',
  })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(response.data?.error?.message || `连接失败（${response.status}）`)
  }
  return true
}

export async function sendNativeMessage(payload, callbacks = {}) {
  const settings = await requireSettings()
  return sessions.runChatTurn(payload, {
    call: (messages, options) => callWithSettings(settings, messages, options),
    stream: async (messages, options, onChunk) => (await nativeModelRequest(settings, messages, options, onChunk)).text,
  }, callbacks)
}
export const summarizeNativeChapter = history => advisors.summarizeChapter(callNativeLLM, history)

const nativeAdvisors = advisors.createAdvisors(callNativeLLM)
export const adviseNativeChapter = nativeAdvisors.adviseNextChapter
export const adviseNativeGoal = nativeAdvisors.adviseGoalAchievement
export const previewCharacter = (settings, question) => sessions.previewCharacter(callNativeLLM, settings, question)
