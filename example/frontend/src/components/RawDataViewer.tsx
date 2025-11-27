"use client";

import { useState, useCallback } from "react";
import { useAgentSession } from "@hhopkins/agent-runtime-react";
import { BACKEND_URL, API_KEY } from "@/lib/constants";

interface RawDataViewerProps {
  sessionId: string;
}

type ViewMode = "client" | "server";

/**
 * Convert Maps to plain objects for JSON serialization
 */
function serializeForJson(obj: unknown): unknown {
  if (obj instanceof Map) {
    const result: Record<string, unknown> = {};
    obj.forEach((value, key) => {
      result[key] = serializeForJson(value);
    });
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeForJson);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeForJson(value);
    }
    return result;
  }
  return obj;
}

/**
 * Raw data viewer for debugging session state
 */
export function RawDataViewer({ sessionId }: RawDataViewerProps) {
  const { session } = useAgentSession(sessionId);
  const [viewMode, setViewMode] = useState<ViewMode>("client");
  const [serverData, setServerData] = useState<unknown>(null);
  const [isLoadingServer, setIsLoadingServer] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["info"])
  );

  const fetchServerData = useCallback(async () => {
    setIsLoadingServer(true);
    setServerError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setServerData(data);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoadingServer(false);
    }
  }, [sessionId]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const renderCollapsibleSection = (
    title: string,
    data: unknown,
    key: string
  ) => {
    const isExpanded = expandedSections.has(key);
    const jsonString = JSON.stringify(serializeForJson(data), null, 2);
    const lineCount = jsonString.split("\n").length;

    return (
      <div key={key} className="border rounded mb-2">
        <button
          onClick={() => toggleSection(key)}
          className="w-full px-3 py-2 text-left bg-gray-50 hover:bg-gray-100 flex items-center justify-between"
        >
          <span className="font-medium text-sm">{title}</span>
          <span className="text-xs text-gray-500">
            {lineCount} lines {isExpanded ? "[-]" : "[+]"}
          </span>
        </button>
        {isExpanded && (
          <pre className="p-3 text-xs overflow-x-auto bg-gray-900 text-green-400 max-h-96 overflow-y-auto">
            {jsonString}
          </pre>
        )}
      </div>
    );
  };

  const renderClientState = () => {
    if (!session) {
      return (
        <div className="text-gray-500 text-center py-8">
          Session not loaded in client state
        </div>
      );
    }

    return (
      <div>
        {renderCollapsibleSection("info (SessionListItem)", session.info, "info")}
        {renderCollapsibleSection(
          `blocks (${session.blocks.length} items)`,
          session.blocks,
          "blocks"
        )}
        {renderCollapsibleSection(
          `streaming (${session.streaming.size} active)`,
          session.streaming,
          "streaming"
        )}
        {renderCollapsibleSection("metadata", session.metadata, "metadata")}
        {renderCollapsibleSection(
          `files (${session.files.length} items)`,
          session.files,
          "files"
        )}
        {renderCollapsibleSection(
          `subagents (${session.subagents.size} items)`,
          session.subagents,
          "subagents"
        )}
      </div>
    );
  };

  const renderServerState = () => {
    if (!serverData && !serverError) {
      return (
        <div className="text-gray-500 text-center py-8">
          <p className="mb-4">Click "Fetch from Server" to load server data</p>
          <button
            onClick={fetchServerData}
            disabled={isLoadingServer}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
          >
            {isLoadingServer ? "Loading..." : "Fetch from Server"}
          </button>
        </div>
      );
    }

    if (serverError) {
      return (
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">Error: {serverError}</p>
          <button
            onClick={fetchServerData}
            disabled={isLoadingServer}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
          >
            Retry
          </button>
        </div>
      );
    }

    const data = serverData as Record<string, unknown>;
    return (
      <div>
        <div className="mb-4 flex justify-end">
          <button
            onClick={fetchServerData}
            disabled={isLoadingServer}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:bg-gray-100"
          >
            {isLoadingServer ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {renderCollapsibleSection(
          "Full Server Response (RuntimeSessionData)",
          data,
          "server-full"
        )}
        {data.blocks
          ? renderCollapsibleSection(
              `blocks (${(data.blocks as unknown[]).length} items)`,
              data.blocks,
              "server-blocks"
            )
          : null}
        {data.workspaceFiles
          ? renderCollapsibleSection(
              `workspaceFiles (${(data.workspaceFiles as unknown[]).length} items)`,
              data.workspaceFiles,
              "server-files"
            )
          : null}
        {data.subagents
          ? renderCollapsibleSection(
              `subagents (${(data.subagents as unknown[]).length} items)`,
              data.subagents,
              "server-subagents"
            )
          : null}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Raw Session Data</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("client")}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === "client"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Client State
            </button>
            <button
              onClick={() => setViewMode("server")}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === "server"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Server State
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {viewMode === "client"
            ? "Data from React context (SessionState)"
            : "Data from REST API (RuntimeSessionData)"}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === "client" ? renderClientState() : renderServerState()}
      </div>
    </div>
  );
}
