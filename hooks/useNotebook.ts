// hooks/useNotebook.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSession,
  fetchSources,
  addSource,
  fetchChat,
  sendMessage,
  streamQuery,
} from "@/services/notebookService";
import {
  Session,
  Source,
  Chat,
  Citation,
  QueryRequest,
  StreamEvent,
  StreamingMessage,
} from "@/types";
import { useState, useCallback } from "react";

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

export const useStreamingQuery = (sessionId: string) => {
  const qc = useQueryClient();
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(
    null
  );
  const [streamingMessage, setStreamingMessage] =
    useState<StreamingMessage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastFollowups, setLastFollowups] = useState<string[]>([]);

  const sendQuery = useCallback(
    async (query: string, selectedSources: string[] = []) => {
      if (!query.trim() || isProcessing) return;

      setOptimisticMessage(query);
      setIsProcessing(true);
      setLastFollowups([]);
      setStreamingMessage(null);

      try {
        const request: QueryRequest = {
          sessionId,
          query: query.trim(),
          selectedSources: selectedSources.length ? selectedSources : undefined,
        };

        await streamQuery(request, async (event: any) => {
          switch (event.type) {
            case "searching":
              setStreamingMessage({
                id: "temp",
                content: "Searching through your sources...",
                isComplete: false,
                citations: [],
                followups: [],
              });
              break;
            case "thinking":
              setStreamingMessage({
                id: "temp",
                content: "Let me think about this...",
                isComplete: false,
                citations: [],
                followups: [],
              });
              break;
            case "generating":
              setStreamingMessage({
                id: "temp",
                content: "",
                isComplete: false,
                citations: event.citations || [],
                followups: [],
              });
              break;
            case "token":
              if (event.content) {
                setStreamingMessage((prev) =>
                  prev
                    ? { ...prev, content: prev.content + event.content }
                    : {
                        id: "temp",
                        content: event.content,
                        isComplete: false,
                        citations: [],
                        followups: [],
                      }
                );
              }
              break;
            case "complete":
              setLastFollowups(event.followups || []);
              await qc.invalidateQueries({ queryKey: ["chats", sessionId] });
              setStreamingMessage(null);
              break;
            case "error":
              setStreamingMessage({
                id: "error",
                content: event.error || "Sorry, something went wrong.",
                isComplete: true,
                citations: [],
                followups: [],
              });
              break;
          }
        });
      } catch (err) {
        console.error("Query error:", err);
        setStreamingMessage({
          id: "error",
          content: "Sorry, something went wrong.",
          isComplete: true,
          citations: [],
          followups: [],
        });
      } finally {
        setOptimisticMessage(null);
        setIsProcessing(false);
      }
    },
    [sessionId, isProcessing, qc]
  );

  return {
    optimisticMessage,
    streamingMessage,
    isProcessing,
    lastFollowups,
    sendQuery,
  };
};
