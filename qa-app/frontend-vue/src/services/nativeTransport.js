import { registerPlugin } from '@capacitor/core'

const transport = registerPlugin('ChatTransport')

export async function nativeModelRequest(settings, messages, options = {}, onChunk) {
  const id = crypto.randomUUID()
  const signal = options.signal
  const aborted = () => new DOMException('已停止', 'AbortError')
  if (signal?.aborted) throw aborted()
  let listener
  let abort
  try {
    if (onChunk) listener = await transport.addListener('chunk', event => {
      if (event.id === id && !signal?.aborted) onChunk(event.text)
    })
    if (signal?.aborted) throw aborted()
    const request = transport.request({
      id,
      url: settings.apiURL.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '') + '/chat/completions',
      apiKey: settings.apiKey,
      timeout: options.timeout || 90000,
      stream: Boolean(onChunk),
      body: {
        model: options.model || settings.model, messages, stream: Boolean(onChunk),
        temperature: options.temperature ?? 0.5, top_p: options.top_p ?? 0.7,
      },
    })
    const cancellation = new Promise((_, reject) => {
      abort = () => {
        transport.cancel({ id }).catch(() => {})
        reject(aborted())
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
    return await Promise.race([request, cancellation])
  } finally {
    signal?.removeEventListener('abort', abort)
    await listener?.remove()
  }
}
