# Client Library Architecture

> `@hhopkins/agent-runtime-react`

This document describes the architecture of the React client library for the agent runtime.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AgentServiceProvider                               │
│                                                                              │
│  ┌─────────────┐   ┌───────────────────┐   ┌────────────────────────────┐   │
│  │ RestClient  │   │ WebSocketManager  │   │      useReducer            │   │
│  │             │   │                   │   │                            │   │
│  │ - REST API  │   │ - Event listeners │──▶│  AgentServiceState         │   │
│  │ - Sessions  │   │ - Room management │   │                            │   │
│  │ - Messages  │   │                   │   └────────────────────────────┘   │
│  └─────────────┘   └───────────────────┘                                    │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   │ Context
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              React Hooks                                     │
│                                                                              │
│  useSessionList    useAgentSession    useMessages    useSubagents           │
│  useWorkspaceFiles useEvents                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## State Shape

```typescript
interface AgentServiceState {
  /**
   * Lightweight session list for UI (session picker, etc.)
   * Contains runtime state but not full conversation data
   */
  sessionList: SessionListItem[];

  /**
   * Full session data indexed by sessionId
   * Only populated for sessions that have been loaded
   */
  sessions: Map<string, SessionState>;

  /**
   * Whether initial data has been loaded
   */
  isInitialized: boolean;

  /**
   * Debug event log (newest first)
   */
  eventLog: DebugEvent[];
}

interface SessionState {
  /**
   * Session info including runtime state
   */
  info: SessionListItem;

  /**
   * Finalized conversation blocks (main transcript)
   */
  blocks: ConversationBlock[];

  /**
   * Active streaming state for in-progress blocks
   * Keyed by blockId
   */
  streaming: Map<string, StreamingBlock>;

  /**
   * Workspace files tracked by the session
   */
  files: WorkspaceFile[];

  /**
   * Subagent conversations
   * Keyed by subagentId
   */
  subagents: Map<string, SubagentState>;

  /**
   * Session-level metadata (tokens, cost, model)
   */
  metadata: SessionMetadata;
}

interface StreamingBlock {
  blockId: string;
  conversationId: 'main' | string;  // 'main' or subagentId
  content: string;                   // Accumulated deltas
  startedAt: number;
}

interface SubagentState {
  id: string;
  blocks: ConversationBlock[];
  status: 'running' | 'completed' | 'failed';
  metadata: SessionMetadata;
}
```

**Note:** There is no `activeSessionId` in state. That is a UI concern - consuming apps track which session is selected themselves.

---

## Streaming Design

Streaming content is kept separate from finalized blocks to avoid race conditions and provide clean separation.

### Flow

```
session:block:start
    │
    ▼
┌─────────────────────────────────────────────┐
│ 1. Add shell block to session.blocks       │
│ 2. Add entry to session.streaming Map      │
└─────────────────────────────────────────────┘
    │
    ▼
session:block:delta (repeats)
    │
    ▼
┌─────────────────────────────────────────────┐
│ Append delta to streaming entry content    │
│ (blocks[] unchanged)                        │
└─────────────────────────────────────────────┘
    │
    ▼
session:block:complete
    │
    ▼
┌─────────────────────────────────────────────┐
│ 1. Remove from session.streaming           │
│ 2. Replace shell block with final block    │
└─────────────────────────────────────────────┘
```

### UI Merging

Hooks merge streaming content for consumers:

```typescript
// Inside useMessages
const mergedBlocks = useMemo(() => {
  return session.blocks.map(block => {
    const stream = session.streaming.get(block.id);
    if (stream && (block.type === 'assistant_text' || block.type === 'thinking')) {
      return { ...block, content: stream.content };
    }
    return block;
  });
}, [session.blocks, session.streaming]);
```

### Streamable Block Types

| Block Type | Streams content? | Notes |
|------------|------------------|-------|
| `assistant_text` | Yes | Main assistant responses |
| `thinking` | Yes | Extended thinking |
| `tool_use` | No | Gets `block:update` for status changes |
| `tool_result` | No | Arrives complete |
| `user_message` | No | Arrives complete |
| `system` | No | Arrives complete |
| `subagent` | No | Gets `block:update` for status changes |

---

## Hooks

All hooks read from context state. Session-scoped hooks require a `sessionId` parameter.

### useSessionList

```typescript
function useSessionList(): {
  sessions: SessionListItem[];
  isLoading: boolean;
}
```

Global list of all sessions with their runtime state.

### useAgentSession

```typescript
function useAgentSession(sessionId?: string): {
  session: SessionState | null;
  runtime: SessionRuntimeState | null;
  isLoading: boolean;
  error: Error | null;

  createSession: (agentProfileRef: string, architecture: AGENT_ARCHITECTURE_TYPE) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  destroySession: () => Promise<void>;
  syncSession: () => Promise<void>;
}
```

Session lifecycle management. Auto-joins WebSocket room when sessionId is provided.

### useMessages

```typescript
function useMessages(sessionId: string): {
  blocks: ConversationBlock[];        // Pre-merged with streaming content
  streamingBlockIds: Set<string>;     // Which blocks are currently streaming
  isStreaming: boolean;               // streamingBlockIds.size > 0
  metadata: SessionMetadata;
  error: Error | null;

  sendMessage: (content: string) => Promise<void>;
}
```

Main conversation access. Blocks are pre-merged with streaming content.

### useWorkspaceFiles

