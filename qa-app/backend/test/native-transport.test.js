const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const bridgeURL = pathToFileURL(path.join(__dirname, 'helpers/native-transport.mjs')).href;
const source = fs.readFileSync(path.resolve(__dirname, '../../frontend-vue/src/services/nativeTransport.js'), 'utf8').replace("'@capacitor/core'", JSON.stringify(bridgeURL));
const loaded = Promise.all([import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')), import(bridgeURL)]);
const settings = { apiURL: 'https://provider.example/v1/', apiKey: 'fixture', model: 'fixture' };

test('native transport forwards real chunks, returns terminal text and removes its listener', async () => {
  const [{ nativeModelRequest }, { control }] = await loaded;
  control.removed = 0;
  control.request = async options => {
    assert.equal(options.stream, true);
    assert.equal(options.body.stream, true);
    assert.equal(options.url, 'https://provider.example/v1/chat/completions');
    control.listener({ id: 'other-request', text: '不应混入' });
    control.listener({ id: options.id, text: '你好🌊' });
    return { text: '你好🌊' };
  };
  const chunks = [];
  const result = await nativeModelRequest(settings, [], {}, chunk => chunks.push(chunk));
  assert.deepEqual(chunks, ['你好🌊']);
  assert.equal(result.text, '你好🌊');
  assert.equal(control.removed, 1);
});

test('native abort cancels the HTTP operation, ignores late chunks and releases the listener', async () => {
  const [{ nativeModelRequest }, { control }] = await loaded;
  const controller = new AbortController();
  control.cancelled = []; control.removed = 0;
  const chunks = [];
  control.request = options => {
    queueMicrotask(() => {
      controller.abort();
      control.listener?.({ id: options.id, text: '停止后迟到的内容' });
    });
    return new Promise(() => {});
  };
  await assert.rejects(nativeModelRequest(settings, [], { signal: controller.signal }, text => chunks.push(text)), { name: 'AbortError' });
  assert.equal(control.cancelled.length, 1);
  assert.equal(control.removed, 1);
  assert.deepEqual(chunks, []);
});
