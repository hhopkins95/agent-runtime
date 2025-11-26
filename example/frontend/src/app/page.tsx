"use client";

import { useState } from "react";
import { SessionList } from "@/components/SessionList";
import { AgentChat } from "@/components/AgentChat";
import { FileWorkspace } from "@/components/FileWorkspace";
import { SubagentViewer } from "@/components/SubagentViewer";
import { DebugPanel } from "@/components/DebugPanel";
import { DebugEventList } from "@/components/DebugEventList";

/**
 * Main dashboard page
 *
 * Demonstrates the complete agent runtime integration:
 * - Session management
 * - Real-time chat with agent
 * - File workspace tracking
 * - Subagent conversations
 */
export default function HomePage() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "files" | "subagents">("chat");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">
            Agent Runtime Example
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Demonstrating @hhopkins/agent-runtime with Next.js
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          {/* Left Sidebar - Session List */}
          <div className="col-span-3">
            <SessionList
              currentSessionId={currentSessionId}
              onSessionSelect={setCurrentSessionId}
            />
          </div>

          {/* Main Panel */}
          <div className="col-span-9 flex flex-col">
            {!currentSessionId ? (
              <div className="flex-1 flex items-center justify-center bg-white rounded-lg shadow">
                <div className="text-center text-gray-400">
                  <p className="text-lg font-medium mb-2">No session selected</p>
                  <p className="text-sm">
                    Create a new session or select an existing one to get started
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Tab Navigation */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab("chat")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === "chat"
                        ? "bg-blue-500 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setActiveTab("files")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === "files"
                        ? "bg-blue-500 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Files
                  </button>
                  <button
                    onClick={() => setActiveTab("subagents")}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === "subagents"
                        ? "bg-blue-500 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Subagents
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1">
                  {activeTab === "chat" && (
                    <AgentChat sessionId={currentSessionId} />
                  )}
                  {activeTab === "files" && (
                    <FileWorkspace sessionId={currentSessionId} />
                  )}
                  {activeTab === "subagents" && (
                    <SubagentViewer sessionId={currentSessionId} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Debug Panels */}
      <DebugPanel />
      <DebugEventList />

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t py-2">
        <div className="max-w-screen-2xl mx-auto px-6">
          <p className="text-xs text-gray-500 text-center">
            Built with @hhopkins/agent-runtime and @hhopkins/agent-runtime-react
          </p>
        </div>
      </footer>
    </div>
  );
}
