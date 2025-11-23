# @agent-service/react-client

React hooks and client library for interacting with agent-service instances. Provides type-safe, real-time access to AI agent sessions with support for message streaming, file tracking, and subagent conversations.

## Features

- ✅ **Type-safe React hooks** for session management
- ✅ **Real-time WebSocket updates** for streaming responses
- ✅ **Context-based state management** with optimized re-renders
- ✅ **Full TypeScript support** with comprehensive type definitions
- ✅ **Architecture-agnostic** - works with Claude SDK and Gemini CLI
- ✅ **Session lifecycle management** - create, load, destroy sessions
- ✅ **Message streaming** - real-time conversation blocks
- ✅ **File workspace tracking** - monitor agent-created files
- ✅ **Subagent support** - nested agent conversations (Claude SDK)

## Installation

```bash
npm install @agent-service/react-client
# or
pnpm add @agent-service/react-client
# or
yarn add @agent-service/react-client
```

## Quick Start

### 1. Wrap your app with the provider

```tsx
import { AgentServiceProvider } from '@agent-service/react-client';

function App() {
  return (
    <AgentServiceProvider
      apiUrl="http://localhost:3002"
      wsUrl="http://localhost:3003"
      apiKey="your-api-key"
      debug={process.env.NODE_ENV === 'development'}
    >
      <YourApp />
    </AgentServiceProvider>
  );
}
```

### 2. Use hooks in your components

```tsx
import {
  useAgentSession,
  useMessages,
  useWorkspaceFiles,
} from '@agent-service/react-client';

function ChatInterface() {
  const { session, createSession, destroySession } = useAgentSession();
  const { blocks, sendMessage, isStreaming } = useMessages(session?.info.sessionId || '');
  const { files } = useWorkspaceFiles(session?.info.sessionId || '');

  async function handleCreateSession() {
    const sessionId = await createSession('my-agent-profile', 'claude-agent-sdk');
    console.log('Created session:', sessionId);
  }

  async function handleSendMessage(message: string) {
    await sendMessage(message);
  }

  return (
    <div>
      {!session ? (
        <button onClick={handleCreateSession}>Start New Session</button>
      ) : (
        <>
          <ConversationView blocks={blocks} isStreaming={isStreaming} />
          <MessageInput onSend={handleSendMessage} disabled={isStreaming} />
          <FileList files={files} />
          <button onClick={destroySession}>End Session</button>
        </>
      )}
    </div>
  );
}
```

## Core Concepts

### Provider

The `AgentServiceProvider` component manages:
- REST API client for session operations
- WebSocket connection for real-time updates
- Global state for all sessions
- Event routing from WebSocket to state updates

### State Management

Built on React Context + useReducer:
- **Global state**: All sessions indexed by sessionId
- **Session state**: Blocks, files, subagents, metadata
- **Real-time updates**: WebSocket events update state automatically
- **Optimized re-renders**: Context splitting prevents unnecessary updates

### Sessions

Sessions represent individual agent conversations:
- Created with `createSession(agentProfileRef, architecture)`
- Loaded with `loadSession(sessionId)`
- Destroyed with `destroySession()`
- Auto-join WebSocket rooms for real-time updates

## API Reference

### Hooks

#### `useSessionList()`

Access and manage the list of all sessions.

```tsx
const { sessions, isLoading, refresh, getSession } = useSessionList();
```

**Returns:**
- `sessions`: Array of session metadata
- `isLoading`: Whether initial load is in progress
- `refresh()`: Manually refresh session list
- `getSession(sessionId)`: Get specific session by ID

---

#### `useAgentSession(sessionId?)`

Manage a single agent session lifecycle.

```tsx
const {
  session,
  status,
  isLoading,
  error,
  createSession,
  loadSession,
  destroySession,
  syncSession,
} = useAgentSession();
```

**Parameters:**
- `sessionId` (optional): Auto-load this session on mount

**Returns:**
- `session`: Current session state (blocks, files, subagents)
- `status`: Session status (`active`, `inactive`, etc.)
- `isLoading`: Whether an operation is in progress
- `error`: Error from last operation
- `createSession(profileRef, architecture)`: Create new session
- `loadSession(sessionId)`: Load existing session
- `destroySession()`: Destroy current session
- `syncSession()`: Manually sync to persistence

**Example:**

