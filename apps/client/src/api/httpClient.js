export function createHttpClient({ baseURL, modelHeaders = () => ({}) }) {
  const API_URL = baseURL;
  const REQUEST_TIMEOUT_MS = 15000;
  async function request(path, options = {}) {
    const { timeoutMs = REQUEST_TIMEOUT_MS, signal, ...fetchOptions } = options;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetch(`${API_URL}${path}`, {
        ...fetchOptions, signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(fetchOptions.headers || {}) },
      });
      if (!response.ok) {
        const body = await response.json().catch(error => { if (controller.signal.aborted) throw error; return {}; });
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) throw new Error("请求超时，请稍后重试");
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  async function sendMessageStream(payload, { onChunk, onState, onDone, onError, onProgress, onReply, signal } = {}) {
    const response = await fetch(`${API_URL}/qa/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...modelHeaders(),
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let eventBuffer = "";
    let completed = false;
    let streamError = "";

    try {
      while (!completed && !streamError) {
        const { done, value } = await reader.read();
        if (done) break;
        eventBuffer += decoder.decode(value, { stream: true });
        const blocks = eventBuffer.split("\n\n");
        eventBuffer = blocks.pop();
        for (const block of blocks) {
          let eventType = "message";
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (!dataLine) continue;
          let data;
          try { data = JSON.parse(dataLine); } catch { continue; }
          if (eventType === "chunk") onChunk?.(data.text);
          if (eventType === "reply") onReply?.(data);
          if (eventType === "progress") onProgress?.(data);
          if (eventType === "state") onState?.(data);
          if (eventType === "done") {
            completed = true;
            onDone?.(data);
          }
          if (eventType === "error") {
            streamError = data.message || "生成回复失败";
            onError?.(streamError);
          }
          if (completed || streamError) break;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    if (streamError) throw new Error(streamError);
    if (!completed) throw new Error("连接提前结束，请重试");
  }
  return { request, sendMessageStream };
}
