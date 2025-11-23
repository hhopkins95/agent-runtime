# Session Type System

## Architecture Overview

This type system provides a unified interface for managing agent sessions across different agent architectures (Claude SDK, Gemini CLI, etc.). It separates:

1. **Persistence Layer** - Architecture-specific raw formats (JSONL, JSON)
2. **Runtime Layer** - Unified block-based representation
3. **Streaming Layer** - Real-time event streaming with deltas

---

## Key Design Decisions

### 1. Block-Based Architecture (Not Turn-Based)

Instead of grouping messages into "turns" (user message + full assistant response), we use atomic **"blocks"** - discrete events that can be synced independently.

#### Block Types

- **UserMessageBlock** - User input
- **AssistantTextBlock** - Agent text output (can stream character-by-character)
- **ToolUseBlock** - Tool invocation
- **ToolResultBlock** - Tool execution result
- **ThinkingBlock** - Agent reasoning/thoughts (can stream)
- **SystemBlock** - System events (session start, errors, status updates)
- **SubagentBlock** - Reference to subagent conversation thread

#### Why Blocks Instead of Turns?

**Problem with turns:** Long-running assistant workflows can have dozens of tool calls. Waiting for the entire "turn" to complete before syncing state could take minutes.

**Solution with blocks:**
- ✅ Granular state syncing (sync after each complete block)
- ✅ Better progress tracking for long-running workflows
- ✅ Natural fit for streaming UX (typing animations, tool progress indicators)
- ✅ Can display and interact with partial results immediately

**Example:**
```typescript
// Turn-based (old approach) - Must wait for entire response
{
  role: "assistant",
  content: "..." // Everything bundled together
  toolCalls: [...] // All tool calls in one object
}

// Block-based (new approach) - Each piece is separate
[
  AssistantTextBlock("I'll analyze the code"),      // ← Sync immediately
  ToolUseBlock("Read", {...}),                      // ← Sync immediately
  ToolResultBlock({...}),                           // ← Sync immediately
  ThinkingBlock("The code has an issue..."),        // ← Sync immediately
  AssistantTextBlock("I found a bug..."),           // ← Sync immediately
]
```

---

### 2. Separation of Saved vs. Runtime Data

We maintain two representations of session data:

#### SavedSessionData (Persisted to Disk)

```typescript
interface SavedSessionData {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;

  // Raw transcript in architecture-specific format
  rawTranscript?: string;          // JSONL for Claude, JSON for Gemini

  subagents?: {
    id: string;
    rawTranscript?: string;
  }[];

  workspaceFiles: WorkspaceFile[];
  // ... metadata
}
```

**Characteristics:**
- Minimal, optimized for storage
- Architecture-specific format (preserves all native information)
- Can be reconstructed without data loss

#### RuntimeSessionData (In-Memory)

```typescript
interface RuntimeSessionData extends SavedSessionData {
  // Parsed, unified representation
  blocks: ConversationBlock[];

  subagents: {
    id: string;
    rawTranscript?: string;
    blocks: ConversationBlock[];  // ← Parsed blocks
  }[];
}
```

**Characteristics:**
- Extends SavedSessionData (has everything from saved + more)
- Adds parsed `blocks` in unified format
- Optimized for querying and UI rendering
- Architecture-agnostic (works same way for Claude and Gemini)

#### Data Flow

**Loading a session:**
```
1. Read SavedSessionData from persistence
2. Pass rawTranscript to adapter.parseTranscripts()
3. Get back blocks: ConversationBlock[]
4. Create RuntimeSessionData with both raw + parsed
```

**During execution:**
```
1. Stream events arrive (SDKMessage or GeminiMessageRecord)
2. Adapter converts to StreamEvent (unified format)
3. AgentSession updates blocks in memory
4. Periodically sync: blocks → update rawTranscript → persist SavedSessionData
```

**Why separate?**
- Persistence layer doesn't need to understand blocks
- Can swap persistence implementations easily
- Runtime layer works with clean, unified types
- Raw transcript preserves all architecture-specific details

---

### 3. Subagent Conversation Threading

Subagents (Claude SDK feature) are represented as **separate conversation threads** rather than nested blocks.

#### Main Conversation

```typescript
{
  blocks: [
    UserMessageBlock("Please analyze this code"),
    AssistantTextBlock("I'll use the code-reviewer agent"),
    SubagentBlock({                    // ← Reference block
      subagentId: "sub-123",
      name: "code-reviewer",
      input: "Review the auth logic",
      status: "running",               // pending | running | success | error
    }),
    AssistantTextBlock("Based on the review..."),
  ]
}
```

