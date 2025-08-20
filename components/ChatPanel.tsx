// components/ChatPanel.tsx
"use client";

import { useState } from "react";
import { useGetChat } from "@/hooks/useNotebook";
import { useQueryClient } from "@tanstack/react-query";

type Citation = {
  id: string;
  index: number;
  metadata: any;
  sourceId: string;
};

function CitationLink({
  index,
  citation,
}: {
  index: number;
  citation: Citation | null;
}) {
  if (!citation) return <span className="ml-1 text-gray-400">[{index}]</span>;
  if (citation.metadata?.url) {
    return (
      <a
        href={citation.metadata.url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-1 text-blue-400 underline"
        title={citation.metadata.url}
      >
        [{index}]
      </a>
    );
  }
  if (citation.metadata?.page) {
    return (
      <span className="ml-1 text-green-400">
        [{index} - PDF Page {citation.metadata.page}]
      </span>
    );
  }
  if (citation.metadata?.row) {
    return (
      <span className="ml-1 text-yellow-400">
        [{index} - CSV Row {citation.metadata.row}]
      </span>
    );
  }
  return <span className="ml-1 text-gray-400">[{index}]</span>;
}

function AssistantMessage({
  message,
  citations,
}: {
  message: string;
  citations: Citation[];
}) {
  const parts = message.split(/(\[\d+\])/g);
  return (
    <span className="inline-block rounded-lg bg-[#3A3A3A] p-2 text-white">
      {parts.map((part, i) => {
        const match = part.match(/\[(\d+)\]/);
        if (match) {
          const index = parseInt(match[1], 10);
          const citation = citations.find((c) => c.index === index);
          return (
            <CitationLink key={i} index={index} citation={citation || null} />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export default function ChatPanel({
  sessionId,
  selectedSourceId,
}: {
  sessionId: string;
  selectedSourceId?: string | null;
}) {
  const qc = useQueryClient();
  const { data: messages } = useGetChat(sessionId);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [lastAssistant, setLastAssistant] = useState<{
    id: string;
    citations: Citation[];
    followups: string[];
  } | null>(null);

  const sendQuery = async (q: string) => {
    setPending(true);
    try {
      const body: any = { sessionId, query: q };
      if (selectedSourceId) body.selectedSources = [selectedSourceId];

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        // refetch chat history so user + assistant messages show
        await qc.invalidateQueries({ queryKey: ["chats", sessionId] });
        setLastAssistant({
          id: data?.chatMessage?.id,
          citations: data?.citations || [],
          followups: data?.followups || [],
        });
      } else {
        console.error("Query error:", data?.error);
      }
    } finally {
      setPending(false);
    }
  };

  const onSend = async () => {
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    await sendQuery(q);
  };

  const onFollowup = async (f: string) => {
    await sendQuery(f);
  };

  return (
    <div className="w-3/4 flex flex-col bg-[#2A2A2A]">
      <div className="border-b border-gray-700 p-2 text-xs text-gray-400">
        {selectedSourceId
          ? "Chatting with selected source only"
          : "Chatting with all sources"}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages?.map((m) => {
          const isAssistant =
            m.role === "assistant" &&
            lastAssistant?.id &&
            lastAssistant.id === m.id;

          return (
            <div
              key={m.id}
              className={`mb-4 ${
                m.role === "user" ? "text-right" : "text-left"
              }`}
            >
              {m.role === "assistant" ? (
                <>
                  <AssistantMessage
                    message={m.message}
                    citations={
                      isAssistant ? lastAssistant?.citations || [] : []
                    }
                  />
                  {isAssistant && lastAssistant?.followups?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lastAssistant.followups.map((f, i) => (
                        <button
                          key={i}
                          onClick={() => onFollowup(f)}
                          className="rounded bg-[#1E1E1E] px-2 py-1 text-xs text-gray-200 hover:bg-[#333] border border-gray-700"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="inline-block rounded-lg bg-[#4285F4] p-2 text-white">
                  {m.message}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex border-t border-gray-700 p-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Ask something..."
          className="flex-1 rounded border border-gray-600 bg-[#1E1E1E] p-2 text-white"
        />
        <button
          onClick={onSend}
          className="ml-2 rounded bg-[#4285F4] px-4 py-2 text-white disabled:opacity-60"
          disabled={pending}
        >
          {pending ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}
