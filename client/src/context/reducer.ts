/**
 * State Reducer for Agent Service Client
 *
 * Manages global state for all sessions including:
 * - Session list
 * - Conversation blocks
 * - Streaming state (separate from finalized blocks)
 * - Workspace files
 * - Subagent conversations
 * - Metadata (tokens, cost)
 */

import type {
  SessionListItem,
  SessionRuntimeState,
  RuntimeSessionData,
  ConversationBlock,
  WorkspaceFile,
  SessionMetadata,
  StreamingContent,
  SubagentState,
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
  /** Session info including runtime state */
  info: SessionListItem;

  /** Finalized conversation blocks (main transcript) */
  blocks: ConversationBlock[];

  /** Active streaming state keyed by conversationId ('main' or subagentId) */
  streaming: Map<string, StreamingContent>;

  /** Session-level metadata (tokens, cost, model) */
  metadata: SessionMetadata;

  /** Workspace files tracked by the session */
  files: WorkspaceFile[];

  /** Subagent conversations keyed by subagentId */
  subagents: Map<string, SubagentState>;

  /** Loading state for async operations */
  isLoading: boolean;
}

export interface AgentServiceState {
  /** Full session data indexed by sessionId */
  sessions: Map<string, SessionState>;

  /** Lightweight session list for UI (session picker, etc.) */
  sessionList: SessionListItem[];

  /** Whether initial data has been loaded */
  isInitialized: boolean;

  /** Debug event log (newest first) */
  eventLog: DebugEvent[];
}

// ============================================================================
// Action Types
// ============================================================================

export type AgentServiceAction =
  // Initialization
  | { type: 'INITIALIZE'; sessions: SessionListItem[] }

  // Session List
  | { type: 'SESSIONS_LIST_UPDATED'; sessions: SessionListItem[] }

  // Session CRUD
  | { type: 'SESSION_CREATED'; session: SessionListItem }
  | { type: 'SESSION_LOADED'; sessionId: string; data: RuntimeSessionData }
  | { type: 'SESSION_DESTROYED'; sessionId: string }

  // Session Runtime
  | { type: 'SESSION_RUNTIME_UPDATED'; sessionId: string; runtime: SessionRuntimeState }

  // Streaming Events
  | {
      type: 'STREAM_STARTED';
      sessionId: string;
      conversationId: string;
      block: ConversationBlock;
    }
  | {
      type: 'STREAM_DELTA';
      sessionId: string;
      conversationId: string;
      blockId: string;
      delta: string;
    }
  | {
      type: 'STREAM_COMPLETED';
      sessionId: string;
      conversationId: string;
      blockId: string;
      block: ConversationBlock;
    }

  // Block Updates (non-streaming metadata changes)
  | {
      type: 'BLOCK_UPDATED';
      sessionId: string;
      conversationId: string;
      blockId: string;
      updates: Partial<ConversationBlock>;
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
      // Also update runtime state in loaded sessions
      const sessions = new Map(state.sessions);
      for (const sessionInfo of action.sessions) {
        const existing = sessions.get(sessionInfo.sessionId);
        if (existing) {
          sessions.set(sessionInfo.sessionId, {
            ...existing,
            info: sessionInfo,
          });
        }
      }

      return {
        ...state,
        sessionList: action.sessions,
        sessions,
      };
    }

    case 'SESSION_CREATED': {
      // Check if session already exists (race condition with SESSIONS_LIST_UPDATED)
      const exists = state.sessionList.some(s => s.sessionId === action.session.sessionId);

      const newSessionList = exists
        ? state.sessionList.map(s =>
            s.sessionId === action.session.sessionId ? action.session : s
          )
        : [...state.sessionList, action.session];

      // Initialize session state
      const sessions = new Map(state.sessions);
      const existingSession = sessions.get(action.session.sessionId);
      sessions.set(action.session.sessionId, {
        info: action.session,
        blocks: existingSession?.blocks ?? [],
        streaming: existingSession?.streaming ?? new Map(),
        metadata: existingSession?.metadata ?? {},
        files: existingSession?.files ?? [],
        subagents: existingSession?.subagents ?? new Map(),
        isLoading: existingSession?.isLoading ?? false,
      });

      return {
        ...state,
        sessionList: newSessionList,
        sessions,
      };
    }

    case 'SESSION_LOADED': {
      const sessions = new Map(state.sessions);

      // Convert subagents array to Map
      const subagentsMap = new Map<string, SubagentState>(
        action.data.subagents.map((sub) => [
          sub.id,
          {
            id: sub.id,
            blocks: sub.blocks,
            metadata: {},
            status: 'running' as const,
          },
        ])
      );

      sessions.set(action.sessionId, {
        info: action.data,
        blocks: action.data.blocks,
        streaming: new Map(),
        metadata: {},
        files: action.data.workspaceFiles,
        subagents: subagentsMap,
        isLoading: false,
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
      };
    }

    case 'SESSION_RUNTIME_UPDATED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (session) {
        sessions.set(action.sessionId, {
          ...session,
          info: {
            ...session.info,
            runtime: action.runtime,
          },
        });
      }

      return {
        ...state,
        sessions,
        sessionList: state.sessionList.map((s) =>
          s.sessionId === action.sessionId
            ? { ...s, runtime: action.runtime }
            : s
        ),
      };
    }

    case 'STREAM_STARTED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      // Add/update streaming entry keyed by conversationId
      // Don't add shell block to blocks - just track streaming content
      const streaming = new Map(session.streaming);
      streaming.set(action.conversationId, {
        conversationId: action.conversationId,
        content: '',
        startedAt: Date.now(),
      });

      sessions.set(action.sessionId, {
        ...session,
        streaming,
      });

      return { ...state, sessions };
    }

    case 'STREAM_DELTA': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      // Lookup streaming content by conversationId (not blockId)
      const streamingContent = session.streaming.get(action.conversationId);
      if (!streamingContent) return state;

      const streaming = new Map(session.streaming);
      streaming.set(action.conversationId, {
        ...streamingContent,
        content: streamingContent.content + action.delta,
      });

      sessions.set(action.sessionId, {
        ...session,
        streaming,
      });

      return { ...state, sessions };
    }

    case 'STREAM_COMPLETED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const conversationId = action.conversationId;
      if (!conversationId) return state;

      // Clear streaming for this conversation
      const streaming = new Map(session.streaming);
      streaming.delete(conversationId);

      if (conversationId === 'main') {
        // Append the finalized block (no shell block to replace)
        sessions.set(action.sessionId, {
          ...session,
          blocks: [...session.blocks, action.block],
          streaming,
        });
      } else {
        // Append to subagent
        const subagent = session.subagents.get(conversationId);
        if (subagent) {
          const newSubagents = new Map(session.subagents);
          newSubagents.set(conversationId, {
            ...subagent,
            blocks: [...subagent.blocks, action.block],
          });

          sessions.set(action.sessionId, {
            ...session,
            subagents: newSubagents,
            streaming,
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
