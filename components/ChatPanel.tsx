"use client";

import { useState, useRef, useEffect } from "react";
import { useGetChat, useStreamingQuery } from "@/hooks/useNotebook";
import { Citation } from "@/types";


function TypingLoader() {
  return (
    <div className="flex items-center space-x-1 py-2">
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
    </div>
  );
}

// Component to handle citation links
function CitationLink({
  index,
  citation,
}: {
  index: number;
  citation: Citation | null;
}) {
  const [open, setOpen] = useState(false);

  if (!citation) return <span>[{index}]</span>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-blue-600 hover:text-blue-800 text-xs underline"
      >
        [{index}]
      </button>

      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
            <h3 className="text-lg font-semibold mb-2">Source Reference</h3>
            {citation.metadata?.url && (
              <a
                href={citation.metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                Open Source
              </a>
            )}
            {citation.metadata?.page && (
              <p>📄 PDF Page: {citation.metadata.page}</p>
            )}
            {citation.metadata?.row && (
              <p>📊 CSV Row: {citation.metadata.row}</p>
            )}
            <button
              onClick={() => setOpen(false)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Helper function to parse potential JSON content
function parseMessageContent(message: string): {
  content: string;
  isJson: boolean;
} {
  // Check if message looks like JSON
  const trimmed = message.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.answer !== undefined) {
        return { content: parsed.answer, isJson: true };
      }
    } catch (e) {
      // If JSON parsing fails, return original message
    }
  }
  return { content: message, isJson: false };
}

