"use client";

import { useState } from "react";
import { useAddSource } from "@/hooks/useNotebook";

type Props = {
  sessionId: string;
  open: boolean;
  onClose: () => void;
};

export default function AddSourceModal({ sessionId, open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addSource = useAddSource(sessionId);

  if (!open) return null;

  const onSubmit = async () => {
    try {
      setError(null);
      const form = new FormData();

      if (activeTab === "upload") {
        if (!file) {
          setError("Select a file first");
          return;
        }
        form.append("file", file);
      } else {
        const trimmed = url.trim();
        if (!trimmed) {
          setError("Enter a URL");
          return;
        }
        try {
          new URL(trimmed);
        } catch {
          setError("Invalid URL");
          return;
        }
        form.append("url", trimmed);
      }

      await addSource.mutateAsync(form);
      setFile(null);
      setUrl("");
      onClose();
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setFile(files[0]);
      setActiveTab("upload");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-md relative">
        {/* Loader Overlay */}
        {addSource.isPending && (
          <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-50 rounded-lg">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-700 font-medium">
              Uploading & indexing your source...
            </p>
          </div>
        )}

        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Add source</h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload documents or add websites to your notebook
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === "upload"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("upload")}
            disabled={addSource.isPending}
          >
            Upload files
          </button>
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 ${
              activeTab === "url"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("url")}
            disabled={addSource.isPending}
          >
            Add website
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "upload" ? (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragOver
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
              >
                <input
                  type="file"
                  accept=".pdf,.csv,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="file-upload"
                  disabled={addSource.isPending}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="space-y-2">
                    <div className="w-8 h-8 bg-gray-200 rounded mx-auto"></div>
                    <div className="text-sm font-medium text-gray-900">
                      {file ? file.name : "Drop files here or click to browse"}
                    </div>
                    <div className="text-xs text-gray-500">
                      PDF, TXT, CSV up to 50MB
                    </div>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Website URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full text-black px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={addSource.isPending}
                />
              </div>
              <div className="text-xs text-gray-500">
                We'll crawl and index the page content for you
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex text-black justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-black text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
            disabled={addSource.isPending}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-2 text-black text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            disabled={
              addSource.isPending ||
              (!file && activeTab === "upload") ||
              (!url && activeTab === "url")
            }
          >
            {addSource.isPending ? "Adding..." : "Add source"}
          </button>
        </div>
      </div>
    </div>
  );
}
