"use client";

import { useState } from "react";
import { useSessionList } from "@hhopkins/agent-runtime-react";
import type { SessionListItem } from "@hhopkins/agent-runtime-react";
import { BACKEND_URL, API_KEY } from "@/lib/constants";

interface SessionHeaderProps {
  sessionId: string;
  onDelete?: () => void;
}

/**
 * Get display status from runtime state
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
 * Format timestamp to locale string
 */
function formatDate(timestamp?: number): string {
  if (!timestamp) return "N/A";
  return new Date(timestamp).toLocaleString();
}

/**
 * Session header bar displaying session info and controls
 */
export function SessionHeader({ sessionId, onDelete }: SessionHeaderProps) {
  const { sessions, refresh } = useSessionList();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const session = sessions.find((s) => s.sessionId === sessionId);

  if (!session) {
    return (
      <div className="bg-white rounded-lg shadow px-4 py-3 mb-4">
        <div className="text-gray-500">Loading session info...</div>
      </div>
    );
  }

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete session");
      }

      // Refresh the session list
      await refresh();

      // Call the onDelete callback to clear selection
      onDelete?.();
    } catch (error) {
      console.error("Failed to delete session:", error);
      alert("Failed to delete session. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirm(false);
  };

  return (
    <div className="bg-white rounded-lg shadow px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        {/* Left side - Session info */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Session ID */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">ID:</span>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
              {sessionId.slice(0, 12)}...
            </code>
            <button
              onClick={handleCopyId}
              className="text-xs text-blue-600 hover:text-blue-700"
              title="Copy full session ID"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Type badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Type:</span>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              {session.type}
            </span>
          </div>

          {/* Runtime status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Status:</span>
            <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(session)}`}>
              {getDisplayStatus(session)}
            </span>
          </div>

          {/* Sandbox ID (if exists) */}
          {session.runtime.sandbox && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sandbox:</span>
              <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">
                {session.runtime.sandbox.sandboxId.slice(0, 8)}...
              </code>
            </div>
          )}
        </div>

        {/* Right side - Timestamps and Delete */}
        <div className="flex items-center gap-4">
          {/* Timestamps */}
          <div className="text-xs text-gray-500 hidden lg:flex gap-4">
            <span>Created: {formatDate(session.createdAt)}</span>
            {session.lastActivity && (
              <span>Last Activity: {formatDate(session.lastActivity)}</span>
            )}
          </div>

          {/* Delete button */}
          {showConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Delete session?</span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300"
              >
                {isDeleting ? "Deleting..." : "Yes"}
              </button>
              <button
                onClick={handleCancelDelete}
                disabled={isDeleting}
                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              title="Delete session permanently"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
