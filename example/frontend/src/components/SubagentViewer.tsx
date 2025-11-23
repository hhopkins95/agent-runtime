"use client";

import { useState } from "react";
import { useSubagents } from "@hhopkins/agent-runtime-react";
import { MessageRenderer } from "./MessageRenderer";

interface SubagentViewerProps {
  sessionId: string;
}

/**
 * Subagent conversation viewer component
 *
 * Demonstrates:
 * - useSubagents hook for accessing nested agent conversations
 * - Viewing subagent blocks and status
 * - Claude SDK specific feature
 */
export function SubagentViewer({ sessionId }: SubagentViewerProps) {
  const { subagents, count, hasRunningSubagents } = useSubagents(sessionId);
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);

  const selectedSubagent = subagents.find((s) => s.id === selectedSubagentId);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "running":
        return "bg-yellow-100 text-yellow-700";
      case "completed":
        return "bg-green-100 text-green-700";
      case "failed":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-800">Subagents</h2>
        <div className="text-xs text-gray-500 mt-1">
          {count} subagent{count !== 1 ? "s" : ""}
          {hasRunningSubagents && (
            <span className="ml-2 text-yellow-600">
              <span className="animate-pulse">●</span> Running
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Subagent List */}
        <div className="w-1/3 border-r overflow-y-auto">
          {subagents.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-sm">No subagents yet</p>
                <p className="text-xs mt-1">Claude SDK only</p>
              </div>
            </div>
          )}

          <div className="p-2 space-y-1">
            {subagents.map((subagent) => (
              <button
                key={subagent.id}
                onClick={() => setSelectedSubagentId(subagent.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedSubagentId === subagent.id
                    ? "bg-blue-100 text-blue-700"
                    : "bg-white hover:bg-gray-100 text-gray-700"
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="text-sm font-medium truncate">
                    {subagent.id.slice(0, 12)}...
                  </div>
                  {subagent.status && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${getStatusColor(
                        subagent.status
                      )}`}
                    >
                      {subagent.status}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {subagent.blocks.length} block{subagent.blocks.length !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Subagent Conversation */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedSubagent && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-sm">
                  {subagents.length === 0
                    ? "Subagent conversations will appear here"
                    : "Select a subagent to view its conversation"}
                </p>
              </div>
            </div>
          )}

          {selectedSubagent && (
            <div>
              <div className="mb-4 pb-3 border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      Subagent: {selectedSubagent.id.slice(0, 12)}...
                    </h3>
                    <div className="text-xs text-gray-500 mt-1">
                      {selectedSubagent.blocks.length} block
                      {selectedSubagent.blocks.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  {selectedSubagent.status && (
                    <span
                      className={`text-xs px-2 py-1 rounded ${getStatusColor(
                        selectedSubagent.status
                      )}`}
                    >
                      {selectedSubagent.status}
                    </span>
                  )}
                </div>
              </div>

              {selectedSubagent.blocks.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <p className="text-sm">No blocks yet</p>
                </div>
              )}

              <div className="space-y-2">
                {selectedSubagent.blocks.map((block) => (
                  <MessageRenderer key={block.id} block={block} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
