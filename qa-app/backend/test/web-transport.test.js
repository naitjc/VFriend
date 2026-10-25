const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const loaded = import(pathToFileURL(path.resolve(__dirname, '../../frontend-vue/src/api/httpClient.js')).href)
  .then(({ createHttpClient }) => createHttpClient({ baseURL: 'http://fixture.local' }));

const originalFetch = global.fetch;
test.after(() => { global.fetch = originalFetch; });

test('Web transport handles byte-split Unicode, commits reply before continuity and closes at done', async () => {
  const { sendMessageStream } = await loaded;
  const controller = new AbortController();
  let cancelled = false;
  const data = 'event: chunk\ndata: {"text":"你好🌊"}\n\nevent: reply\ndata: {"history":[]}\n\nevent: progress\ndata: {"phase":"organizing"}\n\nevent: done\ndata: {"memory":{}}\n\n';
  global.fetch = async (_, options) => {
    assert.equal(options.signal, controller.signal);
    return new Response(new ReadableStream({
      start(stream) { for (const byte of new TextEncoder().encode(data)) stream.enqueue(new Uint8Array([byte])); },
      cancel() { cancelled = true; },
    }));
  };
  const events = [];
  await sendMessageStream({}, {
    signal: controller.signal,
    onChunk: text => events.push(text), onReply: () => events.push('reply'),
    onProgress: () => events.push('organizing'), onDone: () => events.push('done'),
  });
  assert.deepEqual(events, ['你好🌊', 'reply', 'organizing', 'done']);
  assert.equal(cancelled, true);
});

test('Web transport propagates handler errors and releases a still-open stream', async () => {
  const { sendMessageStream } = await loaded;
  let cancelled = false;
  global.fetch = async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('event: error\ndata: {"message":"模拟断线"}\n\n')); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(sendMessageStream({}, { onError: message => { throw new Error(message); } }), /模拟断线/);
  assert.equal(cancelled, true);
});

test('JSON request deadline remains active while reading a stalled response body', async () => {
  const { request } = await loaded;
  global.fetch = async (_, options) => ({ ok: true, status: 200, json: () => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }) });
  await assert.rejects(request('/fixture', { timeoutMs: 10 }), /请求超时/);
});
test('JSON request composes caller cancellation with its own deadline', async () => {
  const { request } = await loaded;
  const controller = new AbortController();
  global.fetch = async (_, options) => {
    assert.notEqual(options.signal, controller.signal);
    queueMicrotask(() => controller.abort());
    return { ok: true, status: 200, json: () => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      if (options.signal.aborted) reject(new DOMException('aborted', 'AbortError'));
    }) };
  };
  await assert.rejects(request('/fixture', { signal: controller.signal }), { name: 'AbortError' });
});
