// hooks/useNotebook.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSession,
  fetchSources,
  addSource,
  fetchChat,
  sendMessage,
} from "@/services/notebookService";
import { Session, Source, Chat } from "@/types";

/* -------------------- SESSION HOOKS -------------------- */
export const useGetSession = () => {
  return useQuery<Session>({
    queryKey: ["session"],
    queryFn: fetchSession,
    refetchOnWindowFocus: false,
  });
};

/* -------------------- SOURCES HOOKS -------------------- */
export const useGetSources = (sessionId: string) => {
  return useQuery<Source[]>({
    queryKey: ["sources", sessionId],
    queryFn: () => fetchSources(sessionId),
    enabled: !!sessionId,
  });
};

export const useAddSource = (sessionId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FormData) => addSource(sessionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources", sessionId] });
    },
  });
};

/* -------------------- CHAT HOOKS -------------------- */
export const useGetChat = (sessionId: string) => {
  return useQuery<Chat[]>({
    queryKey: ["chats", sessionId],
    queryFn: () => fetchChat(sessionId),
    enabled: !!sessionId,
  });
};

export const useSendMessage = (sessionId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => sendMessage(sessionId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats", sessionId] });
    },
  });
};
