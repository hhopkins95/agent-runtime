/**
 * useSubagents Hook
 *
 * Access subagent conversations for Claude SDK sessions.
 * Provides real-time updates when subagents are discovered or completed.
 *
 * Blocks are pre-merged with streaming content for ready-to-render display.
 */

import { useContext, useCallback, useMemo } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { ConversationBlock, SessionMetadata } from '../types';

export interface SubagentInfo {
  id: string;
  blocks: ConversationBlock[];
  metadata: SessionMetadata;
  status: 'running' | 'completed' | 'failed';
  /** Set of block IDs currently streaming in this subagent */
  streamingBlockIds: Set<string>;
}

export interface UseSubagentsResult {
  /**
   * Array of all subagents for this session.
   * Blocks are pre-merged with streaming content.
   */
  subagents: SubagentInfo[];

  /**
   * Number of subagents
   */
  count: number;

  /**
   * Whether any subagent is currently running
   */
  hasRunningSubagents: boolean;

  /**
   * Get a specific subagent by ID (with merged blocks)
   */
  getSubagent: (subagentId: string) => SubagentInfo | undefined;

  /**
   * Get blocks for a specific subagent (pre-merged with streaming)
   */
  getSubagentBlocks: (subagentId: string) => ConversationBlock[];

  /**
   * Get subagents by status
   */
  getSubagentsByStatus: (
    status: 'running' | 'completed' | 'failed'
  ) => SubagentInfo[];
}

/**
 * Hook to access subagent conversations for a session
 *
 * Note: Subagents are only available for Claude SDK sessions.
 * Gemini CLI sessions will always return empty arrays.
 *
 * @param sessionId - Required session ID
 */
export function useSubagents(sessionId: string): UseSubagentsResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useSubagents must be used within AgentServiceProvider');
  }

  const { state } = context;
  const session = state.sessions.get(sessionId);

  // Merge streaming content into subagent blocks
  const subagents = useMemo((): SubagentInfo[] => {
    if (!session) return [];

    return Array.from(session.subagents.values()).map((subagent): SubagentInfo => {
      const streamingBlockIds = new Set<string>();

      // Merge streaming content for this subagent's blocks
      const mergedBlocks = subagent.blocks.map(block => {
        const streamingBlock = session.streaming.get(block.id);
        if (!streamingBlock || streamingBlock.conversationId !== subagent.id) {
          return block;
        }

        streamingBlockIds.add(block.id);

        // Only assistant_text and thinking blocks have streamable content
        if (block.type === 'assistant_text' || block.type === 'thinking') {
          return {
            ...block,
            content: streamingBlock.content,
          };
        }

        return block;
      });

      return {
        id: subagent.id,
        blocks: mergedBlocks,
        metadata: subagent.metadata,
        status: subagent.status,
        streamingBlockIds,
      };
    });
  }, [session?.subagents, session?.streaming]);

  const count = subagents.length;

  const hasRunningSubagents = useMemo(() => {
    return subagents.some((sub) => sub.status === 'running');
  }, [subagents]);

  const getSubagent = useCallback(
    (subagentId: string) => {
      return subagents.find(sub => sub.id === subagentId);
    },
    [subagents]
  );

  const getSubagentBlocks = useCallback(
    (subagentId: string) => {
      return subagents.find(sub => sub.id === subagentId)?.blocks ?? [];
    },
    [subagents]
  );

  const getSubagentsByStatus = useCallback(
    (status: 'running' | 'completed' | 'failed') => {
      return subagents.filter((sub) => sub.status === status);
    },
    [subagents]
  );

  return {
    subagents,
    count,
    hasRunningSubagents,
    getSubagent,
    getSubagentBlocks,
    getSubagentsByStatus,
  };
}
