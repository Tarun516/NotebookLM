import { api } from "@/lib/axios";
import { Session, Source, Chat } from "@/types";

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
