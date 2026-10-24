const { callLLM } = require('./llmClient');

const { compressHistory } = require('../../../shared/runtime.cjs');
const compressHistoryIfNeeded = (history, prompt, question, options) => compressHistory(callLLM, history, prompt, question, options);

async function summarizeChapter(currentHistory) {
    const history = Array.isArray(currentHistory) ? currentHistory : [];
    if (!history.length) return "本章尚未发生实质性对话。";

    const summaryPrompt = `请把这段角色扮演对话总结为一个可供下一章或分支故事继承的检查点。
要求：
1. 保留发生的关键事件、关系变化、已确认的用户信息和未完成事项；
2. 不增加原文没有的事实；
3. 使用第三人称，控制在 250 字以内；
4. 只输出摘要正文。`;

    try {
        const data = await callLLM(
            [
                ...history,
                { role: "user", content: summaryPrompt },
            ],
            { temperature: 0.2 },
        );
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error("[章节总结] 生成失败:", error.message);
        throw error;
    }
}

module.exports = { compressHistoryIfNeeded, summarizeChapter };
