// components/Sidebar.tsx - Better source display and animations
"use client";

import { useState } from "react";
import { useGetSession, useGetSources } from "@/hooks/useNotebook";
import AddSourceModal from "./AddSourceModal";

function SourceTypeIcon({ type }: { type: string }) {
  const icons = {
    pdf: "📄",
    url: "🌐",
    csv: "📊",
    txt: "📝",
  };

  return (
    <span className="text-lg">{icons[type as keyof typeof icons] || "📄"}</span>
  );
}

function SourceItem({
  source,
  isSelected,
  onToggle,
}: {
  source: any;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`group relative flex items-center p-4 rounded-xl border cursor-pointer 
                  transition-all duration-300 hover:shadow-md
                  ${
                    isSelected
                      ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm"
                      : "hover:bg-gray-50 border-gray-200 hover:border-gray-300"
                  }`}
      onClick={onToggle}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="mr-3 w-4 h-4 rounded border-gray-300 text-blue-600 
                 focus:ring-blue-500 focus:ring-2 transition-colors"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center
                       transition-all duration-300 group-hover:scale-110
                       ${
                         source.type === "pdf"
                           ? "bg-red-100 text-red-600"
                           : source.type === "url"
                           ? "bg-blue-100 text-blue-600"
                           : source.type === "csv"
                           ? "bg-green-100 text-green-600"
                           : "bg-gray-100 text-gray-600"
                       }`}
        >
          <SourceTypeIcon type={source.type} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate text-sm">
            {source.name}
          </div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-medium">
            {source.type}
          </div>
        </div>
      </div>

      {isSelected && (
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      )}
    </div>
  );
}

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

  if (session?.id && onSessionReady) {
    onSessionReady(session.id);
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
      {/* Header with gradient */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
        <h1 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
          <span className="text-2xl">📚</span>
          <span>
            {sLoading ? "Loading..." : session?.name ?? "My Notebook"}
          </span>
        </h1>
        <p className="text-sm text-gray-600 mt-2">
          Select sources to focus your search
        </p>
      </div>

      {/* Source Selection Controls */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
            <span>Sources</span>
            <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
              {sources?.length || 0}
            </span>
          </span>
          <button
            onClick={handleSelectAll}
            className="text-xs text-blue-600 hover:text-blue-800 
                     hover:bg-blue-50 px-2 py-1 rounded transition-colors"
            disabled={!sources?.length}
          >
            {selectedSources.length === sources?.length
              ? "Deselect all"
              : "Select all"}
          </button>
        </div>

        <div className="text-xs text-gray-600 bg-white rounded-lg p-3 border">
          {selectedSources.length === 0 ? (
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
              <span>General chat mode</span>
            </span>
          ) : selectedSources.length === sources?.length ? (
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span>All sources selected</span>
            </span>
          ) : (
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-blue-400 rounded-full" />
              <span>
                {selectedSources.length} of {sources?.length || 0} sources
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto p-4">
        {srcLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {!srcLoading && (sources?.length ?? 0) === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📁</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No sources yet
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Add documents, websites, or files to get started with your
              notebook
            </p>
            <button
              onClick={() => setOpen(true)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium
                       hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
              disabled={!session?.id}
            >
              Add your first source
            </button>
          </div>
        )}

        <div className="space-y-3">
          {sources?.map((source) => (
            <div
              key={source.id}
              className="animate-in slide-in-from-left-2 duration-300"
            >
              <SourceItem
                source={source}
                isSelected={selectedSources.includes(source.id)}
                onToggle={() => handleSourceToggle(source.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Add Source Button */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <button
          className="w-full flex items-center justify-center space-x-2 p-4 
                   bg-gradient-to-r from-blue-600 to-blue-700 text-white 
                   rounded-xl hover:from-blue-700 hover:to-blue-800 
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200 shadow-lg hover:shadow-xl
                   transform hover:scale-105 active:scale-95 font-medium"
          disabled={!session?.id}
          onClick={() => setOpen(true)}
        >
          <span className="text-xl">➕</span>
          <span>Add Source</span>
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
