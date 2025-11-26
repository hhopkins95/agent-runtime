/**
 * State Reducer for Agent Service Client
 *
 * Manages global state for all sessions including:
 * - Session list
 * - Conversation blocks
 * - Workspace files
 * - Subagent conversations
 * - Metadata (tokens, cost)
 */

import type {
  SessionListData,
  RuntimeSessionData,
  ConversationBlock,
  WorkspaceFile,
  SessionMetadata,
  SessionStatus,
} from '../types';

// ============================================================================
// Debug Event Types
// ============================================================================

export interface DebugEvent {
  id: string;
  timestamp: number;
  eventName: string;
  payload: unknown;
}

const MAX_EVENT_LOG_SIZE = 100;

// ============================================================================
// State Shape
// ============================================================================

export interface SessionState {
  // Session metadata
  info: SessionListData;

  // Main conversation
  blocks: ConversationBlock[];
  metadata: SessionMetadata;

  // Workspace files
  files: WorkspaceFile[];

  // Subagents
  subagents: Map<
    string,
    {
      id: string;
      blocks: ConversationBlock[];
      metadata: SessionMetadata;
      status?: 'running' | 'completed' | 'failed';
    }
  >;

  // Loading states
  isLoading: boolean;
  isStreaming: boolean;
}

export interface AgentServiceState {
  // All sessions indexed by sessionId
  sessions: Map<string, SessionState>;

  // Session list (lightweight)
  sessionList: SessionListData[];

  // Currently focused session
  activeSessionId: string | null;

  // Global loading state
  isInitialized: boolean;

  // Debug event log (newest first)
  eventLog: DebugEvent[];
}

// ============================================================================
// Action Types
// ============================================================================

export type AgentServiceAction =
  // Initialization
  | { type: 'INITIALIZE'; sessions: SessionListData[] }

  // Session List
  | { type: 'SESSIONS_LIST_UPDATED'; sessions: SessionListData[] }

  // Session CRUD
  | { type: 'SESSION_CREATED'; session: SessionListData }
  | { type: 'SESSION_LOADED'; sessionId: string; data: RuntimeSessionData }
  | { type: 'SESSION_DESTROYED'; sessionId: string }
  | { type: 'SET_ACTIVE_SESSION'; sessionId: string | null }

  // Session Status
  | { type: 'SESSION_STATUS_CHANGED'; sessionId: string; status: SessionStatus }

  // Block Events
  | {
      type: 'BLOCK_STARTED';
      sessionId: string;
      conversationId: string;
      block: ConversationBlock;
    }
  | {
      type: 'BLOCK_DELTA';
      sessionId: string;
      conversationId: string;
      blockId: string;
      delta: string;
    }
  | {
      type: 'BLOCK_UPDATED';
      sessionId: string;
      conversationId: string;
      blockId: string;
      updates: Partial<ConversationBlock>;
    }
  | {
      type: 'BLOCK_COMPLETED';
      sessionId: string;
      conversationId: string;
      blockId: string;
      block: ConversationBlock;
    }

  // Metadata
  | {
      type: 'METADATA_UPDATED';
      sessionId: string;
      conversationId: string;
      metadata: SessionMetadata;
    }

  // Subagent Events
  | {
      type: 'SUBAGENT_DISCOVERED';
      sessionId: string;
      subagent: { id: string; blocks: ConversationBlock[] };
    }
  | {
      type: 'SUBAGENT_COMPLETED';
      sessionId: string;
      subagentId: string;
      status: 'completed' | 'failed';
    }

  // File Events
  | { type: 'FILE_CREATED'; sessionId: string; file: WorkspaceFile }
  | { type: 'FILE_MODIFIED'; sessionId: string; file: WorkspaceFile }
  | { type: 'FILE_DELETED'; sessionId: string; path: string }

  // Debug Events
  | { type: 'EVENT_LOGGED'; eventName: string; payload: unknown }
  | { type: 'EVENTS_CLEARED' };

// ============================================================================
// Initial State
// ============================================================================

export const initialState: AgentServiceState = {
  sessions: new Map(),
  sessionList: [],
  activeSessionId: null,
  isInitialized: false,
  eventLog: [],
};

// ============================================================================
// Reducer
// ============================================================================

