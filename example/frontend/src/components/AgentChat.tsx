"use client";

import { useState, useRef, useEffect } from "react";
import { useMessages } from "@hhopkins/agent-runtime-react";
import { MessageRenderer } from "./MessageRenderer";

interface AgentChatProps {
  sessionId: string;
}

/**
 * Main chat interface component
 *
 * Demonstrates:
 * - useMessages hook for conversation state
 * - Real-time message streaming
 * - Sending user messages
 * - Rendering different block types
 */
export function AgentChat({ sessionId }: AgentChatProps) {
  const { blocks, isStreaming, error, sendMessage } = useMessages(sessionId);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [blocks]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const message = input.trim();
    setInput("");
    setIsSending(true);

    try {
      await sendMessage(message);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-800">Chat</h2>
        <div className="text-xs text-gray-500 mt-1">
          {isStreaming && (
            <span className="inline-flex items-center">
              <span className="animate-pulse mr-1">●</span>
              Agent is responding...
            </span>
          )}
          {!isStreaming && blocks.length > 0 && (
            <span>{blocks.length} messages</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
        {blocks.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">No messages yet</p>
              <p className="text-sm">Send a message to start the conversation</p>
            </div>
          </div>
        )}

        {blocks.map((block) => (
          <MessageRenderer key={block.id} block={block} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Error: {error.message}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-4 bg-gray-50 rounded-b-lg">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
            disabled={isSending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
