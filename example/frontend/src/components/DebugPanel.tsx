"use client";

import { useContext, useState, useEffect } from "react";
import { AgentServiceContext } from "@hhopkins/agent-runtime-react";
import { BACKEND_URL } from "@/lib/constants";

interface ServerDebugData {
  timestamp: number;
  loadedSessionCount: number;
  sessions: Array<{
    sessionId: string;
    state: any;
  }>;
}

/**
 * Debug Panel - Shows raw client and server state for debugging
 */
export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"client" | "server">("client");
  const [serverData, setServerData] = useState<ServerDebugData | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const context = useContext(AgentServiceContext);

  const fetchServerState = async () => {
    setIsLoading(true);
    setServerError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/debug`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setServerData(data);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh server state when panel is open and on server tab
  useEffect(() => {
    if (isOpen && activeTab === "server") {
      fetchServerState();
      const interval = setInterval(fetchServerState, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, activeTab]);

  if (!context) {
    return null;
  }

  const { state, wsManager } = context;

  // Convert Map to object for display
  const clientState = {
    isInitialized: state.isInitialized,
    sessionListCount: state.sessionList.length,
    sessionList: state.sessionList,
    sessionsMapCount: state.sessions.size,
    sessions: Object.fromEntries(
      Array.from(state.sessions.entries()).map(([id, session]) => [
        id,
        {
          info: session.info,
          blocksCount: session.blocks.length,
          blocks: session.blocks,
          streamingCount: session.streaming.size,
          streaming: Object.fromEntries(session.streaming),
          filesCount: session.files.length,
          files: session.files,
          subagentsCount: session.subagents.size,
          isLoading: session.isLoading,
        },
      ])
    ),
    wsConnected: wsManager.isConnected(),
  };

  return (
    <div className="fixed bottom-16 right-4 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 text-white px-3 py-1 rounded-t-lg text-sm font-mono"
      >
        {isOpen ? "Hide Debug" : "Show Debug"}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="bg-gray-900 text-green-400 rounded-lg shadow-2xl w-[600px] max-h-[500px] overflow-hidden font-mono text-xs">
          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab("client")}
              className={`px-4 py-2 ${
                activeTab === "client"
                  ? "bg-gray-800 text-green-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Client State
            </button>
            <button
              onClick={() => setActiveTab("server")}
              className={`px-4 py-2 ${
                activeTab === "server"
                  ? "bg-gray-800 text-green-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Server State
            </button>
            <div className="flex-1" />
            <div className="px-4 py-2 text-gray-500">
              WS: {wsManager.isConnected() ? "Connected" : "Disconnected"}
            </div>
          </div>

          {/* Content */}
          <div className="overflow-auto max-h-[440px] p-4">
            {activeTab === "client" && (
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(clientState, null, 2)}
              </pre>
            )}

            {activeTab === "server" && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={fetchServerState}
                    disabled={isLoading}
                    className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs"
                  >
                    {isLoading ? "Loading..." : "Refresh"}
                  </button>
                  {serverData && (
                    <span className="text-gray-500">
                      Last updated: {new Date(serverData.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {serverError && (
                  <div className="text-red-400 mb-2">Error: {serverError}</div>
                )}

                {serverData && (
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(serverData, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
