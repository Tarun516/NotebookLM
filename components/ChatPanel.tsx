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
  if (!citation)
    return <span className="text-blue-600 text-xs">[{index}]</span>;

  if (citation.metadata?.url) {
    return (
      <a
        href={citation.metadata.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 text-xs underline"
        title={citation.metadata.url}
      >
        [{index}]
      </a>
    );
  }
  if (citation.metadata?.page) {
    return (
      <span
        className="text-blue-600 text-xs"
        title={`PDF Page ${citation.metadata.page}`}
      >
        [{index}]
      </span>
    );
  }
  if (citation.metadata?.row) {
    return (
      <span
        className="text-blue-600 text-xs"
        title={`CSV Row ${citation.metadata.row}`}
      >
        [{index}]
      </span>
    );
  }
  return <span className="text-blue-600 text-xs">[{index}]</span>;
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
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-4xl">
      {parts.map((part, i) => {
        const match = part.match(/\[(\d+)\]/);
        if (match) {
          const index = parseInt(match[1], 10);
          const citation = citations.find((c) => c.index === index);
          return (
            <CitationLink key={i} index={index} citation={citation || null} />
          );
        }
        return (
          <span key={i} className="text-gray-900">
            {part}
          </span>
        );
      })}
    </div>
  );
}

export default function ChatPanel({
  sessionId,
  selectedSources,
  sources,
  onSourceSelectionChange,
}: {
  sessionId: string;
  selectedSources: string[];
  sources: any[];
  onSourceSelectionChange: (sourceIds: string[]) => void;
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
      if (selectedSources.length > 0) {
        body.selectedSources = selectedSources;
      }

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
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

  const getSourceNames = () => {
    if (selectedSources.length === 0) return "all sources";
    if (selectedSources.length === 1) {
      const source = sources.find((s) => s.id === selectedSources[0]);
      return source?.name || "selected source";
    }
    return `${selectedSources.length} sources`;
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Chat Header - NotebookLM style */}
      <div className="border-b border-gray-200 p-4 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
              <span className="text-sm">💬</span>
            </div>
            <div>
              <h2 className="text-sm font-medium text-gray-900">
                Chat with {getSourceNames()}
              </h2>
              <div className="text-xs text-gray-500 mt-0.5">
                {selectedSources.length === 0
                  ? "Asking general questions"
                  : selectedSources.length === sources?.length
                  ? `Using all ${sources?.length || 0} sources`
                  : `Limited to ${selectedSources.length} selected sources`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages?.map((m) => {
          const isAssistant =
            m.role === "assistant" &&
            lastAssistant?.id &&
            lastAssistant.id === m.id;

          return (
            <div
              key={m.id}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="max-w-4xl w-full">
                  <AssistantMessage
                    message={m.message}
                    citations={
                      isAssistant ? lastAssistant?.citations || [] : []
                    }
                  />
                  {isAssistant && lastAssistant?.followups?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lastAssistant.followups.map((f, i) => (
                        <button
                          key={i}
                          onClick={() => onFollowup(f)}
                          className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-full hover:bg-gray-50 text-gray-700"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="bg-blue-600 text-white px-4 py-2 rounded-lg max-w-md">
                  {m.message}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // prevents accidental form submit
                onSend();
              }
            }}
            placeholder={
              selectedSources.length === 0
                ? "Ask me anything..."
                : `Ask about ${getSourceNames()}...`
            }
            className="flex-1 text-black px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />

          <button
            onClick={onSend}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={pending || !input.trim()}
          >
            {pending ? "..." : "Send"}
          </button>
        </div>

        {/* Source indicator */}
        {selectedSources.length > 0 && (
          <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>
              Searching in:{" "}
              {selectedSources
                .map((id) => {
                  const source = sources.find((s) => s.id === id);
                  return source?.name || "Unknown";
                })
                .join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
