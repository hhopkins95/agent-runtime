# @hhopkins/agent-runtime

Node.js runtime for orchestrating AI agents (Claude, Gemini) in isolated Modal sandboxes with real-time streaming and flexible persistence.

## Features

- 🔒 **Isolated Sandbox Execution** - Run agents in secure, ephemeral Modal sandboxes
- 🔄 **Real-time Streaming** - WebSocket-based streaming of agent messages and tool execution
- 💾 **Adapter Pattern** - Plug in any persistence layer (Convex, PostgreSQL, MongoDB, etc.)
- 🎯 **Multi-Architecture** - Support for Claude Agent SDK and Gemini CLI
- 📊 **Session Management** - Complete session lifecycle with state tracking
- 🔌 **Event-Driven** - Internal event bus for extensibility
- 📦 **Type-Safe** - Full TypeScript support with exported types

## Installation

```bash
npm install @hhopkins/agent-runtime
# or
pnpm add @hhopkins/agent-runtime
```

## Quick Start

### 1. Implement the Persistence Adapter

The runtime requires a persistence adapter to store session data and files. Implement the `PersistenceAdapter` interface for your database:

```typescript
import type { PersistenceAdapter } from '@hhopkins/agent-runtime/types';

class MyPersistenceAdapter implements PersistenceAdapter {
  constructor(private db: YourDatabase) {}

  async listAllSessions() {
    return await this.db.sessions.findAll();
  }

  async loadSession(sessionId: string) {
    return await this.db.sessions.findById(sessionId);
  }

  async createSessionRecord(session) {
    await this.db.sessions.insert(session);
  }

  async updateSessionRecord(sessionId, updates) {
    await this.db.sessions.update(sessionId, updates);
  }

  async saveTranscript(sessionId, rawTranscript, subagentId?) {
    await this.db.transcripts.upsert({ sessionId, subagentId, content: rawTranscript });
  }

  async saveWorkspaceFile(sessionId, file) {
    await this.db.files.upsert({ sessionId, path: file.path, content: file.content });
  }

  async deleteSessionFile(sessionId, path) {
    await this.db.files.delete({ sessionId, path });
  }

  async listAgentProfiles() {
    return await this.db.agentProfiles.findAll();
  }

  async loadAgentProfile(agentProfileId) {
    return await this.db.agentProfiles.findById(agentProfileId);
  }
}
```

