const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let source = fs.readFileSync(path.resolve(__dirname, '../../frontend-vue/src/api/chat.js'), 'utf8')
  .replace('import { isNativeApp } from "../services/platform";', 'const isNativeApp = false;')
  .replace('import { webModelHeaders } from "../services/webModelSettings";', 'const webModelHeaders = () => ({});')
  .replace('import.meta.env.VITE_API_URL', JSON.stringify('http://fixture.local'));
const loaded = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
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
