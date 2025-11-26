/**
 * useEvents Hook
 *
 * Access debug event log for all WebSocket events.
 * Useful for debugging and monitoring the event stream.
 */

import { useContext, useCallback } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { DebugEvent } from '../context/reducer';

export interface UseEventsResult {
  /**
   * Array of debug events (newest first)
   */
  events: DebugEvent[];

  /**
   * Clear all events from the log
   */
  clearEvents: () => void;
}

/**
 * Hook to access the debug event log
 *
 * @example
 * ```tsx
 * function DebugPanel() {
 *   const { events, clearEvents } = useEvents();
 *
 *   return (
 *     <div>
 *       <button onClick={clearEvents}>Clear</button>
 *       {events.map(event => (
 *         <div key={event.id}>
 *           [{new Date(event.timestamp).toISOString()}] {event.eventName}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEvents(): UseEventsResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useEvents must be used within AgentServiceProvider');
  }

  const { state, dispatch } = context;

  const clearEvents = useCallback(() => {
    dispatch({ type: 'EVENTS_CLEARED' });
  }, [dispatch]);

  return {
    events: state.eventLog,
    clearEvents,
  };
}