See [PersistenceAdapter API](#persistenceadapter-api) for full interface documentation.

### 2. Configure and Start the Runtime

```typescript
import { AgentRuntime } from '@hhopkins/agent-runtime';
import type { RuntimeConfig } from '@hhopkins/agent-runtime/types';

// Create your adapter instance
const persistence = new MyPersistenceAdapter(myDatabase);

// Configure the runtime
const config: RuntimeConfig = {
  persistence,
  modal: {
    tokenId: process.env.MODAL_TOKEN_ID!,
    tokenSecret: process.env.MODAL_TOKEN_SECRET!,
    appName: 'my-app-agents',
  },
  // Optional configuration
  idleTimeoutMs: 15 * 60 * 1000,  // 15 minutes
  syncIntervalMs: 30 * 1000,       // 30 seconds
  websocketPort: 3000,
  logLevel: 'info',
};

// Start the runtime
const runtime = new AgentRuntime(config);
await runtime.start();

console.log('Agent runtime started!');
```

### 3. Connect Your Application

The runtime exposes HTTP and WebSocket APIs that your application connects to:

```typescript
// REST API
POST   /sessions/create         # Create a new session
GET    /sessions                # List all sessions
GET    /sessions/:id            # Get session details
POST   /sessions/:id/message    # Send message to agent
DELETE /sessions/:id            # Terminate session

// WebSocket
ws://localhost:3000              # Real-time session updates
```

Use the [@hhopkins/agent-runtime-react](../client/) package for easy React integration.

## Architecture

The runtime is built on an event-driven architecture with several core components:

```
┌──────────────────────────────────────────────────────┐
│                  Your Application                     │
│          (REST API + WebSocket Client)                │
└───────────────────┬──────────────────────────────────┘
                    │
                    ├─ HTTP/REST (session operations)
                    └─ WebSocket (real-time streaming)
                    │
┌───────────────────▼──────────────────────────────────┐
│              Agent Runtime (this package)             │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │   HTTP      │  │  WebSocket  │  │    Event     │ │
│  │  Transport  │  │  Transport  │  │     Bus      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘ │
│         │                │                 │         │
│  ┌──────▼────────────────▼─────────────────▼───────┐ │
│  │          Session Manager                        │ │
│  │  • Lifecycle management                         │ │
│  │  • State synchronization                        │ │
│  │  • Sandbox orchestration                        │ │
│  └──────┬──────────────────────────────────────────┘ │
│         │                                             │
│  ┌──────▼──────────────────────────────────────────┐ │
│  │          Agent Session (per session)            │ │
│  │  • Block-based conversation state               │ │
│  │  • Transcript parsing                           │ │
│  │  • File synchronization                         │ │
│  └──────┬──────────────────────────────────────────┘ │
│         │                                             │
└─────────┼─────────────────────────────────────────────┘
          │
          ├──→ Modal Sandbox (Agent execution)
          └──→ Persistence Adapter (Your database)
```

### Key Concepts

**Sessions** - Each agent conversation is a session with:
- Unique session ID
- Agent architecture type (Claude/Gemini)
- Agent profile reference
- Conversation blocks (messages, tool uses, thinking)
- Workspace files
- Raw transcript storage

**Blocks** - Conversations are represented as blocks:
- `user_message` - User input
- `assistant_text` - Agent response
- `tool_use` - Agent using a tool
- `tool_result` - Tool execution result
- `thinking` - Agent's internal reasoning
- `system` - System events
- `subagent` - Subagent invocation

**Adapters** - The runtime uses dependency injection:
- **PersistenceAdapter** - Database and storage operations
- Your application provides all adapters

## PersistenceAdapter API

### Session Operations

#### `listAllSessions(): Promise<SessionListData[]>`

Fetch all sessions for initialization. Called once when SessionManager starts.

#### `loadSession(sessionId: string): Promise<SavedSessionData | null>`

Load full session data including raw transcript. Returns `null` if not found.

#### `createSessionRecord(session: SessionListData): Promise<void>`

Save a new session to persistence.

#### `updateSessionRecord(sessionId: string, updates: Partial<SessionListData>): Promise<void>`

Update session metadata (status, name, lastActivity, etc.).

### Storage Operations

#### `saveTranscript(sessionId: string, rawTranscript: string, subagentId?: string): Promise<void>`

Save the raw transcript file (JSONL for Claude, JSON for Gemini). Can be for main session or a subagent.

#### `saveWorkspaceFile(sessionId: string, file: WorkspaceFile): Promise<void>`

Upsert a workspace file modified by the agent.

```typescript
interface WorkspaceFile {
  path: string;
  content: string;
}
```

#### `deleteSessionFile(sessionId: string, path: string): Promise<void>`

Delete a workspace file.

### Agent Profile Operations

#### `listAgentProfiles(): Promise<AgentProfileListData[]>`

List all available agent profiles that can be used to create sessions.

#### `loadAgentProfile(agentProfileId: string): Promise<AgentProfile | null>`

Load full agent profile configuration including skills, tools, and prompts.

## Runtime Configuration

### Required Configuration

```typescript
interface RuntimeConfig {
  // Persistence adapter (required)
  persistence: PersistenceAdapter;

  // Modal configuration (required)
  modal: {
    tokenId: string;      // Modal API token ID
    tokenSecret: string;  // Modal API token secret
    appName: string;      // Unique app name in your Modal account
  };

  // Optional configuration
  idleTimeoutMs?: number;     // Default: 900000 (15 minutes)
  syncIntervalMs?: number;    // Default: 30000 (30 seconds)
  websocketPort?: number;     // Default: 3003
  logLevel?: 'debug' | 'info' | 'warn' | 'error';  // Default: 'info'
}
```

### Environment Variables

Recommended to use environment variables for secrets:

```bash
MODAL_TOKEN_ID=your-token-id
MODAL_TOKEN_SECRET=your-token-secret
ANTHROPIC_API_KEY=your-anthropic-key  # For Claude agents
```

## HTTP API Reference

### Create Session

```http
POST /sessions/create
Content-Type: application/json

{
  "agentProfileRef": "code-assistant",
  "architecture": "claude-agent-sdk"
}
```

**Response:**
```json
{
  "sessionId": "abc123",
  "status": "building-sandbox",
  "createdAt": 1234567890
}
```

### List Sessions

```http
GET /sessions
```

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "abc123",
      "type": "claude-agent-sdk",
      "agentProfileReference": "code-assistant",
      "status": "active",
      "lastActivity": 1234567890,
      "createdAt": 1234567890
    }
  ]
}
```

### Get Session

```http
GET /sessions/:sessionId
```

**Response:**
```json
{
  "sessionId": "abc123",
  "type": "claude-agent-sdk",
  "agentProfileReference": "code-assistant",
  "status": "active",
  "blocks": [...],
  "workspaceFiles": [...],
  "subagents": [...]
}
```

### Send Message

```http
POST /sessions/:sessionId/message
Content-Type: application/json

