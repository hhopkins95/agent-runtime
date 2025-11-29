"use client";

import { useState } from "react";
import { useAgentSession, useSessionList } from "@hhopkins/agent-runtime-react";
import type { SessionListItem, AGENT_ARCHITECTURE_TYPE, AgentArchitectureSessionOptions } from "@hhopkins/agent-runtime-react";
import { SUPPORTED_ARCHITECTURES, type SupportedArchitecture } from "../lib/constants";

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
 * - Architecture selection and session options
 */
export function SessionList({ currentSessionId, onSessionSelect }: SessionListProps) {
  const { sessions, refresh } = useSessionList();
  const { createSession, isLoading } = useAgentSession();

  // Create session form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedArchitecture, setSelectedArchitecture] = useState<SupportedArchitecture>('claude-agent-sdk');
  const [modelOption, setModelOption] = useState('');

  const handleCreateSession = async () => {
    try {
      // Build session options if model is specified
      const sessionOptions: AgentArchitectureSessionOptions | undefined = modelOption
        ? { model: modelOption }
        : undefined;

      const sessionId = await createSession(
        "example-assistant",
        selectedArchitecture as AGENT_ARCHITECTURE_TYPE,
        sessionOptions
      );
      onSessionSelect(sessionId);
      // Reset form
      setShowCreateForm(false);
      setModelOption('');
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
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
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
                {session.sessionOptions?.model && (
                  <div>Model: {session.sessionOptions.model}</div>
                )}
                <div>Created: {formatDate(session.createdAt)}</div>
                {session.lastActivity && (
                  <div>Last activity: {formatDate(session.lastActivity)}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Create New Session Section */}
      <div className="border-t p-4 bg-gray-50 rounded-b-lg">
        {showCreateForm ? (
          <div className="space-y-3">
            {/* Architecture Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Architecture
              </label>
              <select
                value={selectedArchitecture}
                onChange={(e) => setSelectedArchitecture(e.target.value as SupportedArchitecture)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {SUPPORTED_ARCHITECTURES.map((arch) => (
                  <option key={arch.value} value={arch.value}>
                    {arch.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Model Option */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Model (optional)
              </label>
              <input
                type="text"
                value={modelOption}
                onChange={(e) => setModelOption(e.target.value)}
                placeholder="e.g., claude-sonnet-4-20250514"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setModelOption('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {isLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            New Session
          </button>
        )}
      </div>
    </div>
  );
}