```tsx
function SessionManager() {
  const { createSession, session, status } = useAgentSession();

  const handleCreate = async () => {
    try {
      const sessionId = await createSession(
        'my-coding-agent',
        'claude-agent-sdk'
      );
      console.log('Session created:', sessionId);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  return (
    <div>
      <p>Status: {status}</p>
      {!session && <button onClick={handleCreate}>Create Session</button>}
    </div>
  );
}
```

---

#### `useMessages(sessionId)`

Access conversation blocks and send messages.

```tsx
const {
  blocks,
  metadata,
  isStreaming,
  error,
  sendMessage,
  getBlock,
  getBlocksByType,
} = useMessages(sessionId);
```

**Parameters:**
- `sessionId` (required): Session to track

**Returns:**
- `blocks`: Array of conversation blocks (user messages, assistant text, tool uses, etc.)
- `metadata`: Session metadata (tokens, cost, model)
- `isStreaming`: Whether agent is currently streaming
- `error`: Error from last message send
- `sendMessage(content)`: Send message to agent
- `getBlock(blockId)`: Get specific block
- `getBlocksByType(type)`: Filter blocks by type

**Example:**

```tsx
function ConversationView({ sessionId }: { sessionId: string }) {
  const { blocks, sendMessage, isStreaming } = useMessages(sessionId);

  return (
    <div>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
      {isStreaming && <TypingIndicator />}
      <MessageInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
```

---

#### `useWorkspaceFiles(sessionId)`

Track files created/modified by the agent.

```tsx
const {
  files,
  isLoading,
  getFile,
  getFilesByPattern,
  getFilesByExtension,
} = useWorkspaceFiles(sessionId);
```

**Parameters:**
- `sessionId` (required): Session to track

**Returns:**
- `files`: Array of workspace files
- `isLoading`: Whether session is loading
- `getFile(path)`: Get specific file
- `getFilesByPattern(regex)`: Filter by path pattern
- `getFilesByExtension(ext)`: Filter by extension

**Example:**

```tsx
function FileExplorer({ sessionId }: { sessionId: string }) {
  const { files, getFilesByExtension } = useWorkspaceFiles(sessionId);

  const pythonFiles = getFilesByExtension('.py');
  const tsFiles = getFilesByExtension('.ts');

  return (
    <div>
      <h3>Python Files ({pythonFiles.length})</h3>
      {pythonFiles.map((file) => (
        <FileItem key={file.path} file={file} />
      ))}

      <h3>TypeScript Files ({tsFiles.length})</h3>
      {tsFiles.map((file) => (
        <FileItem key={file.path} file={file} />
      ))}
    </div>
  );
}
```

---

#### `useSubagents(sessionId)`

Access subagent conversations (Claude SDK only).

```tsx
const {
  subagents,
  count,
  hasRunningSubagents,
  getSubagent,
  getSubagentBlocks,
  getSubagentsByStatus,
} = useSubagents(sessionId);
```

**Parameters:**
- `sessionId` (required): Session to track

**Returns:**
- `subagents`: Array of all subagents
- `count`: Number of subagents
- `hasRunningSubagents`: Whether any are running
- `getSubagent(subagentId)`: Get specific subagent
- `getSubagentBlocks(subagentId)`: Get blocks for subagent
- `getSubagentsByStatus(status)`: Filter by status

**Example:**

```tsx
function SubagentMonitor({ sessionId }: { sessionId: string }) {
  const { subagents, hasRunningSubagents } = useSubagents(sessionId);

  return (
    <div>
      <h3>
        Subagents ({subagents.length})
        {hasRunningSubagents && <Spinner />}
      </h3>
      {subagents.map((subagent) => (
        <SubagentCard key={subagent.id} subagent={subagent} />
      ))}
    </div>
  );
}
```

---

### Types

#### Conversation Blocks

All conversation elements are represented as typed blocks:

```typescript
type ConversationBlock =
  | UserMessageBlock      // User input
  | AssistantTextBlock    // Agent text response
  | ToolUseBlock          // Agent tool invocation
  | ToolResultBlock       // Tool execution result
  | ThinkingBlock         // Agent reasoning (extended thinking)
  | SystemBlock           // System events
  | SubagentBlock;        // Subagent reference (Claude SDK)
```

Each block has:
- `id`: Unique identifier
- `timestamp`: ISO timestamp
- `type`: Block type discriminator

#### Session Status

```typescript
type SessionStatus =
  | "pending"
  | "active"
  | "inactive"
  | "completed"
  | "failed"
  | "building-sandbox";
```

#### Architecture Types

