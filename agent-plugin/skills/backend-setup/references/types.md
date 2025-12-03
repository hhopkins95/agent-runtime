# Backend Types Reference

## PersistenceAdapter Interface

The main integration point between the runtime and application storage:

```typescript
interface PersistenceAdapter {
  // ========================================
  // Session Operations
  // ========================================

  /**
   * Fetch all sessions for initialization.
   * Called once when SessionManager starts.
   */
  listAllSessions(): Promise<PersistedSessionListData[]>;

  /**
   * Retrieve full session data for a given session id.
   * Does not include message history, but includes raw transcript.
   * AgentSession handles parsing transcript into message history.
   */
  loadSession(sessionId: string): Promise<PersistedSessionData | null>;

  /**
   * Save a new session to persistence.
   * Called when creating a new session.
   */
  createSessionRecord(session: PersistedSessionListData): Promise<void>;

  /**
   * Update session data.
   */
  updateSessionRecord(
    sessionId: string,
    updates: Partial<PersistedSessionListData>
  ): Promise<void>;

  // ========================================
  // Storage Operations
  // ========================================

  /**
   * Save a transcript file.
   * Transcripts are JSONL format, potentially large.
   */
  saveTranscript(sessionId: string, rawTranscript: string): Promise<void>;

  /**
   * Upsert a workspace file (non-transcript).
   * For workspace files modified by the agent.
   */
  saveWorkspaceFile(sessionId: string, file: WorkspaceFile): Promise<void>;

  /**
   * Delete a workspace file.
   */
  deleteSessionFile(sessionId: string, path: string): Promise<void>;

  // ========================================
  // Agent Profile Operations
  // ========================================

  /**
   * List all possible agent profiles.
   */
  listAgentProfiles(): Promise<AgentProfileListData[]>;

  /**
   * Retrieve full agent profile data.
   */
  loadAgentProfile(agentProfileId: string): Promise<AgentProfile | null>;
}
```

## Session Types

```typescript
interface PersistedSessionListData {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;  // "claude-agent-sdk" | "opencode"
  agentProfileReference: string;
  createdAt: string;
  sessionOptions?: AgentArchitectureSessionOptions;
}

interface PersistedSessionData extends PersistedSessionListData {
  rawTranscript?: string;
  workspaceFiles?: WorkspaceFile[];
}

interface WorkspaceFile {
  path: string;
  content: string;
  createdAt?: string;
  modifiedAt?: string;
}

type AGENT_ARCHITECTURE_TYPE = "claude-agent-sdk" | "opencode";
```

## Runtime Types

```typescript
interface RuntimeConfig {
  persistence: PersistenceAdapter;
  modal: {
    tokenId: string;
    tokenSecret: string;
    appName: string;
  };
  idleTimeoutMs?: number;   // Default: 15 minutes
  syncIntervalMs?: number;  // Default: 30 seconds
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

## Agent Profile Types

```typescript
interface AgentProfileListData {
  id: string;
  name: string;
  description?: string;
}

interface AgentProfile extends AgentProfileListData {
  systemPrompt?: string;
  agentMDFile?: string;  // CLAUDE.md or AGENT.md content
  tools?: string[];
  skills?: ClaudeSkill[];
  subagents?: ClaudeSubagent[];
  commands?: AgentCommand[];
  bundledMCPs?: LocalMcpServer[];
  externalMCPs?: McpServerConfig[];
  npmDependencies?: string[];
  pipDependencies?: string[];
  environmentVariables?: Record<string, string>;
  defaultWorkspaceFiles?: WorkspaceFile[];
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

## WebSocket Event Types

```typescript
// Block streaming events
interface BlockStartEvent {
  sessionId: string;
  conversationId: string;
  block: ConversationBlock;
}

interface BlockDeltaEvent {
  sessionId: string;
  conversationId: string;
  blockId: string;
  delta: string;
}

interface BlockUpdateEvent {
  sessionId: string;
  conversationId: string;
  blockId: string;
  updates: Partial<ConversationBlock>;
}

interface BlockCompleteEvent {
  sessionId: string;
  conversationId: string;
  blockId: string;
  block: ConversationBlock;
}

// Session events
interface SessionStatusEvent {
  sessionId: string;
  runtime: SessionRuntimeState;
}

interface MetadataUpdateEvent {
  sessionId: string;
  conversationId: string;
  metadata: SessionMetadata;
}

// File events
interface FileCreatedEvent {
  sessionId: string;
  file: WorkspaceFile;
}

interface FileModifiedEvent {
  sessionId: string;
  file: WorkspaceFile;
}

interface FileDeletedEvent {
  sessionId: string;
  path: string;
}

// Subagent events
interface SubagentDiscoveredEvent {
  sessionId: string;
  subagent: SubagentInfo;
}

interface SubagentCompletedEvent {
  sessionId: string;
  subagentId: string;
  status: "completed" | "error";
}
```
