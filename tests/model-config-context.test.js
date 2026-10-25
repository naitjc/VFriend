const test = require('node:test')
const assert = require('node:assert/strict')

const { parseModelConfig } = require('../apps/server/src/middleware/modelConfigContext')

test('model config headers are optional', () => {
  assert.equal(parseModelConfig({}), null)
})

test('model config accepts a complete HTTPS configuration', () => {
  assert.deepEqual(parseModelConfig({
    'x-model-api-url': ' https://example.com/v1/ ',
    'x-model-api-key': ' secret-key ',
    'x-model-name': ' example-model ',
  }), {
    apiURL: 'https://example.com/v1',
    apiKey: 'secret-key',
    model: 'example-model',
  })
})

test('model config rejects incomplete, insecure, or oversized values', () => {
  assert.throws(
    () => parseModelConfig({ 'x-model-api-url': 'https://example.com/v1' }),
    /必须同时提供/,
  )
  assert.throws(
    () => parseModelConfig({
      'x-model-api-url': 'http://example.com/v1',
      'x-model-api-key': 'secret-key',
      'x-model-name': 'example-model',
    }),
    /必须使用 https/,
  )
  assert.throws(
    () => parseModelConfig({
      'x-model-api-url': 'https://example.com/v1',
      'x-model-api-key': 'x'.repeat(4097),
      'x-model-name': 'example-model',
    }),
    /内容过长/,
  )
})
