# React Client Types Reference

## Provider Props

```typescript
interface AgentServiceProviderProps {
  /** Base URL for REST API (e.g., "http://localhost:3001") */
  apiUrl: string;

  /** WebSocket server URL (e.g., "http://localhost:3001") */
  wsUrl: string;

  /** API key for authentication */
  apiKey: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Child components */
  children: ReactNode;
}
```

## Hook Return Types

### useAgentSession

```typescript
interface UseAgentSessionResult {
  /** Current session data (null if not loaded) */
  session: SessionState | null;

  /** Session runtime state (sandbox status) */
  runtime: SessionRuntimeState | null;

  /** Whether a session operation is in progress */
  isLoading: boolean;

  /** Error from last operation */
  error: Error | null;

  /** Create a new session */
  createSession: (
    agentProfileRef: string,
    architecture: AGENT_ARCHITECTURE_TYPE,
    sessionOptions?: AgentArchitectureSessionOptions
  ) => Promise<string>;

  /** Load an existing session */
  loadSession: (sessionId: string) => Promise<void>;

  /** Destroy the session */
  destroySession: () => Promise<void>;

  /** Manually sync session state to persistence */
  syncSession: () => Promise<void>;

  /** Update session options */
  updateSessionOptions: (
    sessionOptions: AgentArchitectureSessionOptions
  ) => Promise<void>;
}
```

### useMessages

```typescript
interface UseMessagesResult {
  /** Conversation blocks, pre-merged with streaming content */
  blocks: ConversationBlock[];

  /** Set of block IDs currently streaming */
  streamingBlockIds: Set<string>;

  /** Whether any block is currently streaming */
  isStreaming: boolean;

  /** Session metadata (tokens, cost, model) */
  metadata: SessionMetadata;

  /** Error from last message send */
  error: Error | null;

  /** Send a message to the agent */
  sendMessage: (content: string) => Promise<void>;

  /** Get a specific block by ID */
  getBlock: (blockId: string) => ConversationBlock | undefined;

  /** Get all blocks of a specific type */
  getBlocksByType: <T extends ConversationBlock["type"]>(
    type: T
  ) => Extract<ConversationBlock, { type: T }>[];
}
```

### useSessionList

```typescript
interface UseSessionListResult {
  /** All sessions */
  sessions: SessionListItem[];

  /** Loading state */
  isLoading: boolean;

  /** Error state */
  error: Error | null;

  /** Refresh session list */
  refresh: () => Promise<void>;
}

interface SessionListItem {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;
  agentProfileReference: string;
  createdAt: string;
}
```

### useWorkspaceFiles

```typescript
interface UseWorkspaceFilesResult {
  /** All workspace files */
  files: WorkspaceFile[];

  /** Get file by path */
  getFile: (path: string) => WorkspaceFile | undefined;
}
```

### useSubagents

```typescript
interface UseSubagentsResult {
  /** All subagents */
  subagents: SubagentInfo[];

  /** Get subagent by ID */
  getSubagent: (id: string) => SubagentInfo | undefined;
}

interface SubagentInfo {
  id: string;
  name: string;
  status: "running" | "completed" | "error";
  blocks?: ConversationBlock[];
}
```

### useEvents

```typescript
interface UseEventsResult {
  /** Debug event log */
  events: DebugEvent[];

  /** Clear all events */
  clearEvents: () => void;
}

interface DebugEvent {
  timestamp: number;
  eventName: string;
  payload: unknown;
}
```

## State Types

```typescript
interface SessionState {
  /** Session info (from server) */
  info: {
    sessionId: string;
    type: AGENT_ARCHITECTURE_TYPE;
    agentProfileReference: string;
    createdAt: string;
    sessionOptions?: AgentArchitectureSessionOptions;
    runtime: SessionRuntimeState;
  };

  /** Conversation blocks */
  blocks: ConversationBlock[];

  /** Streaming state by conversation ID */
  streaming: Map<string, StreamingState>;

  /** Workspace files */
  files: WorkspaceFile[];

  /** Subagents */
  subagents: SubagentInfo[];

  /** Session metadata */
  metadata: SessionMetadata;
}

interface StreamingState {
  blockId: string;
  content: string;
}

interface SessionMetadata {
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCost?: number;
  model?: string;
}

interface SessionRuntimeState {
  isLoaded: boolean;
  sandbox: {
    status: "pending" | "creating" | "running" | "terminated" | "error";
    sandboxId?: string;
    error?: string;
  };
}
```

## Block Types

```typescript
type ConversationBlock =
  | UserMessageBlock
  | AssistantTextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | SystemBlock
  | SubagentBlock
  | ErrorBlock;

interface UserMessageBlock {
  type: "user_message";
  id: string;
  timestamp: string;
  content: string;
}

interface AssistantTextBlock {
  type: "assistant_text";
  id: string;
  timestamp: string;
  content: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  timestamp: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: "tool_result";
  id: string;
  timestamp: string;
  toolUseId: string;
  content: string;
  isError?: boolean;
}

interface ThinkingBlock {
  type: "thinking";
  id: string;
  timestamp: string;
  content: string;
}

interface SystemBlock {
  type: "system";
  id: string;
  timestamp: string;
  content: string;
}

interface SubagentBlock {
  type: "subagent";
  id: string;
  timestamp: string;
  subagentId: string;
  name: string;
  status: "running" | "completed" | "error";
}

interface ErrorBlock {
  type: "error";
  id: string;
  timestamp: string;
  message: string;
  code?: string;
}
```

## Session Options

```typescript
type AGENT_ARCHITECTURE_TYPE = "claude-agent-sdk" | "opencode";

interface AgentArchitectureSessionOptions {
  /** Model to use (e.g., "sonnet", "opus", "haiku") */
  model?: string;

  /** Additional options specific to architecture */
  [key: string]: unknown;
}
```

## WebSocket Events (Client-side)

The WebSocket manager emits these events:

```typescript
// Subscribe to events
wsManager.on("session:block:start", (data: BlockStartEvent) => {});
wsManager.on("session:block:delta", (data: BlockDeltaEvent) => {});
wsManager.on("session:block:update", (data: BlockUpdateEvent) => {});
wsManager.on("session:block:complete", (data: BlockCompleteEvent) => {});
wsManager.on("session:status", (data: SessionStatusEvent) => {});
wsManager.on("session:metadata:update", (data: MetadataUpdateEvent) => {});
wsManager.on("session:file:created", (data: FileCreatedEvent) => {});
wsManager.on("session:file:modified", (data: FileModifiedEvent) => {});
wsManager.on("session:file:deleted", (data: FileDeletedEvent) => {});
wsManager.on("session:subagent:discovered", (data: SubagentDiscoveredEvent) => {});
wsManager.on("session:subagent:completed", (data: SubagentCompletedEvent) => {});
wsManager.on("sessions:list", (sessions: SessionListItem[]) => {});
wsManager.on("error", (error: ErrorEvent) => {});
```