#### Subagent Conversation (Separate Thread)

```typescript
{
  subagents: [{
    id: "sub-123",
    blocks: [                          // ← Subagent's own conversation
      SystemBlock("Subagent code-reviewer started"),
      UserMessageBlock("Review the auth logic"),
      AssistantTextBlock("Reading the authentication files..."),
      ToolUseBlock("Read", {file: "auth.ts"}),
      ToolResultBlock({content: "..."}),
      AssistantTextBlock("Found 3 security issues..."),
      SystemBlock("Subagent completed"),
    ]
  }]
}
```

#### Benefits

1. **Clean separation** - Main conversation isn't polluted with subagent implementation details
2. **Independent state management** - Can sync/query subagent conversation separately
3. **Clear hierarchy** - SubagentBlock provides high-level summary in main thread
4. **UI flexibility** - Can show subagent as collapsed/expanded, or in separate panel

---

### 4. Streaming Events

Real-time updates during execution are delivered via `StreamEvent` types.

#### Event Types

| Event Type | Purpose | When Emitted |
|------------|---------|--------------|
| `block_start` | New block begins | AssistantText starts, Thinking starts, ToolUse created |
| `text_delta` | Character-by-character streaming | Assistant typing, thinking streaming |
| `block_update` | Status/metadata changes | Tool status change, subagent progress |
| `block_complete` | Block finalized | Text finished, tool result received, any block done |
| `metadata_update` | Session-level metadata | Token usage, cost info |

#### Example Streaming Flow

**Assistant responds with tool use:**

```typescript
// User sends message
UserMessageBlock("What's in config.json?")

// Assistant starts responding
1. block_start     → AssistantTextBlock(id: "txt-1", content: "")
2. text_delta      → { blockId: "txt-1", delta: "I'll" }
3. text_delta      → { blockId: "txt-1", delta: " read" }
4. text_delta      → { blockId: "txt-1", delta: " the file" }
5. block_complete  → AssistantTextBlock(id: "txt-1", content: "I'll read the file")

// Tool use begins
6. block_start     → ToolUseBlock(id: "tool-1", status: "pending", name: "Read")
7. block_update    → { blockId: "tool-1", updates: { status: "running" } }
8. block_complete  → ToolUseBlock(id: "tool-1", status: "success")

// Tool result arrives
9. block_complete  → ToolResultBlock(toolUseId: "tool-1", output: {...})

// Metadata
10. metadata_update → { usage: { inputTokens: 100, ... }, costUSD: 0.05 }
```

#### Streaming UX Benefits

- **Typing animation** - UI appends each text_delta to show real-time generation
- **Tool progress** - Show "Read file is running..." via block_update events
- **Subagent status** - Update SubagentBlock status as it progresses
- **Token tracking** - Update cost display as metadata_update events arrive

#### conversationId Field

Every stream event includes a `conversationId` field:

```typescript
{
  type: 'text_delta',
  blockId: '...',
  delta: '...',
  conversationId: 'main'  // or 'subagent-123'
}
```

This allows the UI to route events to the correct conversation thread (main vs. subagent).

---

### 5. Architecture Adapter Pattern

The `AgentArchitectureAdapter` interface handles architecture-specific differences, allowing the core `AgentSession` class to be architecture-agnostic.

#### Adapter Responsibilities

| Responsibility | Claude SDK Example | Gemini CLI Example |
|----------------|-------------------|-------------------|
| **Path conventions** | `/root/.claude/projects/workspace` | `/root/.gemini/tmp/workspace` |
| **Profile setup** | Create CLAUDE.md, skills/, agents/ | Create GEMINI.md |
| **Transcript format** | `.jsonl` files | `.json` files |
| **Parsing** | `parseClaudeTranscriptFile()` | `parseGeminiTranscriptFile()` |
| **Stream translation** | `SDKMessage → StreamEvent` | `GeminiMessageRecord → StreamEvent` |
| **Query execution** | `--session-id` or `--resume` flags | Different CLI args |

#### Adapter Interface

```typescript
interface AgentArchitectureAdapter {
  // Configuration
  getPaths(): { AGENT_STORAGE_DIR, WORKSPACE_DIR, ... }

  // Setup operations (called during initialization)
  setupAgentProfile(agentProfile, writeFile)
  setupSessionTranscripts(sessionId, transcripts, writeFile)

  // Execution (called during query)
  executeQuery({ query, sessionId, isNewSession }): AsyncGenerator<StreamEvent>

  // Parsing (called when loading saved sessions)
  parseTranscripts(rawTranscripts): { blocks, subagents }
}
```

