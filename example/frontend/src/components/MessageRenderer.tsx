"use client";

import { useState } from "react";
import type { ConversationBlock } from "@hhopkins/agent-runtime-react";

type ToolUseBlock = Extract<ConversationBlock, { type: "tool_use" }>;
type ToolResultBlock = Extract<ConversationBlock, { type: "tool_result" }>;

function ToolUseBlockRenderer({ block }: { block: ToolUseBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex justify-start mb-4">
      <div className="bg-purple-100 border border-purple-300 rounded-lg px-4 py-2 max-w-[80%]">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left flex items-center justify-between gap-2"
        >
          <div className="text-sm font-semibold text-purple-700">
            Tool: {block.toolName}
            {block.status && (
              <span
                className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  block.status === "success"
                    ? "bg-green-100 text-green-700"
                    : block.status === "error"
                      ? "bg-red-100 text-red-700"
                      : block.status === "running"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-700"
                }`}
              >
                {block.status}
              </span>
            )}
          </div>
          <span className="text-purple-500 text-xs flex-shrink-0">
            {isExpanded ? "▼" : "▶"}
          </span>
        </button>
        {isExpanded && (
          <>
            {block.description && (
              <div className="text-xs text-gray-600 mb-2 mt-2">
                {block.description}
              </div>
            )}
            <pre className="text-xs text-gray-800 bg-purple-50 p-2 rounded overflow-x-auto mt-2">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

function ToolResultBlockRenderer({ block }: { block: ToolResultBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isError = block.isError;

  return (
    <div className="flex justify-start mb-4">
      <div
        className={`border rounded-lg px-4 py-2 max-w-[80%] ${
          isError ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"
        }`}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left flex items-center justify-between gap-2"
        >
          <div
            className={`text-sm font-semibold ${isError ? "text-red-700" : "text-green-700"}`}
          >
            Result {isError ? "(Error)" : ""}
            {block.durationMs && (
              <span className="ml-2 text-xs text-gray-600">
                ({block.durationMs}ms)
              </span>
            )}
          </div>
          <span
            className={`text-xs flex-shrink-0 ${isError ? "text-red-500" : "text-green-500"}`}
          >
            {isExpanded ? "▼" : "▶"}
          </span>
        </button>
        {isExpanded && (
          <pre
            className={`text-xs text-gray-800 p-2 rounded overflow-x-auto mt-2 ${
              isError ? "bg-red-100" : "bg-green-100"
            }`}
          >
            {typeof block.output === "string"
              ? block.output
              : JSON.stringify(block.output, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * Renders different types of conversation blocks
 *
 * Handles:
 * - User messages
 * - Assistant text
 * - Tool use/results (collapsible)
 * - Thinking blocks
 * - System messages
 * - Subagent blocks
 * - Error blocks
 */
export function MessageRenderer({ block }: { block: ConversationBlock }) {
  switch (block.type) {
    case "user_message":
      return (
        <div className="flex justify-end mb-4">
          <div className="bg-blue-500 text-white rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1">You</div>
            <div>
              {typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content)}
            </div>
          </div>
        </div>
      );

    case "assistant_text":
      return (
        <div className="flex justify-start mb-4">
          <div className="bg-gray-200 text-gray-900 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1 text-gray-700">
              Assistant
            </div>
            <div className="whitespace-pre-wrap">{block.content}</div>
          </div>
        </div>
      );

    case "tool_use":
      return <ToolUseBlockRenderer block={block} />;

    case "tool_result":
      return <ToolResultBlockRenderer block={block} />;

    case "thinking":
      return (
        <div className="flex justify-start mb-4">
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1 text-yellow-700">
              Thinking
            </div>
            {block.summary && (
              <div className="text-xs text-gray-600 mb-2 italic">
                {block.summary}
              </div>
            )}
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {block.content}
            </div>
          </div>
        </div>
      );

    case "system":
      return (
        <div className="flex justify-center mb-4">
          <div className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-xs text-gray-600 text-center">
              [{block.subtype}] {block.message}
            </div>
          </div>
        </div>
      );

    case "subagent":
      return (
        <div className="flex justify-start mb-4">
          <div className="bg-indigo-100 border border-indigo-300 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1 text-indigo-700">
              Subagent: {block.name || block.subagentId}
              {block.status && (
                <span
                  className={`ml-2 text-xs px-2 py-0.5 rounded ${
                    block.status === "success"
                      ? "bg-green-100 text-green-700"
                      : block.status === "error"
                        ? "bg-red-100 text-red-700"
                        : block.status === "running"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {block.status}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-700 mb-2">
              <span className="font-medium">Input:</span> {block.input}
            </div>
            {block.output && (
              <div className="text-sm text-gray-700">
                <span className="font-medium">Output:</span> {block.output}
              </div>
            )}
            {block.durationMs && (
              <div className="text-xs text-gray-600 mt-1">
                Duration: {block.durationMs}ms
              </div>
            )}
          </div>
        </div>
      );

    case "error":
      return (
        <div className="flex justify-center mb-4">
          <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1 text-red-700">
              Error{" "}
              {block.code && (
                <span className="text-xs font-normal">({block.code})</span>
              )}
            </div>
            <div className="text-sm text-red-600">{block.message}</div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
