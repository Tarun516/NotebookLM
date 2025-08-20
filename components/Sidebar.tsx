"use client";

import { useState } from "react";
import { useGetSession, useGetSources } from "@/hooks/useNotebook";
import AddSourceModal from "./AddSourceModal";

export default function Sidebar({
  onSelectSource,
  onSessionReady,
  selectedSources,
  onSourceSelectionChange,
}: {
  onSelectSource: (sourceId: string, sessionId: string) => void;
  onSessionReady?: (sessionId: string) => void;
  selectedSources: string[];
  onSourceSelectionChange: (sourceIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: session, isLoading: sLoading } = useGetSession();
  const { data: sources, isLoading: srcLoading } = useGetSources(
    session?.id || ""
  );

  const handleSourceToggle = (sourceId: string) => {
    const isSelected = selectedSources.includes(sourceId);
    if (isSelected) {
      onSourceSelectionChange(selectedSources.filter((id) => id !== sourceId));
    } else {
      onSourceSelectionChange([...selectedSources, sourceId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedSources.length === sources?.length) {
      onSourceSelectionChange([]);
    } else {
      onSourceSelectionChange(sources?.map((s) => s.id) || []);
    }
  };

  if (!open && session?.id && !session.id) {
    onSessionReady?.(session.id);
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-medium text-gray-900">
          {sLoading ? "Loading..." : session?.name ?? "My Notebook"}
        </h1>
      </div>

      {/* Source Selection Controls */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Sources</span>
          <button
            onClick={handleSelectAll}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {selectedSources.length === sources?.length
              ? "Deselect all"
              : "Select all"}
          </button>
        </div>

        <div className="text-xs text-gray-500">
          {selectedSources.length === 0
            ? "No sources selected - general chat mode"
            : selectedSources.length === sources?.length
            ? "All sources selected"
            : `${selectedSources.length} of ${
                sources?.length || 0
              } sources selected`}
        </div>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto">
        {srcLoading && (
          <div className="p-4 text-sm text-gray-500">Loading sources...</div>
        )}

        {!srcLoading && (sources?.length ?? 0) === 0 && (
          <div className="p-4 text-center">
            <div className="text-sm text-gray-500 mb-2">No sources yet</div>
            <div className="text-xs text-gray-400">
              Add documents, websites, or files to get started
            </div>
          </div>
        )}

        <div className="p-2 space-y-1">
          {sources?.map((source) => {
            const isSelected = selectedSources.includes(source.id);

            return (
              <div
                key={source.id}
                className={`flex items-center p-3 rounded-md border cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-50 border-blue-200"
                    : "hover:bg-gray-50 border-transparent"
                }`}
                onClick={() => handleSourceToggle(source.id)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleSourceToggle(source.id)}
                  className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  onClick={(e) => e.stopPropagation()}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        source.type === "pdf"
                          ? "bg-red-400"
                          : source.type === "url"
                          ? "bg-blue-400"
                          : source.type === "csv"
                          ? "bg-green-400"
                          : "bg-gray-400"
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {source.name}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {source.type.toUpperCase()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Source Button */}
      <div className="p-4 border-t border-gray-200">
        <button
          className="w-full flex items-center justify-center space-x-2 p-3 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!session?.id}
          onClick={() => setOpen(true)}
        >
          <span className="text-lg">+</span>
          <span className="text-sm font-medium">Add Source</span>
        </button>
      </div>

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
