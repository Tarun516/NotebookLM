// app/page.tsx
"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import { useGetSources, useGetSession } from "@/hooks/useNotebook";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  const { data: session } = useGetSession();
  const { data: sources } = useGetSources(sessionId || "");

  // Auto-set session when loaded
  useEffect(() => {
    if (session?.id && !sessionId) {
      setSessionId(session.id);
    }
  }, [session, sessionId]);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        onSelectSource={(sourceId, sessId) => {
          setSessionId(sessId);
          // Toggle source selection
          setSelectedSources((prev) =>
            prev.includes(sourceId)
              ? prev.filter((id) => id !== sourceId)
              : [...prev, sourceId]
          );
        }}
        onSessionReady={(sessId) => setSessionId(sessId)}
        selectedSources={selectedSources}
        onSourceSelectionChange={setSelectedSources}
      />

      {sessionId ? (
        <ChatPanel
          sessionId={sessionId}
          selectedSources={selectedSources}
          sources={sources || []}
          onSourceSelectionChange={setSelectedSources}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-8 h-8 bg-gray-300 rounded"></div>
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              Setting up your notebook
            </h2>
            <p className="text-gray-600">Please wait while we initialize...</p>
          </div>
        </div>
      )}
    </div>
  );
}
