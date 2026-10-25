// One turn protocol for HTTP/SSE and native Android. Storage and credentials stay in adapters.
const { analyzeImpact, updateStateObject, compressHistory, updateContinuity, estimateTokens } = require('./runtime.cjs');
const { buildSystemPrompt } = require('./prompt.cjs');
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
const throwIfAborted = signal => { if (signal?.aborted) throw new DOMException('已停止', 'AbortError'); };

function validateChatInput(body = {}) {
  if (body.question != null && typeof body.question !== "string") {
    const error = new Error("消息必须是文本");
    error.status = 400;
    throw error;
  }
  if (String(body.question || "").length > 12000) {
    const error = new Error("单条消息不能超过 12000 个字符");
    error.status = 413;
    throw error;
  }
  if (body.history != null && !Array.isArray(body.history)) {
    const error = new Error("历史记录格式错误");
    error.status = 400;
    throw error;
  }
  if ((body.history?.length || 0) > 120) {
    const error = new Error("历史记录过长，请开启新的聊天存档");
    error.status = 413;
    throw error;
  }
  if (body.image != null && typeof body.image !== "string") {
    const error = new Error("图片格式错误");
    error.status = 400;
    throw error;
  }
}

async function runChatTurn(payload, { call, stream }, callbacks = {}) {
  validateChatInput(payload);
  const { image } = payload;
  const question = payload.question || '';
  const characterSettings = payload.characterSettings || {};
  const history = payload.history || [];
  const chatContext = payload.chatContext || {};
  if (!question.trim() && !image) { const error = new Error('问题或图片不能为空'); error.status = 400; throw error; }
  const signal = callbacks.signal;
  throwIfAborted(signal);
  const [currentHistory, impact] = await Promise.all([
    compressHistory(call, history, buildSystemPrompt(characterSettings, chatContext), question, { signal }),
    analyzeImpact(call, question, characterSettings, history, { signal }),
  ]);
  throwIfAborted(signal);
  const previous = characterSettings.relationshipState || null;
  const relationshipState = previous && impact ? updateStateObject(previous, impact) : previous;
  let stateChange = null;
  if (previous && relationshipState) {
    const affectionDelta = relationshipState.affection - (Number(previous.affection) || 0);
    const moodDelta = relationshipState.mood - (Number(previous.mood) || 0);
    if (Math.abs(affectionDelta) >= 2 || Math.abs(moodDelta) >= 3) stateChange = { affectionDelta, moodDelta, reason: impact?.reason || '' };
  }
  const settings = { ...characterSettings, relationshipState };
  const userContent = [{ type: 'text', text: question }];
  if (image) userContent.push({ type: 'image_url', image_url: { url: image } });
  const userMessage = { role: 'user', content: userContent };
  let chunks = '';
  const result = await stream([
    { role: 'system', content: buildSystemPrompt(settings, chatContext) }, ...currentHistory, userMessage,
  ], { temperature: clamp(payload.temperature, 0, 1, 0.5), top_p: clamp(payload.top_p, 0.01, 1, 0.7), timeout: 90000, signal }, text => {
    throwIfAborted(signal);
    chunks += text;
    callbacks.onChunk?.(text);
  });
  throwIfAborted(signal);
  const fullText = typeof result === 'string' ? result : chunks;
  if (!fullText.trim()) throw new Error('模型返回了空回复，请重试');
  const reply = { history: [...currentHistory, userMessage, { role: 'assistant', content: fullText }], relationshipState, stateChange };
  // A complete reply is committed independently from optional continuity work.
  callbacks.onReply?.(reply);
  let continuity = { memory: settings.memory };
  if (settings.basicInfo?.name) {
    callbacks.onProgress?.({ phase: 'organizing' });
    continuity = await updateContinuity(call, settings.memory, question, fullText, chatContext.mode, { signal });
  }
  throwIfAborted(signal);
  const done = { ...reply, ...continuity };
  callbacks.onState?.({ relationshipState, stateChange });
  callbacks.onDone?.(done);
  return done;
}

async function previewCharacter(call, characterSettings, question) {
  validateChatInput({ question });
  question = String(question || '').trim();
  if (!question || !characterSettings?.basicInfo?.name) { const error = new Error('请提供角色设定和试聊消息'); error.status = 400; throw error; }
  const prompt = buildSystemPrompt(characterSettings, { mode: 'free' });
  if (estimateTokens(prompt) + estimateTokens(question) > 20000) { const error = new Error('角色设定或消息过长，请精简后试聊'); error.status = 413; throw error; }
  const data = await call([{ role: 'system', content: prompt }, { role: 'user', content: question }], { timeout: 60000, maxRetries: 0 });
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('模型返回了空回复，请重试');
  return reply;
}
module.exports = { runChatTurn, validateChatInput, previewCharacter };
