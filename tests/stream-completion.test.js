const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
process.env.API_KEY = 'fixture-key';
const { createRequire } = require('node:module');
const serverRequire = createRequire(require.resolve('../apps/server/package.json'));
const axios = serverRequire('axios');
const { callLLMStream } = require('../apps/server/src/services/llmClient');
const originalPost = axios.post;
test.after(() => { axios.post = originalPost; });
const stream = async content => {
  // Every byte is a separate packet, including multi-byte UTF-8 characters.
  axios.post = async () => ({ data: Readable.from([...Buffer.from(content)].map(byte => Buffer.from([byte]))) });
  let received = '';
  await callLLMStream([], {}, chunk => { received += chunk; });
  return received;
};
test('SSE preserves split Chinese characters and accepts a terminal provider response', async () => {
  assert.equal(await stream('data: {"choices":[{"delta":{"content":"你好🌊"}}]}\n\ndata: [DONE]\n\n'), '你好🌊');
});
test('SSE rejects clean socket EOF without a terminal marker and token-truncated replies', async () => {
  await assert.rejects(stream('data: {"choices":[{"delta":{"content":"未说完"}}]}\n\n'), /未完整结束/);
  await assert.rejects(stream('data: {"choices":[{"delta":{"content":"未说完"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'), /未完整结束/);
});
