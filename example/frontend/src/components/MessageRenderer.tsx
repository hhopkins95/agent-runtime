import type { ConversationBlock } from "@hhopkins/agent-runtime";

/**
 * Renders different types of conversation blocks
 *
 * Handles:
 * - User messages
 * - Assistant text
 * - Tool use/results
 * - Thinking blocks
 * - System messages
 * - Subagent blocks
 */
export function MessageRenderer({ block }: { block: ConversationBlock }) {
  switch (block.type) {
    case "user_message":
      return (
        <div className="flex justify-end mb-4">
          <div className="bg-blue-500 text-white rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1">You</div>
            <div>{typeof block.content === "string" ? block.content : JSON.stringify(block.content)}</div>
          </div>
        </div>
      );

    case "assistant_text":
      return (
        <div className="flex justify-start mb-4">
          <div className="bg-gray-200 text-gray-900 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1 text-gray-700">Assistant</div>
            <div className="whitespace-pre-wrap">{block.content}</div>
          </div>
        </div>
      );

    case "tool_use":
      return (
        <div className="flex justify-start mb-4">
          <div className="bg-purple-100 border border-purple-300 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1 text-purple-700">
              Tool: {block.toolName}
              {block.status && (
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  block.status === "success" ? "bg-green-100 text-green-700" :
                  block.status === "error" ? "bg-red-100 text-red-700" :
                  block.status === "running" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {block.status}
                </span>
              )}
            </div>
            {block.description && (
              <div className="text-xs text-gray-600 mb-2">{block.description}</div>
            )}
            <pre className="text-xs bg-purple-50 p-2 rounded overflow-x-auto">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          </div>
        </div>
      );

    case "tool_result":
      const isError = block.isError;
      return (
        <div className="flex justify-start mb-4">
          <div className={`border rounded-lg px-4 py-2 max-w-[80%] ${
            isError ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"
          }`}>
            <div className={`text-sm font-semibold mb-1 ${isError ? "text-red-700" : "text-green-700"}`}>
              Result {isError ? "(Error)" : ""}
              {block.durationMs && (
                <span className="ml-2 text-xs text-gray-600">({block.durationMs}ms)</span>
              )}
            </div>
            <pre className={`text-xs p-2 rounded overflow-x-auto ${
              isError ? "bg-red-100" : "bg-green-100"
            }`}>
              {typeof block.output === "string" ? block.output : JSON.stringify(block.output, null, 2)}
            </pre>
          </div>
        </div>
      );

    case "thinking":
      return (
        <div className="flex justify-start mb-4">
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-2 max-w-[80%]">
            <div className="text-sm font-semibold mb-1 text-yellow-700">Thinking</div>
            {block.summary && (
              <div className="text-xs text-gray-600 mb-2 italic">{block.summary}</div>
            )}
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{block.content}</div>
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
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  block.status === "success" ? "bg-green-100 text-green-700" :
                  block.status === "error" ? "bg-red-100 text-red-700" :
                  block.status === "running" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
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
              <div className="text-xs text-gray-600 mt-1">Duration: {block.durationMs}ms</div>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
}
