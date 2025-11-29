# OpenCode Session Storage Reference

This document describes how opencode stores sessions on the host machine, including file paths, naming conventions, and type definitions.

## Storage Location

Sessions are stored using the **XDG Base Directory Specification**. The base data path is:

```
$XDG_DATA_HOME/opencode/storage/
```

### Platform Defaults

| Platform | Default Path |
|----------|-------------|
| Linux    | `~/.local/share/opencode/storage/` |
| macOS    | `~/.local/share/opencode/storage/` |
| Windows  | `%LOCALAPPDATA%/opencode/storage/` (if XDG not set) |

Source: `packages/opencode/src/global/index.ts`

---

## Directory Structure

```
~/.local/share/opencode/storage/
├── project/
│   ├── global.json                           # Fallback project for non-git directories
│   └── <projectId>.json                      # Project metadata (projectId = git root commit hash)
├── session/
│   └── <projectId>/
│       └── <sessionId>.json                  # Session metadata
├── message/
│   └── <sessionId>/
│       └── <messageId>.json                  # Message metadata (user or assistant)
├── part/
│   └── <messageId>/
│       └── <partId>.json                     # Message parts (text, tools, files, etc.)
├── share/
│   └── <sessionId>.json                      # Share info (if session is shared)
├── session_diff/
│   └── <sessionId>.json                      # File diffs for the session
└── migration                                 # Migration version number (integer)
```

---

## Identifier Format

All IDs are generated using a custom scheme defined in `packages/opencode/src/id/id.ts`.

### Format

```
<prefix>_<timestamp_hex><random_base62>
```

- **Total length**: 26 characters after prefix
- **Timestamp**: 6 bytes (48 bits) encoded as hex (12 chars)
- **Random**: 14 characters of base62 (`0-9A-Za-z`)

### Prefixes

| Entity     | Prefix | Example |
|------------|--------|---------|
| Session    | `ses`  | `ses_ff2a3b4c5d6eXyZ123456789abc` |
| Message    | `msg`  | `msg_ff2a3b4c5d6eXyZ123456789abc` |
| Part       | `prt`  | `prt_ff2a3b4c5d6eXyZ123456789abc` |
| Permission | `per`  | `per_ff2a3b4c5d6eXyZ123456789abc` |
| User       | `usr`  | `usr_ff2a3b4c5d6eXyZ123456789abc` |

### Ordering

- **Sessions**: Use **descending** IDs (newer sessions sort first via bitwise NOT on timestamp)
- **Messages & Parts**: Use **ascending** IDs (older items sort first)

---

## Project ID

The `projectId` determines which folder sessions are stored in.

### Resolution Logic

| Scenario | Project ID | Notes |
|----------|-----------|-------|
| No `.git` directory found | `"global"` | All non-git directories share this |
| Git repo with no commits | `"global"` | Falls back to global |
| Git repo with commits | First root commit hash | Sorted alphabetically if multiple roots |

The project ID is cached in `.git/opencode` after first resolution.

Source: `packages/opencode/src/project/project.ts`

---

## Type Definitions

### Project

**File**: `storage/project/<projectId>.json`

```typescript
interface Project {
  id: string                    // "global" or git root commit hash
  worktree: string              // "/" for global, or git worktree path
  vcsDir?: string               // Path to .git directory
  vcs?: "git"                   // Version control system
  time: {
    created: number             // Unix timestamp (ms)
    initialized?: number        // Unix timestamp (ms)
  }
}
```

### Session

**File**: `storage/session/<projectId>/<sessionId>.json`

```typescript
interface Session {
  id: string                    // ses_... format
  projectID: string             // Project this session belongs to
  directory: string             // Working directory for the session
  parentID?: string             // Parent session ID (for child sessions)
  title: string                 // Session title (auto-generated or user-set)
  version: string               // OpenCode version that created this session
  time: {
    created: number             // Unix timestamp (ms)
    updated: number             // Unix timestamp (ms)
    compacting?: number         // Unix timestamp (ms) - when compaction started
  }
  summary?: {
    additions: number           // Total lines added
    deletions: number           // Total lines deleted
    files: number               // Number of files changed
    diffs?: FileDiff[]          // Detailed file diffs (optional)
  }
  share?: {
    url: string                 // Public share URL
  }
  revert?: {
    messageID: string           // Message to revert to
    partID?: string
    snapshot?: string
    diff?: string
  }
}
```

### Message (User)

**File**: `storage/message/<sessionId>/<messageId>.json`

```typescript
interface UserMessage {
  id: string                    // msg_... format
  sessionID: string
  role: "user"
  time: {
    created: number             // Unix timestamp (ms)
  }
  agent: string                 // Agent type (e.g., "build")
  model: {
    providerID: string          // e.g., "anthropic", "openai"
    modelID: string             // e.g., "claude-sonnet-4-20250514"
  }
  system?: string               // System prompt override
  tools?: Record<string, boolean>  // Tool enable/disable overrides
  summary?: {
    title?: string
    body?: string
    diffs: FileDiff[]
  }
}
```