{
  "content": "What files are in this directory?"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "abc123"
}
```

### Terminate Session

```http
DELETE /sessions/:sessionId
```

**Response:**
```json
{
  "success": true,
  "sessionId": "abc123"
}
```

## WebSocket API Reference

Connect to `ws://localhost:3000` (or your configured port).

### Client → Server Events

#### `session:join`

```typescript
socket.emit('session:join', sessionId, (response) => {
  console.log(response); // { success: true }
});
```

#### `session:leave`

```typescript
socket.emit('session:leave', sessionId, (response) => {
  console.log(response); // { success: true }
});
```

### Server → Client Events

#### `session:block:start`

Emitted when a new block starts (message, tool use, thinking).

```typescript
{
  sessionId: string;
  conversationId: 'main' | string;  // 'main' or subagent ID
  block: ConversationBlock;
}
```

#### `session:block:delta`

Streaming text updates (for assistant messages and thinking).

```typescript
{
  sessionId: string;
  conversationId: 'main' | string;
  blockId: string;
  delta: string;  // Text chunk
}
```

#### `session:block:update`

Block property updates (status changes, etc.).

```typescript
{
  sessionId: string;
  conversationId: 'main' | string;
  blockId: string;
  updates: Partial<ConversationBlock>;
}
```

#### `session:block:complete`

Emitted when a block is finalized.

```typescript
{
  sessionId: string;
  conversationId: 'main' | string;
  blockId: string;
  block: ConversationBlock;  // Final block state
}
```

#### `session:file:created` / `session:file:modified` / `session:file:deleted`

File system updates from the agent.

```typescript
{
  sessionId: string;
  file?: WorkspaceFile;
  path?: string;  // For deletions
}
```

#### `session:status`

Session status changes (active/inactive).

```typescript
{
  sessionId: string;
  status: 'active' | 'inactive';
}
```

#### `error`

Error events.

```typescript
{
  message: string;
  code?: string;
  sessionId?: string;
}
```

## Type Exports

All types are available from `@hhopkins/agent-runtime/types`:

```typescript
import type {
  // Configuration
  RuntimeConfig,
  PersistenceAdapter,

  // Sessions
  SessionStatus,
  SessionListData,
  RuntimeSessionData,
  WorkspaceFile,

  // Blocks
  ConversationBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentBlock,

  // WebSocket events
  ServerToClientEvents,
  ClientToServerEvents,

  // Type guards
  isUserMessageBlock,
  isAssistantTextBlock,
  isToolUseBlock,
  // ... etc
} from '@hhopkins/agent-runtime/types';
```

## Examples

### Convex Persistence Adapter

```typescript
import { ConvexHttpClient } from 'convex/browser';
import type { PersistenceAdapter } from '@hhopkins/agent-runtime/types';

export class ConvexPersistenceAdapter implements PersistenceAdapter {
  private client: ConvexHttpClient;

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl);
  }

  async listAllSessions() {
    return await this.client.query('sessions:list');
  }

  async loadSession(sessionId: string) {
    return await this.client.query('sessions:get', { sessionId });
  }

  async createSessionRecord(session) {
    await this.client.mutation('sessions:create', session);
  }

  async updateSessionRecord(sessionId, updates) {
    await this.client.mutation('sessions:update', { sessionId, updates });
  }

  async saveTranscript(sessionId, rawTranscript, subagentId?) {
    await this.client.mutation('transcripts:save', {
      sessionId,
      rawTranscript,
      subagentId,
    });
  }

  async saveWorkspaceFile(sessionId, file) {
    await this.client.mutation('files:save', { sessionId, ...file });
  }

  async deleteSessionFile(sessionId, path) {
    await this.client.mutation('files:delete', { sessionId, path });
  }

  async listAgentProfiles() {
    return await this.client.query('agentProfiles:list');
  }

  async loadAgentProfile(agentProfileId) {
    return await this.client.query('agentProfiles:get', { agentProfileId });
  }
}
```

## Requirements

- Node.js >= 18
- Modal account ([modal.com](https://modal.com))
- Anthropic API key (for Claude agents)

## License

MIT