// Component to display assistant messages with citations
function AssistantMessage({
  message,
  citations,
  isStreaming = false,
}: {
  message: string;
  citations: Citation[];
  isStreaming?: boolean;
}) {
  const { content } = parseMessageContent(message);

  // Split into paragraphs and format
  const paragraphs = content.split("\n\n").filter((p) => p.trim());

  return (
    <div className="group relative">
      <div
        className="bg-gradient-to-br from-gray-50 to-gray-100 
                      border border-gray-200 rounded-2xl p-4 max-w-4xl
                      shadow-sm hover:shadow-md transition-all duration-300"
      >
        <div className="prose prose-sm max-w-none">
          {paragraphs.map((paragraph, pIndex) => {
            const parts = paragraph.split(/(\[\d+\])/g);

            return (
              <div key={pIndex} className={pIndex > 0 ? "mt-3" : ""}>
                {parts.map((part, i) => {
                  const match = part.match(/\[(\d+)\]/);
                  if (match) {
                    const index = parseInt(match[1], 10);
                    const citation = citations.find((c) => c.index === index);
                    return (
                      <CitationLink
                        key={i}
                        index={index}
                        citation={citation || null}
                      />
                    );
                  }

                  // Format lists and structure
                  if (part.includes("•") || part.match(/^\d+\./m)) {
                    return (
                      <div key={i} className="my-2">
                        {part.split("\n").map((line, lineIndex) => (
                          <div
                            key={lineIndex}
                            className={
                              line.trim().startsWith("•") ||
                              line.match(/^\d+\./)
                                ? "ml-4 my-1"
                                : ""
                            }
                          >
                            {line.trim()}
                          </div>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <span key={i} className="text-gray-900 leading-relaxed">
                      {part}
                    </span>
                  );
                })}
              </div>
            );
          })}

          {isStreaming && (
            <span className="inline-block w-2 h-5 bg-blue-500 animate-pulse ml-1" />
          )}
        </div>
      </div>
    </div>
  );
}

function OptimisticMessage({ message }: { message: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="bg-gradient-to-r from-blue-600 to-blue-700 text-white 
                      px-4 py-3 rounded-2xl max-w-md shadow-lg
                      animate-in slide-in-from-right-2 duration-300"
      >
        <p className="text-sm leading-relaxed">{message}</p>
      </div>
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
  const { data: messages } = useGetChat(sessionId);
  const {
    optimisticMessage,
    streamingMessage,
    isProcessing,
    lastFollowups,
    sendQuery,
  } = useStreamingQuery(sessionId);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, optimisticMessage, streamingMessage]);

  const onSend = async () => {
    if (!input.trim() || isProcessing) return;
    await sendQuery(input.trim(), selectedSources);
    setInput("");
  };

  const onFollowup = async (followup: string) => {
    if (isProcessing) return;
    await sendQuery(followup, selectedSources);
  };
  const getSourceNames = () => {
    if (selectedSources.length === 0) return "all sources";
    if (selectedSources.length === 1) {
      const source = sources.find((s) => s.id === selectedSources[0]);
      return source?.name || "selected source";
    }
    return `${selectedSources.length} sources`;
  };

  // Filter out the streaming message from DB messages if it exists
  const filteredMessages = messages || [];
  return (
    <div className="flex-1 flex flex-col bg-white relative">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-200">
              <span className="text-white text-lg font-semibold">💬</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Chat with {getSourceNames()}
              </h2>
              <div className="text-sm text-gray-600 mt-1">
                {selectedSources.length === 0
                  ? "General conversation mode"
                  : selectedSources.length === sources?.length
                  ? `Using all ${sources?.length || 0} sources`
                  : `Limited to ${selectedSources.length} selected sources`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-gray-50/30 to-white">
        {filteredMessages.map((m, index) => {
          const isLastAssistant =
            m.role === "assistant" && index === filteredMessages.length - 1;

          // Use citations from the database for ALL messages
          const citationsToUse = (m.citations as Citation[]) || [];

          // Only show followups for the last assistant message
          const followupsToUse =
            isLastAssistant && !streamingMessage ? lastFollowups : [];

          return (
            <div
              key={m.id}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              } animate-in slide-in-from-bottom-2 duration-300`}
            >
              {m.role === "assistant" ? (
                <div className="max-w-4xl w-full">
                  <AssistantMessage
                    message={m.message}
                    citations={citationsToUse} // Now citations persist for all messages!
                  />
                  {isLastAssistant && followupsToUse.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 animate-in slide-in-from-bottom-1 duration-500">
                      {followupsToUse.map((f, i) => (
                        <button
                          key={i}
                          onClick={() => onFollowup(f)}
                          disabled={isProcessing}
                          className="px-4 py-2 text-sm bg-white border border-gray-200 
                                   rounded-full hover:bg-gray-50 text-gray-700
                                   transition-all duration-200 hover:shadow-md
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   hover:border-blue-300 hover:text-blue-700"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-2xl max-w-md shadow-lg">
                  <p className="text-sm leading-relaxed">{m.message}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Optimistic message */}
        {optimisticMessage && <OptimisticMessage message={optimisticMessage} />}

        {/* Streaming response */}
        {streamingMessage && !streamingMessage.isComplete && (
          <div className="flex justify-start animate-in slide-in-from-left-2 duration-300">
            <div className="max-w-4xl w-full">
              {streamingMessage.content ? (
                <AssistantMessage
                  message={streamingMessage.content}
                  citations={streamingMessage.citations}
                  isStreaming={true}
                />
              ) : (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-4 max-w-4xl shadow-sm">
                  <TypingLoader />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Show streaming message followups only when complete and not yet in DB */}
        {streamingMessage?.isComplete &&
          streamingMessage.followups?.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-4xl w-full">
                <div className="mt-4 flex flex-wrap gap-2 animate-in slide-in-from-bottom-1 duration-500">
                  {streamingMessage.followups.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => onFollowup(f)}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm bg-white border border-gray-200 
                             rounded-full hover:bg-gray-50 text-gray-700
                             transition-all duration-200 hover:shadow-md
                             disabled:opacity-50 disabled:cursor-not-allowed
                             hover:border-blue-300 hover:text-blue-700"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Keep the same */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="flex space-x-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={
                selectedSources.length === 0
                  ? "Ask me anything..."
                  : `Ask about ${getSourceNames()}...`
              }
              className="w-full text-gray-900 px-4 py-3 border border-gray-300 
                       rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 
                       focus:border-blue-500 transition-all duration-200
                       placeholder-gray-500 bg-gray-50 hover:bg-white"
              disabled={isProcessing}
            />
          </div>

          <button
            onClick={onSend}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 
                     text-white rounded-xl hover:from-blue-700 hover:to-blue-800 
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 shadow-lg hover:shadow-xl
                     transform hover:scale-105 active:scale-95
                     font-medium"
            disabled={isProcessing || !input.trim()}
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              "Send"
            )}
          </button>
        </div>

        {/* Source indicator */}
        {selectedSources.length > 0 && (
          <div className="mt-3 flex items-center space-x-2 text-sm text-gray-600 animate-in slide-in-from-bottom-1 duration-300">
            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" />
            <span>
              Searching in:{" "}
              <span className="font-medium">
                {selectedSources
                  .map((id) => {
                    const source = sources.find((s) => s.id === id);
                    return source?.name || "Unknown";
                  })
                  .join(", ")}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
