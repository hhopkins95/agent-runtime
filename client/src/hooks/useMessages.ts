/**
 * useMessages Hook
 *
 * Access conversation blocks and send messages to the agent.
 * Provides real-time streaming updates for the main conversation.
 */

import { useContext, useCallback, useState } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { ConversationBlock, SessionMetadata } from '../types';

export interface UseMessagesResult {
  /**
   * Conversation blocks for the main transcript
   */
  blocks: ConversationBlock[];

  /**
   * Session metadata (tokens, cost, model)
   */
  metadata: SessionMetadata;

  /**
   * Whether the agent is currently streaming a response
   */
  isStreaming: boolean;

  /**
   * Error from last message send
   */
  error: Error | null;

  /**
   * Send a message to the agent
   */
  sendMessage: (content: string) => Promise<void>;

  /**
   * Get a specific block by ID
   */
  getBlock: (blockId: string) => ConversationBlock | undefined;

  /**
   * Get all blocks of a specific type
   */
  getBlocksByType: <T extends ConversationBlock['type']>(
    type: T
  ) => Extract<ConversationBlock, { type: T }>[];
}

/**
 * Hook to access and interact with the conversation
 *
 * @param sessionId - Required session ID
 */
export function useMessages(sessionId: string): UseMessagesResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useMessages must be used within AgentServiceProvider');
  }

  const { state, restClient } = context;
  const [error, setError] = useState<Error | null>(null);

  const session = state.sessions.get(sessionId);

  const blocks = session?.blocks ?? [];
  const metadata = session?.metadata ?? {};
  const isStreaming = session?.isStreaming ?? false;

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);

      try {
        await restClient.sendMessage(sessionId, content);
        // Response will come via WebSocket events
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [sessionId, restClient]
  );

  const getBlock = useCallback(
    (blockId: string) => {
      return blocks.find((block) => block.id === blockId);
    },
    [blocks]
  );

  const getBlocksByType = useCallback(
    <T extends ConversationBlock['type']>(type: T) => {
      return blocks.filter((block) => block.type === type) as Extract<
        ConversationBlock,
        { type: T }
      >[];
    },
    [blocks]
  );

  return {
    blocks,
    metadata,
    isStreaming,
    error,
    sendMessage,
    getBlock,
    getBlocksByType,
  };
}
