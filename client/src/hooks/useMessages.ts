/**
 * useMessages Hook
 *
 * Access conversation blocks and send messages to the agent.
 * Provides real-time streaming updates for the main conversation.
 *
 * Blocks are pre-merged with streaming content - consumers receive
 * ready-to-render data with streaming content included.
 */

import { useContext, useCallback, useState, useMemo, useEffect } from 'react';
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

  const { state, dispatch, restClient, wsManager } = context;
  const [error, setError] = useState<Error | null>(null);

  // Load session data from REST API if not already in state
  useEffect(() => {
    if (sessionId && !state.sessions.has(sessionId)) {
      restClient.getSession(sessionId)
        .then((data) => {
          dispatch({ type: 'SESSION_LOADED', sessionId, data });
        })
        .catch((err) => {
          console.error('[useMessages] Failed to load session data:', err);
        });
    }
  }, [sessionId, state.sessions, restClient, dispatch]);

  // Join/leave WebSocket room to receive real-time events
  useEffect(() => {
    if (sessionId) {
      wsManager.joinSession(sessionId).catch((err) => {
        console.error('[useMessages] Failed to join session room:', err);
      });

      return () => {
        wsManager.leaveSession(sessionId).catch((err) => {
          console.error('[useMessages] Failed to leave session room:', err);
        });
      };
    }
  }, [sessionId, wsManager]);

  const session = state.sessions.get(sessionId);

  // Merge streaming content into blocks for display
  // Streaming is keyed by conversationId - append streaming content as a temporary block
  const mergedBlocks = useMemo(() => {
    if (!session) return [];

    const streamingContent = session.streaming.get('main');

    // If actively streaming, append a temporary streaming block
    if (streamingContent && streamingContent.content) {
      return [
        ...session.blocks,
        {
          type: 'assistant_text' as const,
          id: 'streaming',
          timestamp: new Date().toISOString(),
          content: streamingContent.content,
        },
      ];
    }

    return session.blocks;
  }, [session?.blocks, session?.streaming]);

  // Get IDs of blocks that are currently streaming
  // With conversationId-based streaming, return 'streaming' if main is active
  const streamingBlockIds = useMemo(() => {
    if (!session) return new Set<string>();

    const streamingContent = session.streaming.get('main');
    if (streamingContent && streamingContent.content) {
      return new Set(['streaming']);
    }
    return new Set<string>();
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
