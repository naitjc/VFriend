import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './platform'
const files = registerPlugin('ArchiveFiles')

export async function saveTextFile(name, text, mimeType = 'application/json') {
  if (isNativeApp) return files.save({ name, text, mimeType })
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { cancelled: false }
}
export async function openBackupFile() {
  if (isNativeApp) {
    const result = await files.open()
    return result.cancelled ? null : result.text
  }
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.oncancel = () => resolve(null)
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      if (file.size > 64 * 1024 * 1024) return resolve({ error: '备份不能超过 64 MB' })
      try { resolve(await file.text()) } catch { resolve({ error: '读取文件失败' }) }
    }
    input.click()
  })
}
