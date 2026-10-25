const { runChatTurn, validateChatInput, previewCharacter: preview } = require('@vfriend/core/session');
const { callLLM, callLLMStream, testLLMConnection } = require('../services/llmClient');
const config = require('../config/config');

async function handleChatStream(req, res, next) {
  try {
    validateChatInput(req.body || {});
    if (!String(req.body?.question || '').trim() && !req.body?.image) {
      return res.status(400).json({ error: { message: '问题或图片不能为空' } });
    }
  } catch (error) { return next(error); }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

  const send = (event, data) => {
    if (res.destroyed || res.writableEnded) return false;
    return res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runChatTurn(req.body, { call: callLLM, stream: callLLMStream }, {
      signal: abortController.signal,
      onChunk: text => send('chunk', { text }),
      onReply: data => send('reply', data),
      onProgress: data => send('progress', data),
      onState: data => send('state', data),
      onDone: data => send('done', data),
    });
  } catch (error) {
    if (!abortController.signal.aborted) send('error', { message: error.message });
  } finally {
    if (!res.writableEnded) res.end();
  }
}

function updateModel(req, res) {
  const { model } = req.body;
  if (!model || typeof model !== "string")
    return res.status(400).json({ error: "无效的模型名称" });
  config.setModel(model);
  res.json({ message: "模型切换成功", currentModel: config.model });
}

async function testModel(req, res, next) {
  try {
    await testLLMConnection();
    res.json({ message: "模型接口连接成功" });
  } catch (error) {
    next(error);
  }
}

async function previewCharacter(req, res, next) {
  try { res.json({ reply: await preview(callLLM, req.body?.characterSettings, req.body?.question) }); }
  catch (error) { next(error); }
}
module.exports = { handleChatStream, updateModel, testModel, validateChatInput, previewCharacter };
