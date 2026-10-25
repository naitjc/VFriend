import modelSettings from 'rp-model-settings'
const STORAGE_KEY = 'chat-rp-web-model-settings'

const EMPTY_SETTINGS = Object.freeze({ apiURL: '', apiKey: '', model: '' })

const normalizeSettings = settings => modelSettings.normalizeModelSettings(settings)

export function loadWebModelSettings() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
    return saved && typeof saved === 'object'
      ? { ...EMPTY_SETTINGS, ...saved }
      : { ...EMPTY_SETTINGS }
  } catch {
    return { ...EMPTY_SETTINGS }
  }
}

export function saveWebModelSettings(settings) {
  const normalized = normalizeSettings(settings)
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function clearWebModelSettings() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function webModelHeaders(settings = loadWebModelSettings()) {
  if (!settings.apiURL || !settings.apiKey || !settings.model) return {}
  const normalized = normalizeSettings(settings)
  return {
    'X-Model-API-URL': normalized.apiURL,
    'X-Model-API-Key': normalized.apiKey,
    'X-Model-Name': normalized.model,
  }
}
