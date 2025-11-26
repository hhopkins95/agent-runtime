/**
 * Agent Service Provider Component
 *
 * Root provider that manages WebSocket connection, REST client,
 * and global state for all agent sessions.
 */

import { useEffect, useReducer, useRef, type ReactNode } from 'react';
import { RestClient } from '../client/rest';
import { WebSocketManager } from '../client/websocket';
import { AgentServiceContext } from './AgentServiceContext';
import { agentServiceReducer, initialState } from './reducer';

interface AgentServiceProviderProps {
  /**
   * Base URL for REST API (e.g., "http://localhost:3002")
   */
  apiUrl: string;

  /**
   * WebSocket server URL (e.g., "http://localhost:3003")
   */
  wsUrl: string;

  /**
   * API key for authentication
   */
  apiKey: string;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Child components
   */
  children: ReactNode;
}

export function AgentServiceProvider({
  apiUrl,
  wsUrl,
  apiKey,
  debug = false,
  children,
}: AgentServiceProviderProps) {
  const [state, dispatch] = useReducer(agentServiceReducer, initialState);

  // Client instances (stable references)
  const restClientRef = useRef<RestClient | null>(null);
  const wsManagerRef = useRef<WebSocketManager | null>(null);

  // Initialize clients
  if (!restClientRef.current) {
    restClientRef.current = new RestClient(apiUrl, apiKey, debug);
  }
  if (!wsManagerRef.current) {
    wsManagerRef.current = new WebSocketManager(wsUrl, debug);
  }

  const restClient = restClientRef.current;
  const wsManager = wsManagerRef.current;

  // Initialize: Connect WebSocket and load session list
  useEffect(() => {
    // Connect WebSocket immediately (before any async operations)
    // This ensures the socket exists when event listeners are registered
    wsManager.connect();

    async function loadInitialData() {
      try {
        // Load initial session list
        const sessions = await restClient.listSessions();
        dispatch({ type: 'INITIALIZE', sessions });
      } catch (error) {
        console.error('[AgentServiceProvider] Initialization failed:', error);
      }
    }

    loadInitialData();

    return () => {
      // Cleanup on unmount
      wsManager.disconnect();
    };
  }, []);

  // Set up WebSocket event listeners
  useEffect(() => {
    // Helper to log events when debug mode is enabled
    const logEvent = (event: string, data: unknown) => {
      if (debug) {
        console.log(`[WS Event] ${event}`, data);
      }
    };

    // Global Events
    wsManager.on('sessions:list', (sessions) => {
      logEvent('sessions:list', { count: sessions.length });
      dispatch({ type: 'EVENT_LOGGED', eventName: 'sessions:list', payload: { count: sessions.length } });
      dispatch({ type: 'SESSIONS_LIST_UPDATED', sessions });
    });

    // Block Streaming Events
    wsManager.on('session:block:start', (data) => {
      logEvent('session:block:start', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:block:start', payload: data });
      dispatch({
        type: 'BLOCK_STARTED',
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        block: data.block,
      });
    });

    wsManager.on('session:block:delta', (data) => {
      // Don't log full delta to avoid spam, just note it happened
      if (debug) {
        console.log(`[WS Event] session:block:delta (blockId: ${data.blockId}, +${data.delta.length} chars)`);
      }
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:block:delta', payload: { ...data, delta: `[${data.delta.length} chars]` } });
      dispatch({
        type: 'BLOCK_DELTA',
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        delta: data.delta,
      });
    });

    wsManager.on('session:block:update', (data) => {
      logEvent('session:block:update', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:block:update', payload: data });
      dispatch({
        type: 'BLOCK_UPDATED',
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        updates: data.updates,
      });
    });

    wsManager.on('session:block:complete', (data) => {
      logEvent('session:block:complete', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:block:complete', payload: data });
      dispatch({
        type: 'BLOCK_COMPLETED',
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        block: data.block,
      });
    });

    wsManager.on('session:metadata:update', (data) => {
      logEvent('session:metadata:update', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:metadata:update', payload: data });
      dispatch({
        type: 'METADATA_UPDATED',
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        metadata: data.metadata,
      });
    });

    // Subagent Events
    wsManager.on('session:subagent:discovered', (data) => {
      logEvent('session:subagent:discovered', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:subagent:discovered', payload: data });
      dispatch({
        type: 'SUBAGENT_DISCOVERED',
        sessionId: data.sessionId,
        subagent: data.subagent,
      });
    });

    wsManager.on('session:subagent:completed', (data) => {
      logEvent('session:subagent:completed', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:subagent:completed', payload: data });
      dispatch({
        type: 'SUBAGENT_COMPLETED',
        sessionId: data.sessionId,
        subagentId: data.subagentId,
        status: data.status,
      });
    });

    // File Events
    wsManager.on('session:file:created', (data) => {
      logEvent('session:file:created', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:file:created', payload: { sessionId: data.sessionId, path: data.file.path } });
      dispatch({
        type: 'FILE_CREATED',
        sessionId: data.sessionId,
        file: data.file,
      });
    });

    wsManager.on('session:file:modified', (data) => {
      logEvent('session:file:modified', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:file:modified', payload: { sessionId: data.sessionId, path: data.file.path } });
      dispatch({
        type: 'FILE_MODIFIED',
        sessionId: data.sessionId,
        file: data.file,
      });
    });

    wsManager.on('session:file:deleted', (data) => {
      logEvent('session:file:deleted', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:file:deleted', payload: data });
      dispatch({
        type: 'FILE_DELETED',
        sessionId: data.sessionId,
        path: data.path,
      });
    });

    // Session Status Events
    wsManager.on('session:status', (data) => {
      logEvent('session:status', data);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'session:status', payload: data });
      dispatch({
        type: 'SESSION_STATUS_CHANGED',
        sessionId: data.sessionId,
        status: data.status,
      });
    });

    // Error Events
    wsManager.on('error', (error) => {
      console.error('[AgentService] WebSocket error:', error);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'error', payload: error });
    });

    // Cleanup: Remove all listeners on unmount
    return () => {
      wsManager.removeAllListeners();
    };
  }, [wsManager, debug]);

  const contextValue = {
    state,
    dispatch,
    restClient,
    wsManager,
  };

  return (
    <AgentServiceContext.Provider value={contextValue}>
      {children}
    </AgentServiceContext.Provider>
  );
}
