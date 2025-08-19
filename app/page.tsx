"use client";

import Sidebar from "@/components/Sidebar";

export default function Home() {
  return (
    <div className="flex h-screen">
      {/* Sidebar (Session + Sources) */}
      <Sidebar />

      {/* Chat Panel (placeholder for now) */}
      <div className="w-3/4 flex items-center justify-center bg-[#2A2A2A]">
        <p className="text-gray-400">
          Select or add a source to start chatting
        </p>
      </div>
    </div>
  );
}
