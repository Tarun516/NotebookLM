// components/Sidebar.tsx
"use client";

import { useGetSession, useGetSources } from "@/hooks/useNotebook";

export default function Sidebar() {
  const {
    data: session,
    isLoading: sessionLoading,
    isError: sessionError,
  } = useGetSession();

  const {
    data: sources,
    isLoading: sourcesLoading,
    isError: sourcesError,
  } = useGetSources(session?.id || "");

  if (sessionLoading) {
    return (
      <div className="w-1/4 bg-[#1E1E1E] text-white p-4">
        Loading session...
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="w-1/4 bg-[#1E1E1E] text-white p-4">
        Failed to load session
      </div>
    );
  }

  return (
    <div className="w-1/4 bg-[#1E1E1E] text-white flex flex-col">
      {/* Session Name */}
      <div className="p-4 border-b border-gray-700 font-bold text-lg">
        {session.name}
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto p-2">
        {sourcesLoading && <p className="text-gray-400">Loading sources...</p>}
        {sourcesError && <p className="text-red-400">Failed to load sources</p>}
        {!sourcesLoading && sources?.length === 0 && (
          <p className="text-gray-400">No sources yet</p>
        )}
        {sources?.map((s) => (
          <div
            key={s.id}
            className="p-2 rounded hover:bg-[#2A2A2A] cursor-pointer"
          >
            {s.name} <span className="text-xs text-gray-400">({s.type})</span>
          </div>
        ))}
      </div>

      {/* Add Source Button (future feature) */}
      <button
        className="p-3 bg-[#4285F4] text-white m-3 rounded"
        onClick={() => alert("Add Source (coming soon)")}
      >
        + Add Source
      </button>
    </div>
  );
}