export function agentServiceReducer(
  state: AgentServiceState,
  action: AgentServiceAction
): AgentServiceState {
  switch (action.type) {
    case 'INITIALIZE': {
      return {
        ...state,
        sessionList: action.sessions,
        isInitialized: true,
      };
    }

    case 'SESSIONS_LIST_UPDATED': {
      return {
        ...state,
        sessionList: action.sessions,
      };
    }

    case 'SESSION_CREATED': {
      const newState = {
        ...state,
        sessionList: [...state.sessionList, action.session],
      };

      // Initialize session state
      const sessions = new Map(state.sessions);
      sessions.set(action.session.sessionId, {
        info: action.session,
        blocks: [],
        metadata: {},
        files: [],
        subagents: new Map(),
        isLoading: false,
        isStreaming: false,
      });

      newState.sessions = sessions;
      return newState;
    }

    case 'SESSION_LOADED': {
      const sessions = new Map(state.sessions);
      const existing = sessions.get(action.sessionId);

      // Convert subagents array to Map
      const subagentsMap = new Map(
        action.data.subagents.map((sub) => [
          sub.id,
          {
            id: sub.id,
            blocks: sub.blocks,
            metadata: {},
          },
        ])
      );

      sessions.set(action.sessionId, {
        info: action.data,
        blocks: action.data.blocks,
        metadata: {},
        files: action.data.workspaceFiles,
        subagents: subagentsMap,
        isLoading: false,
        isStreaming: existing?.isStreaming ?? false,
      });

      return {
        ...state,
        sessions,
      };
    }

    case 'SESSION_DESTROYED': {
      const sessions = new Map(state.sessions);
      sessions.delete(action.sessionId);

      return {
        ...state,
        sessions,
        sessionList: state.sessionList.filter(
          (s) => s.sessionId !== action.sessionId
        ),
        activeSessionId:
          state.activeSessionId === action.sessionId
            ? null
            : state.activeSessionId,
      };
    }

    case 'SET_ACTIVE_SESSION': {
      return {
        ...state,
        activeSessionId: action.sessionId,
      };
    }

    case 'SESSION_STATUS_CHANGED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (session) {
        sessions.set(action.sessionId, {
          ...session,
          info: {
            ...session.info,
            status: action.status,
          },
        });
      }

      return {
        ...state,
        sessions,
        sessionList: state.sessionList.map((s) =>
          s.sessionId === action.sessionId
            ? { ...s, status: action.status }
            : s
        ),
      };
    }

    case 'BLOCK_STARTED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      if (action.conversationId === 'main') {
        // Main conversation
        sessions.set(action.sessionId, {
          ...session,
          blocks: [...session.blocks, action.block],
          isStreaming: true,
        });
      } else {
        // Subagent conversation
        const subagent = session.subagents.get(action.conversationId);
        if (subagent) {
          const newSubagents = new Map(session.subagents);
          newSubagents.set(action.conversationId, {
            ...subagent,
            blocks: [...subagent.blocks, action.block],
          });

          sessions.set(action.sessionId, {
            ...session,
            subagents: newSubagents,
            isStreaming: true,
          });
        }
      }

      return { ...state, sessions };
    }

    case 'BLOCK_DELTA': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const updateBlocks = (blocks: ConversationBlock[]): ConversationBlock[] =>
        blocks.map((block) => {
          if (block.id === action.blockId) {
            // Only update text content for assistant_text and thinking blocks
            if (block.type === 'assistant_text') {
              return {
                ...block,
                content: block.content + action.delta,
              };
            }
            if (block.type === 'thinking') {
              return {
                ...block,
                content: block.content + action.delta,
              };
            }
          }
          return block;
        });

      if (action.conversationId === 'main') {
        sessions.set(action.sessionId, {
          ...session,
          blocks: updateBlocks(session.blocks),
        });
      } else {
        const subagent = session.subagents.get(action.conversationId);
        if (subagent) {
          const newSubagents = new Map(session.subagents);
          newSubagents.set(action.conversationId, {
            ...subagent,
            blocks: updateBlocks(subagent.blocks),
          });

          sessions.set(action.sessionId, {
            ...session,
            subagents: newSubagents,
          });
        }
      }

      return { ...state, sessions };
    }

    case 'BLOCK_UPDATED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const updateBlocks = (blocks: ConversationBlock[]): ConversationBlock[] =>
        blocks.map((block) =>
          block.id === action.blockId ? { ...block, ...action.updates } as ConversationBlock : block
        );

      if (action.conversationId === 'main') {
        sessions.set(action.sessionId, {
          ...session,
          blocks: updateBlocks(session.blocks),
        });
      } else {
        const subagent = session.subagents.get(action.conversationId);
        if (subagent) {
          const newSubagents = new Map(session.subagents);
          newSubagents.set(action.conversationId, {
            ...subagent,
            blocks: updateBlocks(subagent.blocks),
          });

          sessions.set(action.sessionId, {
            ...session,
            subagents: newSubagents,
          });
        }
      }

      return { ...state, sessions };
    }

    case 'BLOCK_COMPLETED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const updateBlocks = (blocks: ConversationBlock[]) =>
        blocks.map((block) =>
          block.id === action.blockId ? action.block : block
        );

      if (action.conversationId === 'main') {
        sessions.set(action.sessionId, {
          ...session,
          blocks: updateBlocks(session.blocks),
          isStreaming: false,
        });
      } else {
        const subagent = session.subagents.get(action.conversationId);
        if (subagent) {
          const newSubagents = new Map(session.subagents);
          newSubagents.set(action.conversationId, {
            ...subagent,
            blocks: updateBlocks(subagent.blocks),
          });

          sessions.set(action.sessionId, {
            ...session,
            subagents: newSubagents,
            isStreaming: false,
          });
        }
      }

      return { ...state, sessions };
    }

    case 'METADATA_UPDATED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      if (action.conversationId === 'main') {
        sessions.set(action.sessionId, {
          ...session,
          metadata: { ...session.metadata, ...action.metadata },
        });
      } else {
        const subagent = session.subagents.get(action.conversationId);
        if (subagent) {
          const newSubagents = new Map(session.subagents);
          newSubagents.set(action.conversationId, {
            ...subagent,
            metadata: { ...subagent.metadata, ...action.metadata },
          });

          sessions.set(action.sessionId, {
            ...session,
            subagents: newSubagents,
          });
        }
      }

      return { ...state, sessions };
    }

    case 'SUBAGENT_DISCOVERED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const newSubagents = new Map(session.subagents);
      newSubagents.set(action.subagent.id, {
        id: action.subagent.id,
        blocks: action.subagent.blocks,
        metadata: {},
        status: 'running',
      });

      sessions.set(action.sessionId, {
        ...session,
        subagents: newSubagents,
      });

      return { ...state, sessions };
    }

    case 'SUBAGENT_COMPLETED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const subagent = session.subagents.get(action.subagentId);
      if (subagent) {
        const newSubagents = new Map(session.subagents);
        newSubagents.set(action.subagentId, {
          ...subagent,
          status: action.status,
        });

        sessions.set(action.sessionId, {
          ...session,
          subagents: newSubagents,
        });
      }

      return { ...state, sessions };
    }

    case 'FILE_CREATED':
    case 'FILE_MODIFIED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const existingIndex = session.files.findIndex(
        (f) => f.path === action.file.path
      );

      const newFiles = [...session.files];
      if (existingIndex >= 0) {
        newFiles[existingIndex] = action.file;
      } else {
        newFiles.push(action.file);
      }

      sessions.set(action.sessionId, {
        ...session,
        files: newFiles,
      });

      return { ...state, sessions };
    }

    case 'FILE_DELETED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      sessions.set(action.sessionId, {
        ...session,
        files: session.files.filter((f) => f.path !== action.path),
      });

      return { ...state, sessions };
    }

    case 'EVENT_LOGGED': {
      const newEvent: DebugEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        eventName: action.eventName,
        payload: action.payload,
      };

      // Prepend new event, keep only the most recent MAX_EVENT_LOG_SIZE
      const newEventLog = [newEvent, ...state.eventLog].slice(
        0,
        MAX_EVENT_LOG_SIZE
      );

      return {
        ...state,
        eventLog: newEventLog,
      };
    }

    case 'EVENTS_CLEARED': {
      return {
        ...state,
        eventLog: [],
      };
    }

    default:
      return state;
  }
}
