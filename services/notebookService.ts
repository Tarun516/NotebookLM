import { api } from "@/lib/axios";
import { Session, Source, Chat, QueryRequest, StreamEvent } from "@/types";

/* ------------------- SESSION SERVICES ------------------- */

export const fetchSession = async (): Promise<Session> => {
  const { data } = await api.get("/session");
  return data;
};

/* ------------------- SOURCE SERVICES ------------------- */

export const fetchSources = async (sessionId: string): Promise<Source[]> => {
  const { data } = await api.get(`/sources?sessionId=${sessionId}`);
  return data;
};

export const addSource = async (
  sessionId: string,
  payload: FormData
): Promise<Source> => {
  const { data } = await api.post(`/sources?sessionId=${sessionId}`, payload, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
};

/* ------------------- CHAT SERVICES ------------------- */

export const fetchChat = async (sessionId: string): Promise<Chat[]> => {
  const { data } = await api.get(`/chats?sessionId=${sessionId}`);
  return data;
};

export const sendMessage = async (
  sessionId: string,
  message: string
): Promise<Chat> => {
  const { data } = await api.post(`/chats?sessionId=${sessionId}`, { message });
  return data;
};

/* ------------------- STREAMING QUERY SERVICES ------------------- */

/**
 * Streaming query service
 * Handles SSE-like streaming from /api/query
 */
export const streamQuery = async (
  request: QueryRequest,
  onEvent: (event: StreamEvent) => void
): Promise<void> => {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, streaming: true }),
  });

  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body reader available");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");

    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          const event = JSON.parse(jsonStr) as StreamEvent;
          onEvent(event);
        } catch (e) {
          console.error("Error parsing stream data:", e, "Line:", line);
        }
      }
    }
  }
};