```typescript
type AGENT_ARCHITECTURE_TYPE = "claude-agent-sdk" | "gemini-cli";
```

---

### Type Guards

Use type guards to narrow block types:

```tsx
import { isAssistantTextBlock, isToolUseBlock } from '@agent-service/react-client';

function BlockRenderer({ block }: { block: ConversationBlock }) {
  if (isAssistantTextBlock(block)) {
    return <div>{block.content}</div>;
  }

  if (isToolUseBlock(block)) {
    return <ToolCallDisplay toolName={block.toolName} input={block.input} />;
  }

  // ... handle other block types
}
```

---

## Advanced Usage

### Custom REST Client

For advanced use cases, you can access the REST client directly:

```tsx
import { useContext } from 'react';
import { AgentServiceContext } from '@agent-service/react-client';

function CustomComponent() {
  const context = useContext(AgentServiceContext);

  const handleCustomOperation = async () => {
    // Direct access to REST client
    const isHealthy = await context.restClient.healthCheck();
    console.log('Server healthy:', isHealthy);
  };

  return <button onClick={handleCustomOperation}>Health Check</button>;
}
```

### WebSocket Events

Listen to raw WebSocket events:

```tsx
import { useContext, useEffect } from 'react';
import { AgentServiceContext } from '@agent-service/react-client';

function EventMonitor() {
  const context = useContext(AgentServiceContext);

  useEffect(() => {
    const handler = (data: any) => {
      console.log('Block started:', data);
    };

    context.wsManager.on('session:block:start', handler);

    return () => {
      context.wsManager.off('session:block:start', handler);
    };
  }, [context.wsManager]);

  return <div>Monitoring events...</div>;
}
```

---

## Examples

### Complete Chat Interface

```tsx
import {
  AgentServiceProvider,
  useAgentSession,
  useMessages,
  useSubagents,
  isAssistantTextBlock,
  isUserMessageBlock,
  isToolUseBlock,
} from '@agent-service/react-client';

function App() {
  return (
    <AgentServiceProvider
      apiUrl="http://localhost:3002"
      wsUrl="http://localhost:3003"
      apiKey={process.env.REACT_APP_AGENT_API_KEY!}
    >
      <ChatApp />
    </AgentServiceProvider>
  );
}

function ChatApp() {
  const { session, createSession, destroySession } = useAgentSession();

  if (!session) {
    return (
      <button onClick={() => createSession('default', 'claude-agent-sdk')}>
        Start Session
      </button>
    );
  }

  return (
    <div>
      <ConversationPanel sessionId={session.info.sessionId} />
      <button onClick={destroySession}>End Session</button>
    </div>
  );
}

function ConversationPanel({ sessionId }: { sessionId: string }) {
  const { blocks, sendMessage, isStreaming } = useMessages(sessionId);
  const { subagents } = useSubagents(sessionId);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (input.trim()) {
      await sendMessage(input);
      setInput('');
    }
  };

  return (
    <div>
      <div className="messages">
        {blocks.map((block) => {
          if (isUserMessageBlock(block)) {
            return <UserMessage key={block.id} content={block.content} />;
          }
          if (isAssistantTextBlock(block)) {
            return <AssistantMessage key={block.id} content={block.content} />;
          }
          if (isToolUseBlock(block)) {
            return <ToolCall key={block.id} tool={block} />;
          }
          return null;
        })}
      </div>

      {subagents.length > 0 && (
        <div className="subagents">
          <h4>Active Tasks ({subagents.length})</h4>
          {subagents.map((sub) => (
            <SubagentStatus key={sub.id} subagent={sub} />
          ))}
        </div>
      )}

      <div className="input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          disabled={isStreaming}
        />
        <button onClick={handleSend} disabled={isStreaming}>
          Send
        </button>
      </div>
    </div>
  );
}
```

---

## Troubleshooting

### WebSocket not connecting

Ensure the WebSocket server is running and the URL is correct:

```tsx
<AgentServiceProvider
  wsUrl="http://localhost:3003" // Check port
  // ...
/>
```

### Sessions not updating

Check that you're providing the correct `sessionId` to hooks:

```tsx
// ✅ Correct
const { blocks } = useMessages(session?.info.sessionId || '');

// ❌ Wrong - missing sessionId
const { blocks } = useMessages();
```

### TypeScript errors

Ensure you have React types installed:

```bash
npm install --save-dev @types/react
```

---

## License

MIT

---

## Contributing

Contributions welcome! Please open an issue or PR.