### Message (Assistant)

**File**: `storage/message/<sessionId>/<messageId>.json`

```typescript
interface AssistantMessage {
  id: string                    // msg_... format
  sessionID: string
  role: "assistant"
  parentID: string              // The user message this responds to
  modelID: string
  providerID: string
  mode: string                  // e.g., "build", "plan"
  path: {
    cwd: string                 // Current working directory
    root: string                // Project root
  }
  time: {
    created: number             // Unix timestamp (ms)
    completed?: number          // Unix timestamp (ms)
  }
  cost: number                  // Total cost in USD
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  finish?: string               // Finish reason
  summary?: boolean             // Whether this is a summary message
  error?: MessageError          // Error if message failed (see Error Types below)
}
```

### Parts

**File**: `storage/part/<messageId>/<partId>.json`

All parts share a common base:

```typescript
interface PartBase {
  id: string                    // prt_... format
  sessionID: string
  messageID: string
}
```

#### TextPart

```typescript
interface TextPart extends PartBase {
  type: "text"
  text: string
  synthetic?: boolean           // Generated by system, not model
  ignored?: boolean             // Excluded from context
  time?: {
    start: number
    end?: number
  }
  metadata?: Record<string, any>
}
```

#### ReasoningPart

```typescript
interface ReasoningPart extends PartBase {
  type: "reasoning"
  text: string
  time: {
    start: number
    end?: number
  }
  metadata?: Record<string, any>
}
```

#### ToolPart

```typescript
interface ToolPart extends PartBase {
  type: "tool"
  callID: string                // Unique tool call ID
  tool: string                  // Tool name (e.g., "Read", "Bash", "Edit")
  state: ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError
  metadata?: Record<string, any>
}

interface ToolStatePending {
  status: "pending"
  input: Record<string, any>
  raw: string
}

interface ToolStateRunning {
  status: "running"
  input: Record<string, any>
  title?: string
  metadata?: Record<string, any>
  time: { start: number }
}

interface ToolStateCompleted {
  status: "completed"
  input: Record<string, any>
  output: string
  title: string
  metadata: Record<string, any>
  time: {
    start: number
    end: number
    compacted?: number          // If output was compacted
  }
  attachments?: FilePart[]
}

interface ToolStateError {
  status: "error"
  input: Record<string, any>
  error: string
  metadata?: Record<string, any>
  time: {
    start: number
    end: number
  }
}
```

#### FilePart

```typescript
interface FilePart extends PartBase {
  type: "file"
  mime: string                  // MIME type
  filename?: string
  url: string                   // data: URL or file path
  source?: FileSource | SymbolSource
}

interface FileSource {
  type: "file"
  path: string
  text: {
    value: string
    start: number               // Start line
    end: number                 // End line
  }
}

interface SymbolSource {
  type: "symbol"
  path: string
  name: string
  kind: number                  // LSP SymbolKind
  range: { start: Position, end: Position }
  text: {
    value: string
    start: number
    end: number
  }
}
```

#### StepStartPart

```typescript
interface StepStartPart extends PartBase {
  type: "step-start"
  snapshot?: string             // Git snapshot hash
}
```

#### StepFinishPart

```typescript
interface StepFinishPart extends PartBase {
  type: "step-finish"
  reason: string
  snapshot?: string
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number, write: number }
  }
}
```

#### SnapshotPart

```typescript
interface SnapshotPart extends PartBase {
  type: "snapshot"
  snapshot: string              // Git snapshot hash
}
```

#### PatchPart

```typescript
interface PatchPart extends PartBase {
  type: "patch"
  hash: string
  files: string[]
}
```

#### AgentPart

```typescript
interface AgentPart extends PartBase {
  type: "agent"
  name: string
  source?: {
    value: string
    start: number
    end: number
  }
}
```

#### SubtaskPart

```typescript
interface SubtaskPart extends PartBase {
  type: "subtask"
  prompt: string
  description: string
  agent: string
}
```

#### RetryPart

```typescript
interface RetryPart extends PartBase {
  type: "retry"
  attempt: number
  error: APIError
  time: { created: number }
}
```

#### CompactionPart

```typescript
interface CompactionPart extends PartBase {
  type: "compaction"
  auto: boolean
}
```

### FileDiff

Used in session summaries:

```typescript
interface FileDiff {
  file: string                  // File path
  before: string                // Hash before change
  after: string                 // Hash after change
  additions: number
  deletions: number
}
```

### Share

**File**: `storage/share/<sessionId>.json`

```typescript
interface SessionShare {
  secret: string                // Secret for managing the share
  url: string                   // Public URL
}
```