#### How It Works

**AgentSandbox uses the adapter:**

```typescript
class AgentSandbox {
  private adapter: AgentArchitectureAdapter;

  constructor(architecture: AGENT_ARCHITECTURE_TYPE) {
    // Factory creates the right adapter
    this.adapter = getAgentArchitectureAdapter(architecture);
  }

  async setupAgentProfile(profile: AgentProfile) {
    // Delegate to adapter - it knows how to handle Claude vs Gemini
    await this.adapter.setupAgentProfile({
      agentProfile: profile,
      writeFile: this.sandbox.writeFile
    });
  }

  async* executeQuery(prompt: string, isNewSession: boolean) {
    // Adapter handles architecture-specific execution
    // Returns unified StreamEvent regardless of architecture
    yield* this.adapter.executeQuery({
      query: prompt,
      sessionId: this.sessionId,
      isNewSession
    });
  }
}
```

**Benefits:**
- Core classes (`AgentSession`, `AgentSandbox`) are architecture-agnostic
- Easy to add new architectures (just implement the adapter interface)
- No conditionals scattered throughout the codebase
- Each adapter can be tested independently

---

## Type Hierarchy

```
SessionListData
  ↓ extends
SavedSessionData
  ↓ extends
RuntimeSessionData
```

### SessionListData

Minimal data for listing/displaying sessions before loading full data.

```typescript
interface SessionListData {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;
  agentProfileReference: string;
  status: SessionStatus;
  lastActivity?: number;
  createdAt?: number;
}
```

**Use case:** Display table of sessions in admin UI

### SavedSessionData

What gets persisted to disk. Includes raw transcripts.

```typescript
interface SavedSessionData extends SessionListData {
  rawTranscript?: string;           // Architecture-specific format
  subagents?: { id, rawTranscript }[];
  workspaceFiles: WorkspaceFile[];
}
```

**Use case:** Load/save from persistence layer

### RuntimeSessionData

In-memory representation with parsed blocks.

```typescript
interface RuntimeSessionData extends SavedSessionData {
  blocks: ConversationBlock[];      // Parsed unified format
  subagents: {
    id: string;
    rawTranscript?: string;
    blocks: ConversationBlock[];    // Parsed
  }[];
}
```

**Use case:** Working with session data at runtime, rendering UI

---

## Related Types

- **ConversationBlock types** → See [`blocks.ts`](./blocks.ts)
- **StreamEvent types** → See [`streamEvents.ts`](./streamEvents.ts)
- **AgentArchitectureAdapter** → See [`../lib/agent-architectures/base.ts`](../../lib/agent-architectures/base.ts)
- **AgentProfile types** → See [`../agent-profiles.ts`](../agent-profiles.ts)

---

## Example Usage

### Creating a New Session

```typescript
// Create session with architecture type
const session = await AgentSession.create({
  agentProfileRef: "code-assistant",
  architecture: "claude-agent-sdk"  // or "gemini-cli"
}, modalContext, eventBus, persistenceAdapter);

// Send message and handle stream
for await (const event of session.sendMessage("Hello")) {
  if (event.type === 'text_delta') {
    ui.appendText(event.delta);
  }
  if (event.type === 'block_complete') {
    ui.finalizeBlock(event.block);
  }
}

// Get current state (RuntimeSessionData)
const state = session.getState();
console.log(state.blocks);  // All conversation blocks
```

### Loading an Existing Session

```typescript
// Load from persistence
const savedData = await persistence.loadSession("session-123");

// savedData has rawTranscript (string)
// Adapter parses it into blocks
const session = await AgentSession.create({
  sessionId: savedData.sessionId
}, modalContext, eventBus, persistenceAdapter);

// session.getState() now has both:
// - rawTranscript (original)
// - blocks (parsed)
```

### Handling Subagents

```typescript
const state = session.getState();

// Main conversation blocks
state.blocks.forEach(block => {
  if (block.type === 'subagent') {
    console.log(`Subagent ${block.name} is ${block.status}`);
  }
});

// Subagent conversation blocks
state.subagents.forEach(subagent => {
  console.log(`Subagent ${subagent.id}:`);
  subagent.blocks.forEach(block => {
    console.log(`  - ${block.type}`);
  });
});
```
