/**
 * useSessionList Hook
 *
 * Access the list of all sessions (active + inactive).
 * Automatically updates when sessions are created, destroyed, or change status.
 */

import { useContext, useCallback } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { SessionListItem } from '../types';

export interface UseSessionListResult {
  /**
   * Array of all sessions with their runtime state
   */
  sessions: SessionListItem[];

  /**
   * Whether the initial session list has been loaded
   */
  isLoading: boolean;

  /**
   * Manually refresh the session list from the server
   */
  refresh: () => Promise<void>;

  /**
   * Get a specific session by ID
   */
  getSession: (sessionId: string) => SessionListItem | undefined;
}

/**
 * Hook to access and manage the session list
 */
export function useSessionList(): UseSessionListResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useSessionList must be used within AgentServiceProvider');
  }

  const { state, dispatch, restClient } = context;

  const refresh = useCallback(async () => {
    try {
      const sessions = await restClient.listSessions();
      dispatch({ type: 'SESSIONS_LIST_UPDATED', sessions });
    } catch (error) {
      console.error('[useSessionList] Failed to refresh:', error);
      throw error;
    }
  }, [restClient, dispatch]);

  const getSession = useCallback(
    (sessionId: string) => {
      return state.sessionList.find((s) => s.sessionId === sessionId);
    },
    [state.sessionList]
  );

  return {
    sessions: state.sessionList,
    isLoading: !state.isInitialized,
    refresh,
    getSession,
  };
}
