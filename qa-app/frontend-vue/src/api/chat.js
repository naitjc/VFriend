import { createHttpClient } from "./httpClient.js";
import { isNativeApp } from "../services/platform";
import { webModelHeaders } from "../services/webModelSettings";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8888";
const nativeStore = () => import("../services/nativeConversationStore");
const nativeRuntime = () => import("../services/nativeLlmRuntime");

const http = createHttpClient({ baseURL: API_URL, modelHeaders: webModelHeaders });
export const request = http.request;

export async function listConversations() {
  if (isNativeApp) {
    const relationships = await (await nativeStore()).listRelationships();
    return relationships.flatMap((relationship) => relationship.chapters || []);
  }
  const data = await request("/conversations");
  return data.conversations;
}

export async function listRelationships() {
  if (isNativeApp) return (await nativeStore()).listRelationships();
  const data = await request("/relationships");
  return data.relationships;
}

export async function getRelationship(id) {
  if (isNativeApp) return (await nativeStore()).getRelationship(id);
  const data = await request(`/relationships/${encodeURIComponent(id)}`);
  return data.relationship;
}

export async function createRelationship(payload) {
  if (isNativeApp) return (await nativeStore()).createRelationship(payload);
  return request("/relationships", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function renameRelationship(id, title) {
  if (isNativeApp) return (await nativeStore()).renameRelationship(id, title);
  const data = await request(
    `/relationships/${encodeURIComponent(id)}/title`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    },
  );
  return data.relationship;
}

export async function updateRelationshipSettings(id, payload) {
  if (isNativeApp) {
    return (await nativeStore()).updateRelationshipSettings(id, payload);
  }
  const data = await request(
    `/relationships/${encodeURIComponent(id)}/settings`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  return data.relationship;
}

export async function deleteRelationship(id) {
  if (isNativeApp) {
    await (await nativeStore()).deleteRelationship(id);
    return;
  }
  await request(`/relationships/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function createNextChapter(relationshipId, payload) {
  if (isNativeApp) {
    const store = await nativeStore();
    const source = await store.getConversation(payload.sourceConversationId);
    if (!source) throw new Error("源章节不存在");
    let summary = String(payload.summary || "").trim();
    if (!summary) {
      try {
        summary = await (await nativeRuntime()).summarizeNativeChapter(
          source.snapshot?.apiHistory || [],
        );
      } catch {
        summary = source.preview
          ? `本章最后围绕“${source.preview.slice(0, 120)}”展开。`
          : "本章完整内容保留在上一章节。";
      }
    }
    return store.createNextChapter(payload.sourceConversationId, {
      ...payload,
      summary,
    });
  }
  return request(
    `/relationships/${encodeURIComponent(relationshipId)}/chapters`,
    { timeoutMs: 65000,
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function requestChapterSuggestion(relationshipId, payload) {
  if (isNativeApp) {
    const store = await nativeStore();
    const source = await store.getConversation(payload.sourceConversationId);
    if (!source) throw new Error("源章节不存在");
    const relationship = await store.getRelationship(relationshipId);
    if (relationship?.mode !== "story") {
      return { checkedMessageCount: 0, suggestion: null };
    }
    return (await nativeRuntime()).adviseNativeChapter({
      history: source.snapshot?.conversationHistory || [],
      goal: relationship.goal,
      chapterNumber: source.chapterNumber,
      chapterTitle: source.title,
    });
  }
  return request(
    `/relationships/${encodeURIComponent(relationshipId)}/chapter-suggestion`,
    { timeoutMs: 35000,
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function requestGoalSuggestion(relationshipId, payload) {
  if (isNativeApp) {
    const store = await nativeStore();
    const source = await store.getConversation(payload.sourceConversationId);
    if (!source) throw new Error("源章节不存在");
    const relationship = await store.getRelationship(relationshipId);
    if (
      relationship?.mode !== "story"
      || relationship.goalStatus === "achieved"
    ) {
      return { checkedMessageCount: 0, suggestion: null };
    }
    return (await nativeRuntime()).adviseNativeGoal({
      history: source.snapshot?.apiHistory || [],
      goal: relationship.goal,
    });
  }
  return request(
    `/relationships/${encodeURIComponent(relationshipId)}/goal-suggestion`,
    { timeoutMs: 35000,
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function forkConversation(id, payload = {}) {
  if (isNativeApp) {
    const store = await nativeStore();
    const source = await store.getConversation(id);
    if (!source) throw new Error("源章节不存在");
    let summary = String(payload.summary || source.summary || "").trim();
    if (!summary) {
      try {
        summary = await (await nativeRuntime()).summarizeNativeChapter(
          source.snapshot?.apiHistory || [],
        );
      } catch {
        summary = source.preview || "分支从此处开始。";
      }
    }
    return store.forkConversation(id, { ...payload, summary });
  }
  return request(`/conversations/${encodeURIComponent(id)}/fork`, { timeoutMs: 65000,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getConversation(id) {
  if (isNativeApp) return (await nativeStore()).getConversation(id);
  const data = await request(`/conversations/${encodeURIComponent(id)}`);
  return data.conversation;
}

export async function createConversation(payload) {
  if (isNativeApp) {
    const store = await nativeStore();
    if (payload.relationshipId && payload.sourceConversationId) {
      const result = await store.createNextChapter(payload.sourceConversationId, payload);
      return result.conversation;
    }
    return (await store.createRelationship(payload)).conversation;
  }
  const data = await request("/conversations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.conversation;
}

export async function updateConversation(id, payload) {
  if (isNativeApp) return (await nativeStore()).updateConversation(id, payload);
  const data = await request(`/conversations/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return data.conversation;
}

export async function renameConversation(id, title) {
  if (isNativeApp) return (await nativeStore()).renameConversation(id, title);
  const data = await request(
    `/conversations/${encodeURIComponent(id)}/title`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    },
  );
  return data.conversation;
}

export async function deleteConversation(id) {
  if (isNativeApp) {
    await (await nativeStore()).deleteConversation(id);
    return;
  }
  await request(`/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * 流式消息发送 - SSE
 */
export async function sendMessageStream(
  payload,
  { onChunk, onState, onDone, onError, onProgress, onReply, signal } = {},
) {
  if (isNativeApp) {
    return (await nativeRuntime()).sendNativeMessage(payload, {
      onChunk,
      onReply,
      signal,
      onProgress,
      onState,
      onDone,
      onError,
    });
  }
  return http.sendMessageStream(payload, { onChunk, onState, onDone, onError, onProgress, onReply, signal });
}

export async function testWebModelConnection(settings) {
  await request("/model/test", { timeoutMs: 20000,
    method: "POST",
    headers: webModelHeaders(settings),
    body: JSON.stringify({}),
  });
  return true;
}

export async function previewCharacter(characterSettings, question) {
  if (isNativeApp) return (await nativeRuntime()).previewCharacter(characterSettings, question);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    return (await request('/character/preview', { timeoutMs: 65000,
      method: 'POST', signal: controller.signal,
      headers: webModelHeaders(),
      body: JSON.stringify({ characterSettings, question }),
    })).reply;
  } finally { clearTimeout(timer); }
}

export async function exportArchives() {
  if (isNativeApp) return (await nativeStore()).exportArchives();
  return request('/archives/export');
}
export async function importArchives(data) {
  if (isNativeApp) return (await nativeStore()).importArchives(data);
  return request('/archives/import', { method: 'POST', body: JSON.stringify(data) });
}
export async function listTrash() {
  if (isNativeApp) return (await nativeStore()).listTrash();
  return request('/archives/trash');
}
export async function restoreArchive(id) {
  if (isNativeApp) return (await nativeStore()).restoreArchive(id);
  return request(`/archives/trash/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}
