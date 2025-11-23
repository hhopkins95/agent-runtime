/**
 * Agent Service Context
 *
 * Provides global state and client instances to the React component tree.
 */

import { createContext } from 'react';
import type { AgentServiceState, AgentServiceAction } from './reducer';
import type { RestClient } from '../client/rest';
import type { WebSocketManager } from '../client/websocket';

export interface AgentServiceContextValue {
  /**
   * Global state
   */
  state: AgentServiceState;

  /**
   * Dispatch function for state updates
   */
  dispatch: React.Dispatch<AgentServiceAction>;

  /**
   * REST API client instance
   */
  restClient: RestClient;

  /**
   * WebSocket manager instance
   */
  wsManager: WebSocketManager;
}

export const AgentServiceContext = createContext<
  AgentServiceContextValue | undefined
>(undefined);
