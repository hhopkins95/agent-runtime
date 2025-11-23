/**
 * useSubagents Hook
 *
 * Access subagent conversations for Claude SDK sessions.
 * Provides real-time updates when subagents are discovered or completed.
 */

import { useContext, useCallback, useMemo } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { ConversationBlock, SessionMetadata } from '../types';

export interface SubagentInfo {
  id: string;
  blocks: ConversationBlock[];
  metadata: SessionMetadata;
  status?: 'running' | 'completed' | 'failed';
}

export interface UseSubagentsResult {
  /**
   * Array of all subagents for this session
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
   * Get a specific subagent by ID
   */
  getSubagent: (subagentId: string) => SubagentInfo | undefined;

  /**
   * Get blocks for a specific subagent
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

  const subagents = useMemo(() => {
    if (!session) return [];
    return Array.from(session.subagents.values());
  }, [session?.subagents]);

  const count = subagents.length;

  const hasRunningSubagents = useMemo(() => {
    return subagents.some((sub) => sub.status === 'running');
  }, [subagents]);

  const getSubagent = useCallback(
    (subagentId: string) => {
      return session?.subagents.get(subagentId);
    },
    [session?.subagents]
  );

  const getSubagentBlocks = useCallback(
    (subagentId: string) => {
      return session?.subagents.get(subagentId)?.blocks ?? [];
    },
    [session?.subagents]
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
