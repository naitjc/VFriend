import modelSettings from '@vfriend/core/model-settings'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { FIXED_NATIVE_MODEL } from './nativeModelConfig'

const STORAGE_KEY = 'chat-@vfriend/core/model-settings'
const DEFAULT_SETTINGS = {
  apiURL: 'https://api.edgefn.net/v1',
  apiKey: '',
  model: FIXED_NATIVE_MODEL,
}

export async function loadNativeModelSettings() {
  const saved = await SecureStorage.get(STORAGE_KEY)
  return {
    ...DEFAULT_SETTINGS,
    ...(saved && typeof saved === 'object' ? saved : {}),
    model: FIXED_NATIVE_MODEL,
  }
}

export const normalizeNativeModelSettings = settings => modelSettings.normalizeModelSettings(settings, { requireModel: false })

export async function saveNativeModelSettings(settings) {
  const normalized = normalizeNativeModelSettings(settings)
  await SecureStorage.set(STORAGE_KEY, normalized)
  return { ...normalized, model: FIXED_NATIVE_MODEL }
}
