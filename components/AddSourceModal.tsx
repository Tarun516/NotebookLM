"use client";

import { useState } from "react";
import { useAddSource } from "@/hooks/useNotebook";

type Props = {
  sessionId: string;
  open: boolean;
  onClose: () => void;
};

export default function AddSourceModal({ sessionId, open, onClose }: Props) {
  const [tab, setTab] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addSource = useAddSource(sessionId);

  if (!open) return null;

  const onSubmit = async () => {
    try {
      setError(null);
      const form = new FormData();

      if (tab === "file") {
        if (!file) {
          setError("Please choose a file (PDF, CSV, TXT).");
          return;
        }
        form.append("file", file);
      } else {
        const trimmed = url.trim();
        if (!trimmed) {
          setError("Please enter a URL.");
          return;
        }
        try {
          new URL(trimmed);
        } catch {
          setError("Invalid URL format.");
          return;
        }
        form.append("url", trimmed);
      }

      await addSource.mutateAsync(form);

      // Reset state
      setFile(null);
      setUrl("");
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to add source.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg bg-[#2A2A2A] p-5 text-white shadow-lg">
        {/* Tabs */}
        <div className="mb-4 flex border-b border-gray-700">
          <button
            className={`flex-1 p-2 ${
              tab === "file" ? "border-b-2 border-[#4285F4]" : ""
            }`}
            onClick={() => setTab("file")}
          >
            Upload File
          </button>
          <button
            className={`flex-1 p-2 ${
              tab === "url" ? "border-b-2 border-[#4285F4]" : ""
            }`}
            onClick={() => setTab("url")}
          >
            Website URL
          </button>
        </div>

        {/* File Upload */}
        {tab === "file" ? (
          <div className="space-y-3">
            <input
              type="file"
              accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded border border-gray-600 bg-[#1E1E1E] p-2"
            />
            <p className="text-xs text-gray-400">Supported: PDF, CSV, TXT</p>
          </div>
        ) : (
          /* URL Input */
          <div className="space-y-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full rounded border border-gray-600 bg-[#1E1E1E] p-2"
            />
            <p className="text-xs text-gray-400">
              We’ll fetch and index the page content.
            </p>
          </div>
        )}

        {/* Error */}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500"
            disabled={addSource.isPending}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="rounded bg-[#4285F4] px-4 py-2 hover:bg-blue-500 disabled:opacity-60"
            disabled={addSource.isPending}
          >
            {addSource.isPending ? "Adding..." : "Add Source"}
          </button>
        </div>
      </div>
    </div>
  );
}
