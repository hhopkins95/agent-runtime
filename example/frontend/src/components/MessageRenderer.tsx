"use client";

import { useState } from "react";
import type { ConversationBlock } from "@hhopkins/agent-runtime-react";

type ToolUseBlock = Extract<ConversationBlock, { type: "tool_use" }>;
type ToolResultBlock = Extract<ConversationBlock, { type: "tool_result" }>;

// Extended block type that includes paired result from AgentChat
type PairedBlock = ConversationBlock & { _pairedResult?: ToolResultBlock };

/**
 * Check if a tool result has meaningful output to display
 */
function hasOutput(result: ToolResultBlock | undefined): boolean {
  if (!result) return false;
  const output = result.output;
  if (output === null || output === undefined) return false;
  if (typeof output === "string" && output.trim() === "") return false;
  return true;
}

/**
 * Combined tool use + result renderer
 * Shows the tool invocation with optional result section
 */
function ToolBlockRenderer({
  block,
  result,
}: {
  block: ToolUseBlock;
  result?: ToolResultBlock;
}) {
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);
  const isError = result?.isError ?? false;
  const showResult = hasOutput(result);

  return (
    <div className="flex justify-start mb-4">
      <div className="bg-purple-100 border border-purple-300 rounded-lg px-4 py-2 max-w-[80%]">
        {/* Tool header with status */}
        <div className="flex items-center justify-between gap-2">
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
            {result?.durationMs && (
              <span className="ml-2 text-xs text-gray-600">
                ({result.durationMs}ms)
              </span>
            )}
          </div>
        </div>

        {block.description && (
          <div className="text-xs text-gray-600 mt-2">{block.description}</div>
        )}

        {/* Input section (collapsible) */}
        <button
          onClick={() => setIsInputExpanded(!isInputExpanded)}
          className="w-full text-left flex items-center gap-1 mt-2 text-xs text-purple-600 hover:text-purple-800"
        >
          <span className="flex-shrink-0">{isInputExpanded ? "▼" : "▶"}</span>
          <span>Input</span>
        </button>
        {isInputExpanded && (
          <pre className="text-xs text-gray-800 bg-purple-50 p-2 rounded overflow-x-auto mt-1">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        )}

        {/* Result section (collapsible, only if output exists) */}
        {showResult && (
          <>
            <button
              onClick={() => setIsOutputExpanded(!isOutputExpanded)}
              className={`w-full text-left flex items-center gap-1 mt-2 text-xs ${
                isError
                  ? "text-red-600 hover:text-red-800"
                  : "text-green-600 hover:text-green-800"
              }`}
            >
              <span className="flex-shrink-0">
                {isOutputExpanded ? "▼" : "▶"}
              </span>
              <span>Result{isError ? " (Error)" : ""}</span>
            </button>
            {isOutputExpanded && (
              <pre
                className={`text-xs text-gray-800 p-2 rounded overflow-x-auto mt-1 ${
                  isError ? "bg-red-100" : "bg-green-100"
                }`}
              >
                {typeof result!.output === "string"
                  ? result!.output
                  : JSON.stringify(result!.output, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type ThinkingBlock = Extract<ConversationBlock, { type: "thinking" }>;

/**
 * Collapsible thinking block renderer
 * Shows summary when collapsed, full content when expanded
 */
function ThinkingBlockRenderer({ block }: { block: ThinkingBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Truncate content for collapsed preview
  const previewLength = 100;
  const hasLongContent = block.content.length > previewLength;
  const preview = hasLongContent
    ? block.content.slice(0, previewLength) + "..."
    : block.content;

  return (
    <div className="flex justify-start mb-4">
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-2 max-w-[80%]">
        {/* Header with toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left flex items-center gap-2"
        >
          <span className="text-yellow-600 flex-shrink-0">
            {isExpanded ? "▼" : "▶"}
          </span>
          <span className="text-sm font-semibold text-yellow-700">
            Thinking
          </span>
          {block.summary && (
            <span className="text-xs text-gray-500 italic truncate">
              — {block.summary}
            </span>
          )}
        </button>

        {/* Content */}
        {isExpanded ? (
          <div className="text-sm text-gray-700 whitespace-pre-wrap mt-2 pl-5">
            {block.content}
          </div>
        ) : hasLongContent ? (
          <div className="text-sm text-gray-500 mt-1 pl-5 italic">
            {preview}
          </div>
        ) : (
          <div className="text-sm text-gray-700 mt-1 pl-5">
            {block.content}
          </div>
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
 * - Tool use (with paired result)
 * - Thinking blocks
 * - System messages
 * - Subagent blocks
 * - Error blocks
 *
 * Note: tool_result blocks are paired with tool_use blocks by AgentChat
 * and rendered together via ToolBlockRenderer.
 */
export function MessageRenderer({ block }: { block: PairedBlock }) {
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
      return <ToolBlockRenderer block={block} result={block._pairedResult} />;

    case "tool_result":
      // Tool results are now paired with tool_use blocks and rendered together
      // This case should not be reached after pairing in AgentChat
      return null;

    case "thinking":
      return <ThinkingBlockRenderer block={block} />;

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