```typescript
function useWorkspaceFiles(sessionId: string): {
  files: WorkspaceFile[];
}
```

Workspace files for the session.

### useSubagents

```typescript
function useSubagents(sessionId: string): {
  subagents: Map<string, SubagentState>;
  getSubagentBlocks: (subagentId: string) => ConversationBlock[];  // Pre-merged
}
```

Subagent conversations. Blocks are pre-merged with streaming content.

### useEvents

```typescript
function useEvents(): {
  events: DebugEvent[];
  clearEvents: () => void;
}
```

Debug event log for all WebSocket events.

---

## WebSocket Events → Actions

| WebSocket Event | Action Type | Handler |
|-----------------|-------------|---------|
| `sessions:list` | `SESSIONS_LIST_UPDATED` | Replace sessionList |
| `session:status` | `SESSION_RUNTIME_UPDATED` | Update session.info.runtime |
| `session:block:start` | `STREAM_STARTED` | Add shell block + streaming entry |
| `session:block:delta` | `STREAM_DELTA` | Append to streaming entry |
| `session:block:update` | `BLOCK_UPDATED` | Patch block metadata |
| `session:block:complete` | `STREAM_COMPLETED` | Remove streaming, replace block |
| `session:metadata:update` | `METADATA_UPDATED` | Update session/subagent metadata |
| `session:subagent:discovered` | `SUBAGENT_DISCOVERED` | Add subagent with blocks |
| `session:subagent:completed` | `SUBAGENT_COMPLETED` | Update subagent status |
| `session:file:created` | `FILE_CREATED` | Add file |
| `session:file:modified` | `FILE_MODIFIED` | Update file |
| `session:file:deleted` | `FILE_DELETED` | Remove file |
| `error` | (logged) | Log to eventLog |

---

## Types

### From Backend (`@hhopkins/agent-runtime/types`)

```typescript
// Session types
type AGENT_ARCHITECTURE_TYPE = 'claude-agent-sdk' | 'gemini-cli';
type SandboxStatus = 'starting' | 'ready' | 'unhealthy' | 'terminated';

interface SessionRuntimeState {
  isLoaded: boolean;
  sandbox: {
    sandboxId: string;
    status: SandboxStatus;
    restartCount: number;
    lastHealthCheck: number;
  } | null;
}

interface SessionListItem {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;
  agentProfileReference: string;
  name?: string;
  lastActivity?: number;
  createdAt?: number;
  metadata?: Record<string, unknown>;
  runtime: SessionRuntimeState;
}

interface RuntimeSessionData extends SessionListItem {
  blocks: ConversationBlock[];
  workspaceFiles: WorkspaceFile[];
  subagents: { id: string; blocks: ConversationBlock[] }[];
}

// Block types
type ConversationBlock =
  | UserMessageBlock
  | AssistantTextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | SystemBlock
  | SubagentBlock;

// WebSocket events
interface ServerToClientEvents { ... }
interface ClientToServerEvents { ... }
```

### Client-Specific Types

```typescript
interface SessionMetadata {
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    thinkingTokens?: number;
    totalTokens: number;
  };
  costUSD?: number;
  model?: string;
  [key: string]: unknown;
}

interface DebugEvent {
  id: string;
  timestamp: number;
  eventName: string;
  payload: unknown;
}

interface AgentServiceConfig {
  apiUrl: string;
  wsUrl: string;
  apiKey: string;
  debug?: boolean;
}
```

---

## Action Types

```typescript
type AgentServiceAction =
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

  // Streaming
  | { type: 'STREAM_STARTED'; sessionId: string; conversationId: string; block: ConversationBlock }
  | { type: 'STREAM_DELTA'; sessionId: string; blockId: string; delta: string }
  | { type: 'STREAM_COMPLETED'; sessionId: string; blockId: string; block: ConversationBlock }

  // Block Updates (non-streaming)
  | { type: 'BLOCK_UPDATED'; sessionId: string; conversationId: string; blockId: string; updates: Partial<ConversationBlock> }

  // Metadata
  | { type: 'METADATA_UPDATED'; sessionId: string; conversationId: string; metadata: SessionMetadata }

  // Subagents
  | { type: 'SUBAGENT_DISCOVERED'; sessionId: string; subagent: { id: string; blocks: ConversationBlock[] } }
  | { type: 'SUBAGENT_COMPLETED'; sessionId: string; subagentId: string; status: 'completed' | 'failed' }

  // Files
  | { type: 'FILE_CREATED'; sessionId: string; file: WorkspaceFile }
  | { type: 'FILE_MODIFIED'; sessionId: string; file: WorkspaceFile }
  | { type: 'FILE_DELETED'; sessionId: string; path: string }

  // Debug
  | { type: 'EVENT_LOGGED'; eventName: string; payload: unknown }
  | { type: 'EVENTS_CLEARED' };
```

---

## File Structure

```
client/src/
├── index.ts                 # Public exports
├── types/
│   └── index.ts             # Type definitions + re-exports from backend
├── client/
│   ├── rest.ts              # REST API client
│   └── websocket.ts         # WebSocket manager
├── context/
│   ├── AgentServiceContext.tsx    # React context
│   ├── AgentServiceProvider.tsx   # Provider with WS event wiring
│   └── reducer.ts                 # State reducer
└── hooks/
    ├── useAgentSession.ts
    ├── useMessages.ts
    ├── useSessionList.ts
    ├── useWorkspaceFiles.ts
    ├── useSubagents.ts
    └── useEvents.ts
```
