/**
 * useMessages Hook
 *
 * Access conversation blocks and send messages to the agent.
 * Provides real-time streaming updates for the main conversation.
 *
 * Blocks are pre-merged with streaming content - consumers receive
 * ready-to-render data with streaming content included.
 */

import { useContext, useCallback, useState, useMemo } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { ConversationBlock, SessionMetadata } from '../types';

export interface UseMessagesResult {
  /**
   * Conversation blocks for the main transcript.
   * Pre-merged with streaming content for ready-to-render display.
   */
  blocks: ConversationBlock[];

  /**
   * Set of block IDs that are currently streaming.
   * Use to show typing indicators, cursors, etc.
   */
  streamingBlockIds: Set<string>;

  /**
   * Whether any block is currently streaming.
   * Convenience for `streamingBlockIds.size > 0`
   */
  isStreaming: boolean;

  /**
   * Session metadata (tokens, cost, model)
   */
  metadata: SessionMetadata;

  /**
   * Error from last message send
   */
  error: Error | null;

  /**
   * Send a message to the agent
   */
  sendMessage: (content: string) => Promise<void>;

  /**
   * Get a specific block by ID (from merged blocks)
   */
  getBlock: (blockId: string) => ConversationBlock | undefined;

  /**
   * Get all blocks of a specific type (from merged blocks)
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

  // Merge streaming content into blocks for display
  const mergedBlocks = useMemo(() => {
    if (!session) return [];

    return session.blocks.map(block => {
      // Only merge streaming content for main conversation blocks
      const streamingBlock = session.streaming.get(block.id);
      if (!streamingBlock || streamingBlock.conversationId !== 'main') {
        return block;
      }

      // Only assistant_text and thinking blocks have streamable content
      if (block.type === 'assistant_text' || block.type === 'thinking') {
        return {
          ...block,
          content: streamingBlock.content,
        };
      }

      return block;
    });
  }, [session?.blocks, session?.streaming]);

  // Get IDs of blocks that are currently streaming
  const streamingBlockIds = useMemo(() => {
    if (!session) return new Set<string>();

    const ids = new Set<string>();
    for (const [blockId, streamingBlock] of session.streaming) {
      // Only include main conversation blocks
      if (streamingBlock.conversationId === 'main') {
        ids.add(blockId);
      }
    }
    return ids;
  }, [session?.streaming]);

  const metadata = session?.metadata ?? {};
  const isStreaming = streamingBlockIds.size > 0;

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
      return mergedBlocks.find((block) => block.id === blockId);
    },
    [mergedBlocks]
  );

  const getBlocksByType = useCallback(
    <T extends ConversationBlock['type']>(type: T) => {
      return mergedBlocks.filter((block) => block.type === type) as Extract<
        ConversationBlock,
        { type: T }
      >[];
    },
    [mergedBlocks]
  );

  return {
    blocks: mergedBlocks,
    streamingBlockIds,
    isStreaming,
    metadata,
    error,
    sendMessage,
    getBlock,
    getBlocksByType,
  };
}