### Error Types

```typescript
type MessageError =
  | { name: "ProviderAuthError", providerID: string, message: string }
  | { name: "Unknown", message: string }
  | { name: "MessageOutputLengthError" }
  | { name: "MessageAbortedError", message: string }
  | { name: "APIError", message: string, statusCode?: number, isRetryable: boolean,
      responseHeaders?: Record<string, string>, responseBody?: string }
```

---

## Creating Sessions Manually

To manually create a session, you need to write the following files:

### 1. Project File (if using global)

```json
// storage/project/global.json
{
  "id": "global",
  "worktree": "/",
  "time": {
    "created": 1700000000000
  }
}
```

### 2. Session File

```json
// storage/session/global/ses_ff2a3b4c5d6eXyZ123456789abc.json
{
  "id": "ses_ff2a3b4c5d6eXyZ123456789abc",
  "projectID": "global",
  "directory": "/path/to/working/dir",
  "title": "My Manual Session",
  "version": "0.1.0",
  "time": {
    "created": 1700000000000,
    "updated": 1700000000000
  }
}
```

### 3. User Message File

```json
// storage/message/ses_ff2a3b4c5d6eXyZ123456789abc/msg_00d5c4b3a29183XyZ123456789abc.json
{
  "id": "msg_00d5c4b3a29183XyZ123456789abc",
  "sessionID": "ses_ff2a3b4c5d6eXyZ123456789abc",
  "role": "user",
  "time": {
    "created": 1700000000000
  },
  "agent": "build",
  "model": {
    "providerID": "anthropic",
    "modelID": "claude-sonnet-4-20250514"
  }
}
```

### 4. User Message Part (Text)

```json
// storage/part/msg_00d5c4b3a29183XyZ123456789abc/prt_00d5c4b3a29184XyZ123456789abc.json
{
  "id": "prt_00d5c4b3a29184XyZ123456789abc",
  "sessionID": "ses_ff2a3b4c5d6eXyZ123456789abc",
  "messageID": "msg_00d5c4b3a29183XyZ123456789abc",
  "type": "text",
  "text": "Hello, this is my prompt"
}
```

### 5. Assistant Message File

```json
// storage/message/ses_ff2a3b4c5d6eXyZ123456789abc/msg_00d5c4b3a29185XyZ123456789abc.json
{
  "id": "msg_00d5c4b3a29185XyZ123456789abc",
  "sessionID": "ses_ff2a3b4c5d6eXyZ123456789abc",
  "role": "assistant",
  "parentID": "msg_00d5c4b3a29183XyZ123456789abc",
  "modelID": "claude-sonnet-4-20250514",
  "providerID": "anthropic",
  "mode": "build",
  "path": {
    "cwd": "/path/to/working/dir",
    "root": "/path/to/working/dir"
  },
  "time": {
    "created": 1700000001000,
    "completed": 1700000005000
  },
  "cost": 0.003,
  "tokens": {
    "input": 1000,
    "output": 500,
    "reasoning": 0,
    "cache": {
      "read": 0,
      "write": 0
    }
  },
  "finish": "end_turn"
}
```

### 6. Assistant Message Part (Text)

```json
// storage/part/msg_00d5c4b3a29185XyZ123456789abc/prt_00d5c4b3a29186XyZ123456789abc.json
{
  "id": "prt_00d5c4b3a29186XyZ123456789abc",
  "sessionID": "ses_ff2a3b4c5d6eXyZ123456789abc",
  "messageID": "msg_00d5c4b3a29185XyZ123456789abc",
  "type": "text",
  "text": "Hello! This is the assistant's response."
}
```

---

## Important Notes

1. **File Locking**: OpenCode uses file locks for read/write operations. If manually writing files, ensure OpenCode is not running.

2. **ID Ordering**:
   - Session IDs use descending timestamps (newer = sorts first)
   - Message and Part IDs use ascending timestamps (older = sorts first)
   - Parts within a message are sorted by ID to maintain order

3. **Migration**: The `storage/migration` file contains an integer tracking which migrations have run. Current version is checked against `MIGRATIONS` array length.

4. **JSON Formatting**: Files are written with 2-space indentation via `JSON.stringify(content, null, 2)`.

5. **Timestamps**: All timestamps are Unix milliseconds (`Date.now()`).

---

## Source Files

| Component | Source File |
|-----------|-------------|
| Storage   | `packages/opencode/src/storage/storage.ts` |
| Session   | `packages/opencode/src/session/index.ts` |
| Messages  | `packages/opencode/src/session/message-v2.ts` |
| Project   | `packages/opencode/src/project/project.ts` |
| IDs       | `packages/opencode/src/id/id.ts` |
| Paths     | `packages/opencode/src/global/index.ts` |
| Snapshots | `packages/opencode/src/snapshot/index.ts` |
