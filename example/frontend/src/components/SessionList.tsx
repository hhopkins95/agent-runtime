"use client";

import { useAgentSession, useSessionList } from "@hhopkins/agent-runtime-react";
import type { SessionListItem, SandboxStatus } from "@hhopkins/agent-runtime-react";

interface SessionListProps {
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
}

/**
 * Derive display status from runtime state
 */
function getDisplayStatus(session: SessionListItem): string {
  if (!session.runtime.isLoaded) {
    return "Not Loaded";
  }
  if (!session.runtime.sandbox) {
    return "Loaded";
  }
  switch (session.runtime.sandbox.status) {
    case "starting":
      return "Starting";
    case "ready":
      return "Ready";
    case "unhealthy":
      return "Unhealthy";
    case "terminated":
      return "Terminated";
    default:
      return "Unknown";
  }
}

/**
 * Get color classes based on runtime state
 */
function getStatusColor(session: SessionListItem): string {
  if (!session.runtime.isLoaded) {
    return "bg-gray-100 text-gray-700";
  }
  if (!session.runtime.sandbox) {
    return "bg-yellow-100 text-yellow-700";
  }
  switch (session.runtime.sandbox.status) {
    case "starting":
      return "bg-yellow-100 text-yellow-700";
    case "ready":
      return "bg-green-100 text-green-700";
    case "unhealthy":
      return "bg-red-100 text-red-700";
    case "terminated":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/**
 * Session list and management component
 *
 * Demonstrates:
 * - useSessionList hook for accessing all sessions
 * - useAgentSession hook for creating sessions
 * - Session runtime state display
 */
export function SessionList({ currentSessionId, onSessionSelect }: SessionListProps) {
  const { sessions, refresh } = useSessionList();
  const { createSession, isLoading } = useAgentSession();

  const handleCreateSession = async () => {
    try {
      const sessionId = await createSession("example-assistant", "claude-agent-sdk");
      onSessionSelect(sessionId);
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Unknown";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Sessions</h2>
          <button
            onClick={refresh}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Refresh
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <p className="text-sm">No sessions yet</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {sessions.map((session) => (
            <button
              key={session.sessionId}
              onClick={() => onSessionSelect(session.sessionId)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                currentSessionId === session.sessionId
                  ? "bg-blue-50 border-blue-300"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="font-medium text-sm text-gray-800 truncate">
                  {session.name || session.sessionId.slice(0, 8)}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${getStatusColor(session)}`}
                >
                  {getDisplayStatus(session)}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>Type: {session.type}</div>
                <div>Created: {formatDate(session.createdAt)}</div>
                {session.lastActivity && (
                  <div>Last activity: {formatDate(session.lastActivity)}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Create New Session Button */}
      <div className="border-t p-4 bg-gray-50 rounded-b-lg">
        <button
          onClick={handleCreateSession}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? "Creating..." : "New Session"}
        </button>
      </div>
    </div>
  );
}
