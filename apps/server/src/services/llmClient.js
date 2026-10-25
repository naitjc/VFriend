const { StringDecoder } = require('node:string_decoder');
const axios = require('axios');
const config = require('../config/config');
const { getRequestModelConfig } = require('../middleware/modelConfigContext');

const runtimeConfig = () => getRequestModelConfig() || config;

/**
 * 统一 LLM 调用客户端 (v2.0)
 * 集中管理 API URL 拼接、鉴权 Headers、超时保护
 */
async function callLLM(messages, options = {}) {
    const activeConfig = runtimeConfig();
    const {
        model = activeConfig.model,
        temperature = 0.5,
        stream = false,
        thinking = false,
        timeout = 60000,
        top_p = 0.7
    } = options;

    const apiKey = activeConfig.apiKey;
    if (!apiKey) throw new Error("API_KEY 未配置");

    const targetURL = _buildURL(activeConfig.apiURL);

    const requestBody = {
        model,
        messages,
        stream,
        temperature,
        top_p
    };

    if (thinking) {
        requestBody.thinking = { type: "enabled" };
    }

    // 带指数退避的重试逻辑（最多重试 2 次）
    const maxRetries = options.maxRetries ?? 2;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.post(targetURL, requestBody, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout,
                signal: options.signal
            });
            return response.data;
        } catch (err) {
            lastError = err;
            const status = err.response?.status;
            const isRetryable = !options.signal?.aborted && (!status || status >= 500 || err.code === 'ECONNABORTED');
            if (isRetryable && attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
                console.warn(`[llmClient] 请求失败 (${err.message})，${delay}ms 后重试 (${attempt + 1}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                break;
            }
        }
    }
    throw lastError;
}

/**
 * 流式 LLM 调用 - 通过回调逐块返回内容
 * @param {Array} messages
 * @param {Object} options
 * @param {Function} onChunk - (text: string) => void
 * @param {Function} onDone - (fullText: string) => void
 */
async function callLLMStream(messages, options = {}, onChunk, onDone) {
    const activeConfig = runtimeConfig();
    const {
        model = activeConfig.model,
        temperature = 0.5,
        thinking = false,
        timeout = 90000,
        top_p = 0.7,
        signal,
    } = options;

    const apiKey = activeConfig.apiKey;
    if (!apiKey) throw new Error("API_KEY 未配置");

    const targetURL = _buildURL(activeConfig.apiURL);

    const requestBody = {
        model,
        messages,
        stream: true,
        temperature,
        top_p
    };

    if (thinking) {
        requestBody.thinking = { type: "enabled" };
    }

    const response = await axios.post(targetURL, requestBody, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
        },
        responseType: 'stream',
        timeout,
        signal,
    });

    let fullText = '';
    let buffer = '';
    let terminal = false;
    let finishReason = null;
    const decoder = new StringDecoder('utf8');
    return new Promise((resolve, reject) => {
        const consumeLine = line => {
            const trimmed = line.trim();
            if (trimmed === 'data: [DONE]') { terminal = true; return; }
            if (!trimmed.startsWith('data:')) return;
            let json;
            try { json = JSON.parse(trimmed.slice(5).trim()); } catch { return; }
            const choice = json.choices?.[0];
            if (choice?.finish_reason) { finishReason = choice.finish_reason; terminal = true; }
            const delta = choice?.delta?.content;
            if (typeof delta === 'string') {
                fullText += delta;
                if (onChunk) onChunk(delta);
            }
        };
        response.data.on('data', chunk => {
            buffer += decoder.write(chunk);
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) consumeLine(line);
        });
        response.data.on('end', () => {
            consumeLine(buffer + decoder.end());
            if (!terminal || (finishReason && finishReason !== 'stop')) {
                reject(new Error('模型回复未完整结束，请重试；本轮状态未提交'));
                return;
            }
            if (onDone) onDone(fullText);
            resolve(fullText);
        });
        response.data.on('error', reject);
    });
}

async function testLLMConnection() {
    const activeConfig = runtimeConfig();
    const baseURL = activeConfig.apiURL.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
    await axios.get(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${activeConfig.apiKey}` },
        timeout: 15000
    });
    return true;
}

function _buildURL(apiURL) {
    let url = apiURL;
    if (!url.endsWith('/chat/completions')) {
        url = url.replace(/\/$/, '') + '/chat/completions';
    }
    return url;
}

module.exports = { callLLM, callLLMStream, testLLMConnection };
