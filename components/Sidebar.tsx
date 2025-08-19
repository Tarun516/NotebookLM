"use client";

import { useState } from "react";
import { useGetSession, useGetSources } from "@/hooks/useNotebook";
import AddSourceModal from "./AddSourceModal";

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const { data: session, isLoading: sLoading } = useGetSession();
  const { data: sources, isLoading: srcLoading } = useGetSources(
    session?.id || ""
  );

  return (
    <div className="flex w-1/4 flex-col bg-[#1E1E1E] text-white">
      <div className="border-b border-gray-700 p-4 text-lg font-bold">
        {sLoading ? "Loading..." : session?.name ?? "My Notebook"}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {srcLoading && <p className="text-gray-400">Loading sources...</p>}
        {!srcLoading && (sources?.length ?? 0) === 0 && (
          <p className="text-gray-400">No sources yet</p>
        )}
        {sources?.map((s) => (
          <div key={s.id} className="rounded p-2 hover:bg-[#2A2A2A]">
            {s.name} <span className="text-xs text-gray-400">({s.type})</span>
          </div>
        ))}
      </div>

      <button
        className="m-3 rounded bg-[#4285F4] p-3 text-white disabled:opacity-50"
        disabled={!session?.id}
        onClick={() => setOpen(true)}
      >
        + Add Source
      </button>

      {session?.id && (
        <AddSourceModal
          sessionId={session.id}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
