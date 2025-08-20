// app/page.tsx
"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  return (
    <div className="flex h-screen">
      <Sidebar
        onSelectSource={(sourceId, sessId) => {
          setSessionId(sessId);
          setSelectedSourceId(sourceId);
        }}
        onSessionReady={(sessId) => setSessionId(sessId)}
      />
      {sessionId ? (
        <ChatPanel sessionId={sessionId} selectedSourceId={selectedSourceId} />
      ) : (
        <div className="flex w-3/4 items-center justify-center bg-[#2A2A2A] text-gray-400">
          Loading session...
        </div>
      )}
    </div>
  );
}
