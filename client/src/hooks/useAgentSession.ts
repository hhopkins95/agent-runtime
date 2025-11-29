/**
 * useAgentSession Hook
 *
 * Manage agent session lifecycle: create, load, destroy sessions.
 * Join WebSocket rooms to receive real-time updates for the session.
 */

import { useContext, useCallback, useState, useEffect, useMemo } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type {
  AGENT_ARCHITECTURE_TYPE,
  SessionRuntimeState,
} from '../types';
import type { SessionState } from '../context/reducer';

export interface UseAgentSessionResult {
  /**
   * Current session data (null if not loaded)
   */
  session: SessionState | null;

  /**
   * Session runtime state (null if not loaded)
   * Contains isLoaded and sandbox status
   */
  runtime: SessionRuntimeState | null;

  /**
   * Whether a session operation is in progress
   */
  isLoading: boolean;

  /**
   * Error from last operation
   */
  error: Error | null;

  /**
   * Create a new session
   */
  createSession: (
    agentProfileRef: string,
    architecture: AGENT_ARCHITECTURE_TYPE
  ) => Promise<string>;

  /**
   * Load an existing session
   */
  loadSession: (sessionId: string) => Promise<void>;

  /**
   * Destroy the session
   */
  destroySession: () => Promise<void>;

  /**
   * Manually sync session state to persistence
   */
  syncSession: () => Promise<void>;
}

/**
 * Hook to manage a single agent session
 *
 * @param sessionId - Optional session ID to auto-load on mount
 */
export function useAgentSession(sessionId?: string): UseAgentSessionResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useAgentSession must be used within AgentServiceProvider');
  }

  const { state, dispatch, restClient, wsManager } = context;

  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(
    sessionId
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get session from state
  const session = currentSessionId
    ? state.sessions.get(currentSessionId) ?? null
    : null;

  const runtime = session?.info.runtime ?? null;

  // Derive a stable boolean for whether the session is loaded
  // This prevents the effect from re-running on every state change
  const sessionLoaded = useMemo(
    () => currentSessionId ? state.sessions.has(currentSessionId) : false,
    [currentSessionId, state.sessions]
  );

  // Sync sessionId prop to currentSessionId state
  // This ensures room join/leave happens when the prop changes
  useEffect(() => {
    setCurrentSessionId(sessionId);
  }, [sessionId]);

  // Auto-load session data if not already in state
  useEffect(() => {
    if (currentSessionId && !state.sessions.has(currentSessionId)) {
      loadSessionById(currentSessionId);
    }
  }, [currentSessionId]);

  // Join/leave WebSocket room when session changes
  // Only join when session exists in state (not just when we have an ID)
  // This prevents a race condition where events arrive before the session is loaded
  useEffect(() => {
    if (currentSessionId && sessionLoaded) {
      wsManager.joinSession(currentSessionId).catch((err) => {
        console.error('[useAgentSession] Failed to join session room:', err);
      });

      return () => {
        wsManager.leaveSession(currentSessionId).catch((err) => {
          console.error('[useAgentSession] Failed to leave session room:', err);
        });
      };
    }
  }, [currentSessionId, sessionLoaded, wsManager]);

  const loadSessionById = async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await restClient.getSession(id);
      dispatch({ type: 'SESSION_LOADED', sessionId: id, data });
      setCurrentSessionId(id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const createSession = useCallback(
    async (
      agentProfileRef: string,
      architecture: AGENT_ARCHITECTURE_TYPE
    ): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await restClient.createSession(
          agentProfileRef,
          architecture
        );

        const newSession = {
          sessionId: response.sessionId,
          type: architecture,
          agentProfileReference: agentProfileRef,
          runtime: response.runtime,
          createdAt: response.createdAt,
        };

        dispatch({ type: 'SESSION_CREATED', session: newSession });
        setCurrentSessionId(response.sessionId);

        return response.sessionId;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [restClient, dispatch]
  );

  const loadSession = useCallback(
    async (id: string) => {
      await loadSessionById(id);
    },
    [restClient, dispatch]
  );

  const destroySession = useCallback(async () => {
    if (!currentSessionId) {
      throw new Error('No session to destroy');
    }

    setIsLoading(true);
    setError(null);

    try {
      await restClient.destroySession(currentSessionId);
      dispatch({ type: 'SESSION_DESTROYED', sessionId: currentSessionId });
      setCurrentSessionId(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [currentSessionId, restClient, dispatch]);

  const syncSession = useCallback(async () => {
    if (!currentSessionId) {
      throw new Error('No session to sync');
    }

    try {
      await restClient.syncSession(currentSessionId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [currentSessionId, restClient]);

  return {
    session,
    runtime,
    isLoading,
    error,
    createSession,
    loadSession,
    destroySession,
    syncSession,
  };
}
