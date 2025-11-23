# Design Document
## Generic Agent Runtime Architecture

**Version:** 1.0
**Last Updated:** 2025-01-17
**Status:** Draft
**Related:** [PRD](./PRD.md)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Core Abstractions](#3-core-abstractions)
4. [Directory Structure](#4-directory-structure)
5. [Data Flow](#5-data-flow)
6. [Public API Design](#6-public-api-design)
7. [Implementation Details](#7-implementation-details)
8. [Migration Path](#8-migration-path)
9. [Alternative Approaches](#9-alternative-approaches-considered)
10. [Open Questions](#10-open-questions--decisions-needed)
11. [Success Criteria](#11-success-criteria)
12. [Timeline](#12-timeline-estimate)

---

## 1. System Overview

The Generic Agent Runtime is a TypeScript-based orchestration system for running Claude AI agents in isolated sandbox environments. It provides session management, real-time streaming, and persistence while allowing applications to plug in their own backends and tools.

### Architecture Philosophy

**Core Principles:**
1. **Dependency Injection**: Core runtime accepts adapters rather than hardcoding implementations
2. **Single Responsibility**: Each component has one clear purpose
3. **Event-Driven**: EventBus decouples business logic from transport
4. **Type-Safe**: Comprehensive TypeScript types throughout
5. **Fail-Safe**: Graceful degradation and cleanup on errors
6. **YAGNI**: Start simple, add complexity only when needed

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Single Tenant** | Simpler implementation, one runtime instance per application |
| **Modal Only** | Focus on proving pattern, other sandbox providers can be added later |
| **Adapter Pattern** | More straightforward than plugin system for current needs |
| **In-Process** | Run as standalone Node.js service, not microservices |
| **Socket.io** | Real-time WebSocket transport with room-based broadcasting |
| **EventBus** | Decouple business logic from WebSocket transport layer |

---

## 2. High-Level Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Client Application                     │
│                  (WebSocket Connection)                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              WebSocket Transport Layer                   │
│         (Socket.io + EventBus Integration)               │
│                                                           │
│  • Room-based broadcasting (per session)                 │
│  • Translates EventBus events → WebSocket messages       │
│  • Handles client lifecycle (connect/disconnect)         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    EventBus                              │
│            (Type-Safe Event Emitter)                     │
│                                                           │
│  • Domain events: session_started, message_sent, etc.    │
│  • Decouples producers from consumers                    │
│  • Enables event-driven architecture                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Session Manager                         │
│           (Lifecycle, Idle Monitoring)                   │
│                                                           │
│  • Manages Map<sessionId, AgentSession>                  │
│  • CRUD operations for sessions                          │
│  • Background: idle timeout monitoring                   │
│  • Initialization: fetch all sessions from persistence   │
└────┬────────────────────────────────────────────┬───────┘
     │                                             │
     ▼                                             ▼
┌─────────────────┐                    ┌──────────────────┐
│  Agent Session  │                    │  Agent Session   │
│   (Session 1)   │                    │   (Session N)    │
│                 │                    │                  │
│ • Modal sandbox │                    │ • Modal sandbox  │
│ • Transcripts   │                    │ • Transcripts    │
│ • File sync     │                    │ • File sync      │
│ • Periodic sync │                    │ • Periodic sync  │
└────┬────────────┘                    └──────────────────┘
     │
     │  Uses (Injected Dependencies)
     ▼
┌─────────────────────────────────────────────────────────┐
│                    Adapters (Injected)                   │
├─────────────────────────────────────────────────────────┤
│  SessionPersistenceAdapter                               │
│    • fetchAllSessions()                                  │
│    • loadSession(id)                                     │
│    • saveSession(data)                                   │
│    • syncSession(id, updates)                            │
│    • deleteSession(id)                                   │
│                                                           │
│  StorageBackend                                          │
│    • uploadTranscript(sessionId, content)                │
│    • downloadTranscript(url)                             │
│    • listTranscripts(sessionId)                          │
│    • saveFile(sessionId, path, content)                  │
│    • listFiles(sessionId)                                │
│                                                           │
│  AgentProfileLoader                                      │
│    • loadProfiles()  (returns array, dynamic)            │
│    • getProfile(agentType)                               │
│    • processTemplateVariables(content, vars)             │
│                                                           │
│  SandboxConfigProvider                                   │
│    • getSandboxConfig(agentType, metadata)               │
│    • getMCPServers(agentType)                            │
└────┬────────────────────────────────────────────────────┘
     │
     │  Implements
     ▼
┌─────────────────────────────────────────────────────────┐
│          Application-Specific Implementation             │
│                  (e.g., ticketdrop/)                     │
├─────────────────────────────────────────────────────────┤
│  ConvexPersistenceAdapter                                │
│    • Uses Convex client to query agentSession table     │
│    • Implements SessionPersistenceAdapter interface      │
│                                                           │
│  ConvexStorageBackend                                    │
│    • Uploads transcripts to Convex Storage               │
│    • Stores files in sessionFile table                   │
│    • Implements StorageBackend interface                 │
│                                                           │
│  TicketDropProfileLoader                                 │
│    • Reads from ticketdrop/profiles/ directory           │
│    • Supports template variables: SESSION_ID, MARKET_KEY │
│    • Implements AgentProfileLoader interface             │
│                                                           │
│  TicketDropSandboxConfig                                 │
│    • Provides CONVEX_URL, AGENT_TD_KEY env vars          │
│    • Configures fetch_events MCP tool                    │
│    • Implements SandboxConfigProvider interface          │
│                                                           │
│  Custom MCP Tools                                        │
│    • fetch_events - queries Convex for event data        │
│    • Packaged as sandbox bootstrap file                  │
└─────────────────────────────────────────────────────────┘

             External Dependencies
┌──────────────────┐          ┌──────────────────┐
│  Modal Sandboxes │          │  Storage Backend │
│  (Code Execution)│          │  (e.g., Convex)  │
│                  │          │                  │
│ • Node.js 22     │          │ • Sessions       │
│ • Claude SDK     │          │ • Files          │
│ • MCP tools      │          │ • Transcripts    │
└──────────────────┘          └──────────────────┘
```

### Layer Responsibilities

**Transport Layer** (`src/transport/`)
- WebSocket server (Socket.io)
- Client connection management
- Event translation (EventBus ↔ WebSocket)
- Room-based broadcasting

**Core Layer** (`src/core/`)
- EventBus: Type-safe event emitter
- SessionManager: Session lifecycle management
- AgentSession: Individual session orchestration

**Services Layer** (`src/services/`)
- AgentSDKService: Execute Claude SDK in sandbox
- SessionFileManager: Filesystem operations
- TranscriptParser: JSONL parsing and filtering

**Adapters Layer** (`src/adapters/`)
- Modal: Sandbox creation and management
- Interfaces for persistence, storage, profiles, config

**Application Layer** (`ticketdrop/`)
- Implements all adapter interfaces
- Provides application-specific MCP tools
- Agent profile configurations
- Main entry point

---

## 3. Core Abstractions

### 3.1 SessionPersistenceAdapter

**Responsibility:** Abstract all session CRUD operations, decoupling from specific database

```typescript
/**
 * Session data structure
 * Generic metadata field allows application-specific data
 */
interface SessionData {
  _id: string;                           // Unique session identifier
  _creationTime: number;                 // Unix timestamp
  status: "active" | "completed" | "failed";
  lastActivity: number;                  // Unix timestamp
  metadata: Record<string, unknown>;     // Extensible: marketKey, agentType, etc.
}

/**
 * Session persistence adapter interface
 * Applications implement this to use their own database
 */
interface SessionPersistenceAdapter {
  /**
   * Fetch all sessions (active and inactive) for initialization
   * Called once when SessionManager starts
   *
   * @returns All sessions in the database
   */
  fetchAllSessions(): Promise<SessionData[]>;

  /**
   * Load a specific session by ID with all metadata
   * Called when resuming a session
   *
   * @param sessionId - Unique session identifier
   * @returns Session data or null if not found
   */
  loadSession(sessionId: string): Promise<SessionData | null>;

  /**
   * Save a new session to persistence
   * Called when creating a new session
   *
   * @param session - Session data without _id and _creationTime
   * @returns Generated session ID
   */
  saveSession(
    session: Omit<SessionData, '_id' | '_creationTime'>
  ): Promise<string>;

  /**
   * Update an existing session (partial updates supported)
   * Called periodically to sync activity, status changes
   *
   * @param sessionId - Session to update
   * @param updates - Partial session data to merge
   */
  syncSession(
    sessionId: string,
    updates: Partial<Omit<SessionData, '_id' | '_creationTime'>>
  ): Promise<void>;

  /**
   * Delete a session permanently
   * Called when session is terminated
   *
   * @param sessionId - Session to delete
   */
  deleteSession(sessionId: string): Promise<void>;
}
```

**Design Decisions:**
- **Generic metadata**: `Record<string, unknown>` allows applications to store custom fields (marketKey, agentType, userId, etc.) without changing the interface
- **Partial updates**: `syncSession` uses `Partial<>` for efficiency (don't rewrite entire session on every sync)
- **Async by default**: All methods return Promises to support both local (files) and remote (database) backends
- **Omit pattern**: `saveSession` omits `_id` and `_creationTime` as they're generated by the backend

**TicketDrop Implementation Example:**
```typescript
// ticketdrop/adapters/convex-persistence.ts
class ConvexPersistenceAdapter implements SessionPersistenceAdapter {
  async saveSession(session: Omit<SessionData, '_id' | '_creationTime'>) {
    return await this.convex.mutation('apis/agents/sessions:create', {
      apiKey: this.apiKey,
      marketKey: session.metadata.marketKey,
      agentType: session.metadata.agentType,
      status: session.status,
    });
  }

  // ... other methods
}
```

---

### 3.2 StorageBackend

**Responsibility:** Abstract file and transcript storage, supporting various storage solutions

```typescript
/**
 * Regular file metadata (non-transcript)
 */
interface FileMetadata {
  path: string;           // Relative path in workspace
  content: string;        // File contents
  sessionId: string;      // Owner session
  lastModified: number;   // Unix timestamp
}

/**
 * Transcript metadata (JSONL logs)
 */
interface TranscriptMetadata {
  sessionId: string;      // Owner session
  subagentId?: string;    // Undefined for main transcript
  url: string;            // Storage URL (blob storage, CDN, etc.)
  uploadedAt: number;     // Unix timestamp
}

/**
 * Storage backend adapter interface
 * Separates transcript storage (large, append-only) from regular files
 */
interface StorageBackend {
  /**
   * Upload a transcript file and return storage URL
   * Transcripts are JSONL format, potentially large
   *
   * @param sessionId - Owner session
   * @param content - JSONL transcript content
   * @param subagentId - Optional subagent identifier
   * @returns Storage URL for later download
   */
  uploadTranscript(
    sessionId: string,
    content: string,
    subagentId?: string
  ): Promise<string>;

  /**
   * Download transcript content from storage URL
   *
   * @param url - Storage URL from uploadTranscript
   * @returns Transcript content (JSONL)
   */
  downloadTranscript(url: string): Promise<string>;

  /**
   * List all transcript URLs for a session
   * Includes main transcript and all subagent transcripts
   *
   * @param sessionId - Session to query
   * @returns Array of transcript metadata
   */
  listTranscripts(sessionId: string): Promise<TranscriptMetadata[]>;

  /**
   * Save a regular file (non-transcript)
   * For workspace files modified by the agent
   *
   * @param sessionId - Owner session
   * @param path - Relative path in workspace
   * @param content - File contents
   */
  saveFile(
    sessionId: string,
    path: string,
    content: string
  ): Promise<void>;

  /**
   * List all regular files for a session
   * Used when resuming to restore workspace
   *
   * @param sessionId - Session to query
   * @returns Array of file metadata with contents
   */
  listFiles(sessionId: string): Promise<FileMetadata[]>;

  /**
   * Delete all files and transcripts for a session
   * Called during cleanup
   *
   * @param sessionId - Session to clean up
   */
  deleteSessionFiles(sessionId: string): Promise<void>;
}
```

**Design Decisions:**
- **Separate transcript storage**: Transcripts are often large and append-only, may benefit from blob storage (S3, Convex Storage, etc.)
- **Regular files in database**: Smaller workspace files can go in database for simpler querying
- **URL-based transcripts**: Return storage URL instead of content, supports CDN, signed URLs, etc.
- **Subagent support**: Track subagent transcripts separately for proper resume

**Alternative Storage Implementations:**
```typescript
// File-based implementation
class FileSystemStorageBackend implements StorageBackend {
  constructor(private baseDir: string) {}

  async uploadTranscript(sessionId: string, content: string) {
    const path = `${this.baseDir}/${sessionId}/transcript.jsonl`;
    await fs.writeFile(path, content);
    return `file://${path}`;
  }
}

// S3-based implementation
class S3StorageBackend implements StorageBackend {
  async uploadTranscript(sessionId: string, content: string) {
    const key = `sessions/${sessionId}/transcript.jsonl`;
    await this.s3.putObject({ Bucket: this.bucket, Key: key, Body: content });
    return `s3://${this.bucket}/${key}`;
  }
}
```

---

### 3.3 AgentProfileLoader

**Responsibility:** Load agent configurations dynamically from any source

```typescript
/**
 * Complete agent profile definition
 */
interface AgentProfile {
  agentType: string;           // Unique identifier (e.g., "event-researcher")
  displayName: string;         // Human-readable name
  systemPrompt: string;        // Main system prompt for the agent
  claudeConfig: ClaudeConfig;  // .claude directory structure
  mcpServers: MCPServerConfig[]; // MCP tools available to this agent
  templateVariables?: Record<string, string>; // Default template vars
}

/**
 * Claude configuration (.claude directory)
 */
interface ClaudeConfig {
  files: Array<{
    path: string;    // Relative to .claude/ (e.g., "agents/researcher.md")
    content: string; // File contents
  }>;
  workspaceFiles?: Array<{
    path: string;    // Relative to workspace root (e.g., "CLAUDE.md")
    content: string; // File contents
  }>;
}

/**
 * MCP server configuration
 */
interface MCPServerConfig {
  name: string;                          // MCP server identifier
  command?: string;                      // Command-based: executable path
  args?: string[];                       // Command arguments
  env?: Record<string, string>;          // Environment variables
  implementation?: string;               // Code-based: path to JS file in sandbox
}

/**
 * Agent profile loader adapter interface
 * Applications implement this to load profiles from their preferred source
 */
interface AgentProfileLoader {
  /**
   * Load all available agent profiles
   * Called at runtime initialization to discover available agents
   * Returns array (not single hardcoded profile)
   *
   * @returns All available agent profiles
   */
  loadProfiles(): Promise<AgentProfile[]>;

  /**
   * Get a specific profile by agent type
   * Called when creating a new session
   *
   * @param agentType - Agent type identifier
   * @returns Agent profile configuration
   * @throws Error if agent type not found
   */
  getProfile(agentType: string): Promise<AgentProfile>;

  /**
   * Apply template variables to profile content
   * Replaces {{VARIABLE_NAME}} with values
   *
   * @param content - Content with template variables
   * @param variables - Variable values to replace
   * @returns Processed content
   */
  processTemplateVariables(
    content: string,
    variables: Record<string, string>
  ): string;
}
```

**Design Decisions:**
- **Multiple profiles**: `loadProfiles()` returns array, not single hardcoded profile
- **Dynamic loading**: Profiles can come from files, database, API, etc.
- **MCP servers per-profile**: Each agent type can have different tools
- **Template variable system**: Extensible replacement ({{SESSION_ID}}, {{MARKET_KEY}}, custom vars)
- **Workspace files**: Support files at workspace root (e.g., CLAUDE.md) in addition to .claude/

**TicketDrop Implementation Example:**
```typescript
// ticketdrop/adapters/profile-loader.ts
class TicketDropProfileLoader implements AgentProfileLoader {
  async loadProfiles(): Promise<AgentProfile[]> {
    const profileDirs = await fs.readdir('./ticketdrop/profiles');

    return Promise.all(profileDirs.map(async (dir) => {
      const claudeFiles = await this.readClaudeDir(`./ticketdrop/profiles/${dir}/.claude`);
      const systemPrompt = await fs.readFile(`./ticketdrop/profiles/${dir}/CLAUDE.md`, 'utf-8');

      return {
        agentType: dir,
        displayName: this.getDisplayName(dir),
        systemPrompt,
        claudeConfig: { files: claudeFiles },
        mcpServers: this.getMCPServersForAgent(dir),
        templateVariables: {
          AGENT_TYPE: dir,
        },
      };
    }));
  }

  processTemplateVariables(content: string, vars: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] || match);
  }
}
```

---

### 3.4 SandboxConfigProvider

**Responsibility:** Provide sandbox environment configuration per agent type

```typescript
/**
 * Sandbox configuration
 */
interface SandboxConfig {
  // Modal image configuration
  imageTag: string;              // Modal image tag
  cpuCount?: number;             // CPU cores (default: 1)
  memoryMB?: number;             // Memory in MB (default: 2048)
  timeoutSeconds?: number;       // Execution timeout (default: 3600)

  // Environment variables injected into sandbox
  // Allows applications to pass API keys, endpoints, etc.
  environmentVariables: Record<string, string>;

  // NPM dependencies to install
  // Allows custom packages per agent type
  dependencies?: string[];

  // Files to copy into sandbox before execution
  // Useful for MCP tool implementations
  bootstrapFiles?: Array<{
    path: string;     // Destination in sandbox
    content: string;  // File content
  }>;
}

/**
 * Sandbox config provider adapter interface
 * Applications implement this to configure sandbox environment
 */
interface SandboxConfigProvider {
  /**
   * Get sandbox configuration for an agent type
   *
   * @param agentType - Agent type identifier
   * @param metadata - Session metadata (may contain config hints)
   * @returns Sandbox configuration
   */
  getSandboxConfig(
    agentType: string,
    metadata: Record<string, unknown>
  ): Promise<SandboxConfig>;

  /**
   * Get MCP server configurations for this agent
   * Separate from AgentProfileLoader to allow dynamic MCP tools
   * based on session context (e.g., different tools per market)
   *
   * @param agentType - Agent type identifier
   * @returns MCP server configurations
   */
  getMCPServers(agentType: string): Promise<MCPServerConfig[]>;
}
```

**Design Decisions:**
- **Environment variables**: Applications can inject secrets, API keys, configuration URLs
- **Bootstrap files**: Support copying MCP tool implementations into sandbox
- **Session context**: Accept `metadata` parameter to allow per-session customization
- **Dynamic MCP servers**: `getMCPServers` can return different tools based on context

**TicketDrop Implementation Example:**
```typescript
// ticketdrop/adapters/sandbox-config.ts
class TicketDropSandboxConfig implements SandboxConfigProvider {
  async getSandboxConfig(
    agentType: string,
    metadata: Record<string, unknown>
  ): Promise<SandboxConfig> {
    return {
      imageTag: 'ticketdrop-agent-runtime',
      environmentVariables: {
        CONVEX_URL: this.convexUrl,
        AGENT_TD_KEY: this.agentKey,
        MARKET_KEY: metadata.marketKey as string,
      },
      bootstrapFiles: [
        {
          path: '/app/mcp-tools/fetch-events.js',
          content: await fs.readFile('./ticketdrop/mcp-tools/fetch-events.ts', 'utf-8'),
        },
      ],
    };
  }

  async getMCPServers(agentType: string): Promise<MCPServerConfig[]> {
    return [
      {
        name: 'convex-events',
        implementation: '/app/mcp-tools/fetch-events.js',
        env: {
          CONVEX_URL: this.convexUrl,
          AGENT_TD_KEY: this.agentKey,
        },
      },
    ];
  }
}
```

---

## 4. Directory Structure

### Proposed Structure

```
apps/agent-service/
├── docs/                              # Documentation
│   ├── README.md                     # Docs index
│   ├── PRD.md                        # Product requirements
│   └── DESIGN.md                     # This document
│
├── src/                               # Generic runtime (future npm package)
│   ├── types/                        # TypeScript interfaces
│   │   ├── adapters.ts              # All adapter interfaces
│   │   ├── config.ts                # RuntimeConfig interface
│   │   ├── events.ts                # Generic EventBus events
│   │   └── index.ts                 # Re-export all types
│   │
│   ├── core/                         # Core orchestration
│   │   ├── event-bus.ts             # Type-safe event emitter
│   │   ├── session-manager.ts       # Manages all sessions
│   │   ├── agent-session.ts         # Individual session lifecycle
│   │   └── index.ts
│   │
│   ├── services/                     # Business logic services
│   │   ├── agent-sdk.ts             # Claude SDK execution
│   │   ├── file-manager.ts          # Filesystem operations
│   │   ├── transcript-parser.ts     # JSONL parsing
│   │   └── index.ts
│   │
│   ├── adapters/                     # Infrastructure adapters
│   │   ├── modal/                   # Modal-specific code
│   │   │   ├── client.ts           # Modal client setup
│   │   │   ├── sandbox.ts          # Sandbox CRUD operations
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── transport/                    # Client communication
│   │   ├── websocket/
│   │   │   ├── server.ts           # Socket.io server
│   │   │   ├── handlers.ts         # WebSocket event handlers
│   │   │   ├── events.ts           # Event translation logic
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── config/                       # Generic configuration
│   │   ├── logger.ts                # Pino logger setup
│   │   └── index.ts
│   │
│   ├── runtime.ts                    # Main runtime factory
│   └── index.ts                      # Public API exports
│
├── ticketdrop/                       # TicketDrop implementation
│   ├── adapters/                    # TicketDrop adapter implementations
│   │   ├── convex-persistence.ts   # SessionPersistenceAdapter
│   │   ├── convex-storage.ts       # StorageBackend
│   │   ├── profile-loader.ts       # AgentProfileLoader
│   │   ├── sandbox-config.ts       # SandboxConfigProvider
│   │   └── index.ts
│   │
│   ├── mcp-tools/                   # TicketDrop-specific MCP tools
│   │   ├── fetch-events.ts         # Event query tool
│   │   └── index.ts
│   │
│   ├── profiles/                    # Agent configs (moved from agent-configs/)
│   │   ├── event-researcher/
│   │   │   ├── .claude/
│   │   │   │   ├── agents/
│   │   │   │   │   └── event-researcher.md
│   │   │   │   └── CLAUDE.md
│   │   │   └── CLAUDE.md           # Workspace root CLAUDE.md
│   │   └── copywriter/
│   │       └── CLAUDE.md
│   │
│   ├── config/                      # TicketDrop configuration
│   │   ├── environment.ts          # Env var validation (Zod)
│   │   └── constants.ts            # TicketDrop constants
│   │
│   └── index.ts                     # Main entry point
│
├── sandbox/                          # Sandbox execution environment
│   ├── execute-sdk-query.ts         # SDK executor (generic, updated)
│   ├── Dockerfile                   # Base sandbox image
│   └── package.json                 # Sandbox dependencies
│
├── tests/                            # Tests
│   ├── integration/
│   ├── unit/
│   └── fixtures/
│
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Import Rules

**Strict boundaries to enforce separation:**

1. **`src/` imports**:
   - ✅ Can import from other `src/` modules
   - ✅ Can import external npm packages
   - ❌ CANNOT import from `ticketdrop/`
   - ❌ CANNOT import Convex client or TicketDrop-specific code

2. **`ticketdrop/` imports**:
   - ✅ Can import from `src/` (treating it as external package)
   - ✅ Can import Convex, TicketDrop-specific packages
   - ✅ Can import external npm packages
   - ❌ Should minimize imports between ticketdrop modules

3. **`sandbox/` imports**:
   - Generic sandbox code (execute-sdk-query.ts) can't import from ticketdrop/
   - TicketDrop-specific code injected via bootstrap files

**Enforcement:**
- TypeScript path aliases: `"@runtime/*": ["src/*"]`
- ESLint rule: No imports from ticketdrop/ in src/
- Import analysis in CI/CD

---

## 5. Data Flow

### 5.1 Session Creation Flow

```
┌────────┐         ┌──────────┐       ┌────────────┐      ┌──────────┐       ┌─────────┐
│ Client │         │WebSocket │       │  Session   │      │  Agent   │       │Adapters │
│        │         │ Server   │       │  Manager   │      │ Session  │       │         │
└───┬────┘         └────┬─────┘       └─────┬──────┘      └────┬─────┘       └────┬────┘
    │                   │                   │                   │                  │
    │ create_session    │                   │                   │                  │
    ├──────────────────>│                   │                   │                  │
    │                   │ createSession()   │                   │                  │
    │                   ├──────────────────>│                   │                  │
    │                   │                   │ new AgentSession  │                  │
    │                   │                   ├──────────────────>│                  │
    │                   │                   │                   │ getProfile(type) │
    │                   │                   │                   ├─────────────────>│
    │                   │                   │                   │  AgentProfile    │
    │                   │                   │                   │<─────────────────┤
    │                   │                   │                   │                  │
    │                   │                   │                   │getSandboxConfig()│
    │                   │                   │                   ├─────────────────>│
    │                   │                   │                   │ SandboxConfig    │
    │                   │                   │                   │<─────────────────┤
    │                   │                   │                   │                  │
    │                   │                   │                   │ createSandbox()  │
    │                   │                   │                   ├─────────────────>│ Modal
    │                   │                   │                   │   sandbox ID     │
    │                   │                   │                   │<─────────────────┤
    │                   │                   │                   │                  │
    │                   │                   │                   │  setupFiles()    │
    │                   │                   │                   ├─────────────────>│
    │                   │                   │                   │    success       │
    │                   │                   │                   │<─────────────────┤
    │                   │                   │                   │                  │
    │                   │                   │                   │  saveSession()   │
    │                   │                   │                   ├─────────────────>│
    │                   │                   │                   │   session ID     │
    │                   │                   │                   │<─────────────────┤
    │                   │                   │  AgentSession     │                  │
    │                   │                   │<──────────────────┤                  │
    │                   │ session_created   │                   │                  │
    │                   │<──────────────────┤ (EventBus)        │                  │
    │ session_created   │                   │                   │                  │
    │<──────────────────┤                   │                   │                  │
    │                   │                   │                   │                  │
```

**Steps:**
1. Client sends `create_session` WebSocket message
2. WebSocket handler calls `SessionManager.createSession()`
3. SessionManager creates new `AgentSession` instance
4. AgentSession requests agent profile from `AgentProfileLoader`
5. AgentSession requests sandbox config from `SandboxConfigProvider`
6. AgentSession creates Modal sandbox via Modal adapter
7. AgentSession sets up filesystem (claude configs, workspace files)
8. AgentSession saves initial session state via `SessionPersistenceAdapter`
9. EventBus emits `session_created` event
10. WebSocket translates to `session_created` message for client

---

### 5.2 Message Send Flow

```
┌────────┐       ┌──────────┐      ┌──────────┐      ┌───────────┐      ┌────────┐
│ Client │       │WebSocket │      │  Agent   │      │    SDK    │      │Sandbox │
│        │       │ Server   │      │ Session  │      │  Service  │      │ (Modal)│
└───┬────┘       └────┬─────┘      └────┬─────┘      └─────┬─────┘      └───┬────┘
    │                 │                  │                  │                │
    │ send_message    │                  │                  │                │
    ├────────────────>│                  │                  │                │
    │                 │ sendMessage()    │                  │                │
    │                 ├─────────────────>│                  │                │
    │                 │                  │ executeQuery()   │                │
    │                 │                  ├─────────────────>│                │
    │                 │                  │                  │ exec()         │
    │                 │                  │                  ├───────────────>│
    │                 │                  │                  │                │ Claude
    │                 │                  │                  │ JSONL stream   │ SDK
    │                 │                  │                  │<───────────────┤
    │                 │                  │ message chunk    │                │
    │                 │                  │<─────────────────┤                │
    │                 │ message_chunk    │                  │                │
    │                 │<─────────────────┤ (EventBus)       │                │
    │ message_chunk   │                  │                  │                │
    │<────────────────┤                  │                  │                │
    │                 │                  │                  │                │
    │                 │                  │ syncToConvex()   │                │
    │                 │                  ├──────────────────────────────────>│ Storage
    │                 │                  │                  │                │
```

**Steps:**
1. Client sends `send_message` with user input
2. WebSocket handler calls `AgentSession.sendMessage()`
3. AgentSession calls `AgentSDKService.executeQuery()`
4. SDK Service executes SDK in Modal sandbox
5. Claude SDK streams JSONL messages
6. SDK Service parses and emits chunks via EventBus
7. WebSocket translates to client messages in real-time
8. After completion, AgentSession syncs state to storage

---

### 5.3 Session Resume Flow

```
┌────────┐       ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌─────────┐
│ Client │       │WebSocket │      │ Session  │      │  Agent   │      │Adapters │
│        │       │ Server   │      │ Manager  │      │ Session  │      │         │
└───┬────┘       └────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬────┘
    │                 │                  │                  │                 │
    │ resume_session  │                  │                  │                 │
    ├────────────────>│                  │                  │                 │
    │                 │ loadSession()    │                  │                 │
    │                 ├─────────────────>│                  │                 │
    │                 │                  │new AgentSession  │                 │
    │                 │                  ├─────────────────>│                 │
    │                 │                  │                  │loadSession(id)  │
    │                 │                  │                  ├────────────────>│
    │                 │                  │                  │  SessionData    │
    │                 │                  │                  │<────────────────┤
    │                 │                  │                  │                 │
    │                 │                  │                  │listTranscripts()│
    │                 │                  │                  ├────────────────>│
    │                 │                  │                  │  URLs           │
    │                 │                  │                  │<────────────────┤
    │                 │                  │                  │                 │
    │                 │                  │                  │downloadTranscript│
    │                 │                  │                  ├────────────────>│
    │                 │                  │                  │  content        │
    │                 │                  │                  │<────────────────┤
    │                 │                  │                  │                 │
    │                 │                  │                  │  listFiles()    │
    │                 │                  │                  ├────────────────>│
    │                 │                  │                  │ FileMetadata[]  │
    │                 │                  │                  │<────────────────┤
    │                 │                  │                  │                 │
    │                 │                  │                  │createSandbox()  │
    │                 │                  │                  ├────────────────>│ Modal
    │                 │                  │                  │                 │
    │                 │                  │                  │restoreFiles()   │
    │                 │                  │                  ├────────────────>│
    │                 │                  │  AgentSession    │                 │
    │                 │                  │<─────────────────┤                 │
    │                 │ session_resumed  │                  │                 │
    │                 │<─────────────────┤ (EventBus)       │                 │
    │ session_resumed │                  │                  │                 │
    │<────────────────┤                  │                  │                 │
```

**Steps:**
1. Client sends `resume_session` with session ID
2. WebSocket handler calls `SessionManager.loadSession()`
3. SessionManager creates new AgentSession in resume mode
4. AgentSession loads session metadata from persistence
5. AgentSession lists all transcripts from storage
6. AgentSession downloads all transcript contents
7. AgentSession lists all workspace files
8. AgentSession creates new Modal sandbox
9. AgentSession restores all files to sandbox filesystem
10. AgentSession parses transcripts into in-memory state
11. EventBus emits `session_resumed` event
12. Client can continue conversation from where it left off

---

## 6. Public API Design

### 6.1 Runtime Factory

```typescript
// src/runtime.ts

/**
 * Runtime configuration
 * All required dependencies injected at creation
 */
export interface RuntimeConfig {
  // Required adapters (no defaults)
  persistence: SessionPersistenceAdapter;
  storage: StorageBackend;
  profileLoader: AgentProfileLoader;
  sandboxConfig: SandboxConfigProvider;

  // Modal configuration (required)
  modal: {
    tokenId: string;       // Modal API token ID
    tokenSecret: string;   // Modal API token secret
    appName: string;       // Modal app name
  };

  // Optional runtime configuration
  idleTimeoutMs?: number;    // Default: 900000 (15 min)
  syncIntervalMs?: number;   // Default: 30000 (30 sec)
  websocketPort?: number;    // Default: 3003
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Default: 'info'
}

/**
 * Create and initialize agent runtime
 *
 * @param config - Runtime configuration with all required adapters
 * @returns Initialized runtime instance
 *
 * @example
 * const runtime = await createAgentRuntime({
 *   persistence: new ConvexPersistenceAdapter(...),
 *   storage: new ConvexStorageBackend(...),
 *   profileLoader: new FileProfileLoader('./profiles'),
 *   sandboxConfig: new MyAppSandboxConfig(...),
 *   modal: {
 *     tokenId: process.env.MODAL_TOKEN_ID,
 *     tokenSecret: process.env.MODAL_TOKEN_SECRET,
 *     appName: 'my-app-agents',
 *   },
 * });
 */
export async function createAgentRuntime(
  config: RuntimeConfig
): Promise<AgentRuntime> {
  // Initialize Modal client
  const modalContext = createModalContext(config.modal);

  // Create EventBus
  const eventBus = new EventBus();

  // Create SessionManager with adapters
  const sessionManager = new SessionManager(
    modalContext,
    eventBus,
    {
      persistence: config.persistence,
      storage: config.storage,
      profileLoader: config.profileLoader,
      sandboxConfig: config.sandboxConfig,
    },
    {
      idleTimeoutMs: config.idleTimeoutMs ?? 900000,
      syncIntervalMs: config.syncIntervalMs ?? 30000,
    }
  );

  // Initialize (fetch all sessions from persistence)
  await sessionManager.initialize();

  // Start background jobs (idle timeout monitoring)
  sessionManager.startBackgroundJobs();

  return {
    sessionManager,
    eventBus,
    createWebSocketServer: (httpServer) => {
      return createWebSocketServer(httpServer, sessionManager, eventBus);
    },
    start: async () => {
      // Any additional startup tasks
    },
    shutdown: async () => {
      await sessionManager.shutdown();
    },
    isHealthy: () => {
      return sessionManager.isHealthy();
    },
  };
}

/**
 * Agent runtime instance
 * Provides access to core components and lifecycle methods
 */
export interface AgentRuntime {
  // Core components
  sessionManager: SessionManager;
  eventBus: EventBus;

  // WebSocket server factory
  createWebSocketServer(httpServer: Server): WebSocketServer;

  // Lifecycle
  start(): Promise<void>;
  shutdown(): Promise<void>;

  // Health check
  isHealthy(): boolean;
}
```

---

### 6.2 TicketDrop Entry Point

```typescript
// ticketdrop/index.ts

import { createServer } from 'http';
import { createAgentRuntime } from '../src';
import {
  ConvexPersistenceAdapter,
  ConvexStorageBackend,
  TicketDropProfileLoader,
  TicketDropSandboxConfig,
} from './adapters';
import { config } from './config/environment';

/**
 * Main entry point for TicketDrop agent service
 * Demonstrates how to use the generic runtime with custom adapters
 */
async function main() {
  // Initialize TicketDrop-specific adapters
  const persistence = new ConvexPersistenceAdapter({
    convexUrl: config.CONVEX_URL,
    agentKey: config.AGENT_TD_KEY,
  });

  const storage = new ConvexStorageBackend({
    convexUrl: config.CONVEX_URL,
    agentKey: config.AGENT_TD_KEY,
  });

  const profileLoader = new TicketDropProfileLoader({
    profilesDir: './ticketdrop/profiles',
  });

  const sandboxConfig = new TicketDropSandboxConfig({
    convexUrl: config.CONVEX_URL,
    agentKey: config.AGENT_TD_KEY,
  });

  // Create runtime with TicketDrop adapters
  const runtime = await createAgentRuntime({
    persistence,
    storage,
    profileLoader,
    sandboxConfig,
    modal: {
      tokenId: config.MODAL_TOKEN_ID,
      tokenSecret: config.MODAL_TOKEN_SECRET,
      appName: 'ticketdrop-agent-service',
    },
    websocketPort: 3003,
    logLevel: config.LOG_LEVEL,
  });

  // Create HTTP server for health checks
  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      const healthy = runtime.isHealthy();
      res.writeHead(healthy ? 200 : 503);
      res.end(healthy ? 'OK' : 'Unhealthy');
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  // Attach WebSocket server
  runtime.createWebSocketServer(httpServer);

  // Start runtime
  await runtime.start();

  // Start HTTP server
  httpServer.listen(3003, () => {
    console.log('TicketDrop Agent Service running on port 3003');
    console.log('- WebSocket: ws://localhost:3003');
    console.log('- Health: http://localhost:3003/health');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    await runtime.shutdown();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

---

## 7. Implementation Details

### 7.1 SessionManager Changes

**Before (Current):**
```typescript
// Directly imports and uses Convex adapters
import { getSessions } from '../adapters/convex/sessions';

export class SessionManager {
  async initialize() {
    const sessions = await getSessions();  // Direct Convex call
  }
}
```

**After (Refactored):**
```typescript
// Accepts adapters via constructor
export class SessionManager {
  constructor(
    private modalContext: ModalContext,
    private eventBus: EventBus,
    private adapters: {
      persistence: SessionPersistenceAdapter;
      storage: StorageBackend;
      profileLoader: AgentProfileLoader;
      sandboxConfig: SandboxConfigProvider;
    },
    private config: {
      idleTimeoutMs: number;
      syncIntervalMs: number;
    }
  ) {}

  async initialize(): Promise<void> {
    // Use injected adapter instead of direct Convex call
    const sessions = await this.adapters.persistence.fetchAllSessions();

    // Rest of initialization logic
  }

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    // Pass adapters to AgentSession
    const session = new AgentSession(
      generateId(),
      this.modalContext,
      this.eventBus,
      {
        storage: this.adapters.storage,
        profileLoader: this.adapters.profileLoader,
        sandboxConfig: this.adapters.sandboxConfig,
      },
      request.metadata,
      this.config
    );

    await session.initialize(false);  // false = new session

    // Save to persistence
    await this.adapters.persistence.saveSession({
      status: 'active',
      lastActivity: Date.now(),
      metadata: request.metadata,
    });

    return session;
  }
}
```

---

### 7.2 AgentSession Changes

**Before (Current):**
```typescript
// Hardcoded file paths and Convex calls
export class AgentSession {
  async setupNewSession() {
    // Hardcoded agent-configs/ path
    const configPath = `./agent-configs/${this.agentType}`;

    // Direct Convex calls
    await convexSessions.create(...);
  }
}
```

**After (Refactored):**
```typescript
export class AgentSession {
  constructor(
    private sessionId: string,
    private modalContext: ModalContext,
    private eventBus: EventBus,
    private adapters: {
      storage: StorageBackend;
      profileLoader: AgentProfileLoader;
      sandboxConfig: SandboxConfigProvider;
    },
    private metadata: Record<string, unknown>,
    private config: {
      syncIntervalMs: number;
    }
  ) {}

  async initialize(resume: boolean): Promise<void> {
    if (resume) {
      await this.loadFromStorage();
    } else {
      await this.setupNewSession();
    }
  }

  private async setupNewSession(): Promise<void> {
    const agentType = this.metadata.agentType as string;

    // Get profile from adapter (not hardcoded path)
    const profile = await this.adapters.profileLoader.getProfile(agentType);

    // Get sandbox config from adapter
    const sandboxConfig = await this.adapters.sandboxConfig.getSandboxConfig(
      agentType,
      this.metadata
    );

    // Create Modal sandbox with config
    this.sandbox = await this.modalContext.createSandbox({
      imageTag: sandboxConfig.imageTag,
      env: sandboxConfig.environmentVariables,
    });

    // Setup files from profile
    await this.setupFilesFromProfile(profile);

    // Start periodic sync
    this.startPeriodicSync();
  }

  private async loadFromStorage(): Promise<void> {
    // Use adapters for loading
    const transcripts = await this.adapters.storage.listTranscripts(this.sessionId);
    const files = await this.adapters.storage.listFiles(this.sessionId);

    // Download transcripts
    for (const transcript of transcripts) {
      const content = await this.adapters.storage.downloadTranscript(transcript.url);
      this.transcripts.push(content);
    }

    // Create sandbox and restore files
    // ...
  }

  private async syncToConvex(): Promise<void> {
    // Read all files from sandbox
    const files = await this.fileManager.readAllFiles();

    // Upload transcripts using adapter
    for (const transcript of this.transcripts) {
      await this.adapters.storage.uploadTranscript(
        this.sessionId,
        transcript.content,
        transcript.subagentId
      );
    }

    // Save regular files using adapter
    for (const file of files) {
      await this.adapters.storage.saveFile(
        this.sessionId,
        file.path,
        file.content
      );
    }
  }
}
```

---

### 7.3 Dynamic MCP Server Loading

**Before (Current):**
```typescript
// sandbox/mcp-tools.ts - Hardcoded TicketDrop tool
import { ConvexHttpClient } from 'convex/browser';

export const convexTools = {
  name: 'convex',
  tools: {
    fetch_events: {
      description: 'Fetch events from TicketDrop',
      handler: async (input) => {
        const convex = new ConvexHttpClient(process.env.CONVEX_URL);
        // Hardcoded TicketDrop logic
      },
    },
  },
};
```

**After (Refactored):**
```typescript
// sandbox/execute-sdk-query.ts - Dynamic MCP loading
interface ExecutionConfig {
  workingDirectory: string;
  sessionId: string;
  resume: boolean;
  mcpServers: MCPServerConfig[];  // Injected from adapter
  environmentVariables: Record<string, string>;
}

async function main() {
  // Parse config from command line
  const config: ExecutionConfig = JSON.parse(process.argv[2]);

  // Set environment variables from config
  for (const [key, value] of Object.entries(config.environmentVariables)) {
    process.env[key] = value;
  }

  // Dynamic MCP server registration
  const mcpServers: Record<string, any> = {};

  for (const serverConfig of config.mcpServers) {
    if (serverConfig.implementation) {
      // Code-based: Load from file path
      const impl = await import(serverConfig.implementation);
      mcpServers[serverConfig.name] = impl.default || impl;
    } else if (serverConfig.command) {
      // Command-based: External process
      mcpServers[serverConfig.name] = createCommandMCPServer(serverConfig);
    }
  }

  // Configure SDK with dynamic servers
  const sdk = new AgentSDK({
    workingDirectory: config.workingDirectory,
    mcpServers,  // Dynamic, not hardcoded
    permissionMode: 'acceptEdits',
    budgetLimit: 5.0,
  });

  // Execute query
  if (config.resume) {
    await sdk.resumeSession(config.sessionId);
  } else {
    await sdk.startNewSession();
  }
}
```

---

### 7.4 TicketDrop MCP Tool as Bootstrap File

```typescript
// ticketdrop/mcp-tools/fetch-events.ts
import { MCPServer } from '@anthropic-ai/claude-agent-sdk';
import { ConvexHttpClient } from 'convex/browser';

/**
 * Creates TicketDrop-specific MCP tool for fetching events
 * This file gets injected into the sandbox as a bootstrap file
 */
export function createFetchEventsTool(
  convexUrl: string,
  apiKey: string
): MCPServer {
  const convex = new ConvexHttpClient(convexUrl);

  return {
    name: 'convex-events',
    tools: {
      fetch_events: {
        description: 'Fetch upcoming events for a market from TicketDrop',
        inputSchema: {
          type: 'object',
          properties: {
            marketKey: {
              type: 'string',
              description: 'Market code (e.g., "clt", "nyc")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of events to return',
              default: 50,
            },
            category: {
              type: 'string',
              description: 'Filter by category (optional)',
            },
          },
          required: ['marketKey'],
        },
        handler: async (input) => {
          try {
            const events = await convex.query(
              'apis/agents/events:getUpcomingEvents',
              {
                apiKey,
                marketKey: input.marketKey,
                limit: input.limit ?? 50,
                category: input.category,
              }
            );

            return {
              success: true,
              events,
              count: events.length,
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
            };
          }
        },
      },
    },
  };
}

// Default export for dynamic import in sandbox
export default createFetchEventsTool(
  process.env.CONVEX_URL!,
  process.env.AGENT_TD_KEY!
);
```

```typescript
// ticketdrop/adapters/sandbox-config.ts
export class TicketDropSandboxConfig implements SandboxConfigProvider {
  async getSandboxConfig(
    agentType: string,
    metadata: Record<string, unknown>
  ): Promise<SandboxConfig> {
    // Read MCP tool file
    const mcpToolCode = await fs.readFile(
      './ticketdrop/mcp-tools/fetch-events.ts',
      'utf-8'
    );

    return {
      imageTag: 'ticketdrop-agent-runtime',
      environmentVariables: {
        CONVEX_URL: this.convexUrl,
        AGENT_TD_KEY: this.agentKey,
        MARKET_KEY: metadata.marketKey as string,
      },
      // Bootstrap file: copy MCP tool into sandbox
      bootstrapFiles: [
        {
          path: '/app/mcp-tools/fetch-events.js',
          content: mcpToolCode,
        },
      ],
    };
  }

  async getMCPServers(agentType: string): Promise<MCPServerConfig[]> {
    return [
      {
        name: 'convex-events',
        implementation: '/app/mcp-tools/fetch-events.js',
      },
    ];
  }
}
```

---

## 8. Migration Path

### Phase-by-Phase Implementation

#### Phase 1: Define Interfaces (2-3 hours)

**Goal:** Create all adapter interfaces without changing existing code

**Tasks:**
1. Create `src/types/adapters.ts`:
   - `SessionPersistenceAdapter` interface
   - `StorageBackend` interface
   - `AgentProfileLoader` interface
   - `SandboxConfigProvider` interface
2. Create `src/types/config.ts`:
   - `RuntimeConfig` interface
   - `SandboxConfig` interface
   - `AgentProfile` interface
   - `MCPServerConfig` interface
3. Create `src/types/events.ts`:
   - Generic EventBus event types
   - Remove TicketDrop-specific fields
4. Export all from `src/types/index.ts`

**Success Criteria:**
- All interfaces compile
- No implementation code yet
- Clear JSDoc comments on all interfaces

---

#### Phase 2: Refactor Core Runtime (4-5 hours)

**Goal:** Update core components to use adapters

**Tasks:**
1. **Update SessionManager** (`src/core/session-manager.ts`):
   - Add adapters to constructor signature
   - Replace direct Convex calls with adapter calls
   - Update `initialize()` to use `persistence.fetchAllSessions()`
   - Update `createSession()` to use `persistence.saveSession()`
   - Pass adapters to AgentSession constructor

2. **Update AgentSession** (`src/core/agent-session.ts`):
   - Add adapters to constructor
   - Replace hardcoded paths with `profileLoader.getProfile()`
   - Replace Convex calls with storage adapter
   - Update `syncToConvex()` → `syncToStorage()`
   - Use `sandboxConfig.getSandboxConfig()` for env vars

3. **Update SessionFileManager** (`src/services/file-manager.ts`):
   - Accept `AgentProfileLoader` in constructor
   - Use `profileLoader.getProfile()` instead of reading `agent-configs/`
   - Use `profileLoader.processTemplateVariables()`

4. **Remove Convex imports from `src/`**:
   - Move `src/adapters/convex/` → `ticketdrop/adapters/`
   - Ensure no imports of Convex client in `src/`

5. **Create runtime factory** (`src/runtime.ts`):
   - Implement `createAgentRuntime()` function
   - Accept `RuntimeConfig` with all adapters
   - Return `AgentRuntime` instance

6. **Update `src/index.ts`**:
   - Export all types
   - Export `createAgentRuntime`
   - Export public interfaces only

**Success Criteria:**
- `src/` has zero TicketDrop-specific code
- `src/` has zero Convex imports
- TypeScript compiles (with temporary stub adapters if needed)

---

#### Phase 3: Implement TicketDrop Adapters (3-4 hours)

**Goal:** Create TicketDrop implementations of all adapters

**Tasks:**
1. **Create directory structure**:
   ```
   ticketdrop/
   ├── adapters/
   ├── mcp-tools/
   ├── profiles/  (move agent-configs/ here)
   └── config/
   ```

2. **Implement ConvexPersistenceAdapter** (`ticketdrop/adapters/convex-persistence.ts`):
   - Implement `SessionPersistenceAdapter` interface
   - Use Convex client to call `apis/agents/sessions` endpoints
   - Map generic `SessionData` to/from Convex schema

3. **Implement ConvexStorageBackend** (`ticketdrop/adapters/convex-storage.ts`):
   - Implement `StorageBackend` interface
   - Upload transcripts to Convex Storage
   - Store files in `sessionFile` table
   - Download transcripts from storage URLs

4. **Implement TicketDropProfileLoader** (`ticketdrop/adapters/profile-loader.ts`):
   - Implement `AgentProfileLoader` interface
   - Read profiles from `ticketdrop/profiles/` directory
   - Support template variables: `{{SESSION_ID}}`, `{{MARKET_KEY}}`, etc.
   - Load `.claude/` configs and workspace files

5. **Implement TicketDropSandboxConfig** (`ticketdrop/adapters/sandbox-config.ts`):
   - Implement `SandboxConfigProvider` interface
   - Provide `CONVEX_URL`, `AGENT_TD_KEY`, `MARKET_KEY` env vars
   - Read MCP tool files as bootstrap files
   - Return MCP server configs

6. **Move agent profiles**:
   - Move `agent-configs/` → `ticketdrop/profiles/`
   - Update paths in profile loader

**Success Criteria:**
- All adapters compile and implement interfaces correctly
- TicketDrop-specific code isolated in `ticketdrop/`
- Adapters import from `src/` only (treat as external package)

---

#### Phase 4: Dynamic MCP Server Loading (2-3 hours)

**Goal:** Support dynamic MCP tool registration

**Tasks:**
1. **Update sandbox executor** (`sandbox/execute-sdk-query.ts`):
   - Accept `ExecutionConfig` with `mcpServers` array
   - Accept `environmentVariables` object
   - Dynamically load MCP servers from config
   - Support both code-based and command-based MCP servers
   - Set environment variables before SDK execution

2. **Create TicketDrop MCP tool** (`ticketdrop/mcp-tools/fetch-events.ts`):
   - Extract `fetch_events` tool from hardcoded location
   - Create standalone module that exports MCP server
   - Use environment variables for Convex URL and API key

3. **Update AgentSession sandbox creation**:
   - Pass MCP servers from `sandboxConfig.getMCPServers()`
   - Include in sandbox execution command arguments

**Success Criteria:**
- Sandbox executor has no hardcoded MCP tools
- TicketDrop MCP tool works when injected
- Can theoretically add new MCP tools without changing `src/`

---

#### Phase 5: Create TicketDrop Entry Point (1 hour)

**Goal:** Wire everything together in TicketDrop implementation

**Tasks:**
1. **Create TicketDrop main** (`ticketdrop/index.ts`):
   - Import `createAgentRuntime` from `../src`
   - Instantiate all TicketDrop adapters
   - Call `createAgentRuntime()` with adapters
   - Create HTTP server with health check
   - Attach WebSocket server
   - Handle graceful shutdown

2. **Update package.json**:
   - Change main entry: `"main": "ticketdrop/index.ts"`
   - Or create separate script: `"start:ticketdrop"`

3. **Update environment config** (`ticketdrop/config/environment.ts`):
   - Move TicketDrop-specific env vars here
   - Keep generic env vars in `src/config/`

**Success Criteria:**
- TicketDrop agent-service starts successfully
- All imports from `../src/` work correctly
- Clear separation between generic and specific code

---

#### Phase 6: Testing & Validation (2-3 hours)

**Goal:** Ensure everything works and no regressions

**Tasks:**
1. **Run existing integration tests**:
   - All tests should pass without modification
   - Session creation works
   - Message sending/streaming works
   - Session resume works

2. **Manual testing**:
   - Create event-researcher session
   - Send message with event research request
   - Verify `fetch_events` MCP tool works
   - Check Convex persistence
   - Test session resume

3. **Performance testing**:
   - Benchmark session creation time (should be ~same)
   - Benchmark message streaming latency (should be ~same)
   - Check memory usage (should not increase significantly)

4. **Code quality**:
   - Run TypeScript compiler in strict mode
   - Run linter (ESLint)
   - Verify no TicketDrop imports in `src/` (can write script)
   - Review all JSDoc comments

5. **Documentation updates**:
   - Update main README with new structure
   - Add examples to docs/
   - Update deployment docs if needed

**Success Criteria:**
- All integration tests pass
- Manual testing confirms feature parity
- No performance regression
- Code quality checks pass
- Documentation updated

---

### Rollback Plan

If issues arise during implementation:

**Phase 2 Rollback:**
- Revert core changes
- Keep interfaces (no harm)
- Continue using direct Convex calls

**Phase 3-5 Rollback:**
- Keep `src/` changes
- Remove `ticketdrop/` directory
- Use temporary stub adapters in `src/` directly

**Production Rollback:**
- Git revert to previous commit
- Redeploy old version
- Post-mortem to understand failures

---

## 9. Alternative Approaches Considered

### Alternative 1: Plugin System

**Description:** Use a plugin architecture where each "capability" (persistence, MCP tools, etc.) is a plugin that can be dynamically loaded.

**Approach:**
```typescript
interface Plugin {
  name: string;
  type: 'persistence' | 'storage' | 'mcp' | 'profile';
  initialize(runtime: Runtime): Promise<void>;
}

runtime.registerPlugin(new ConvexPersistencePlugin());
runtime.registerPlugin(new FetchEventsPlugin());
```

**Pros:**
- Maximum flexibility
- Can add new capabilities without changing core
- Plugin marketplace potential
- Dynamic loading/unloading

**Cons:**
- More complex architecture
- Harder to type-check (TypeScript limitations)
- Discovery mechanism needed
- Version compatibility challenges
- Overkill for current needs

**Decision:** ❌ Rejected - Adapter pattern is simpler and sufficient for our use case. Plugin system would be over-engineering.

---

### Alternative 2: Keep Everything in One Codebase with Feature Flags

**Description:** Use feature flags or environment variables to toggle TicketDrop-specific behavior instead of separating code.

**Approach:**
```typescript
if (config.BACKEND_TYPE === 'convex') {
  await convexClient.mutation(...);
} else if (config.BACKEND_TYPE === 'postgres') {
  await postgresClient.query(...);
}
```

**Pros:**
- No refactoring needed
- Simpler short-term
- All code in one place

**Cons:**
- Coupling increases over time
- Hard to maintain as options grow
- Can't extract to reusable package
- Conditional logic throughout codebase
- Type safety issues with different backends

**Decision:** ❌ Rejected - Defeats the purpose of making it generic and reusable. Would create maintenance nightmare.

---

### Alternative 3: Microservices Architecture

**Description:** Split into separate services (session service, sandbox service, persistence service, etc.) communicating via HTTP/gRPC.

**Approach:**
```
┌──────────────┐      ┌─────────────┐      ┌──────────────┐
│   Session    │─────>│   Sandbox   │─────>│ Persistence  │
│   Service    │      │   Service   │      │   Service    │
└──────────────┘      └─────────────┘      └──────────────┘
```

**Pros:**
- Ultimate flexibility
- Language-agnostic (can use different languages)
- Independent scaling
- Clear service boundaries

**Cons:**
- Massive operational complexity
- Network latency between services
- Distributed system challenges (consistency, failure modes)
- More infrastructure (service mesh, load balancers, etc.)
- Over-engineering for current scale

**Decision:** ❌ Rejected - Way too complex for current needs. Single process is much simpler and sufficient.

---

### Alternative 4: Extract to npm Package Immediately

**Description:** Create separate Git repository, publish to npm, make TicketDrop consume from npm immediately.

**Approach:**
```
@agent-runtime/core (npm package)
  ↓ (npm install)
ticketdrop/agent-service (consumes package)
```

**Pros:**
- Forces clean separation from day 1
- Immediately reusable by others
- Versioning built-in
- Clear public API

**Cons:**
- Slows development velocity
- Version management overhead (breaking changes require version bumps)
- Harder to iterate quickly
- Premature for unproven architecture

**Decision:** ❌ Rejected for v1 - Better to prove the pattern works first, then extract later. Setting up the structure (`src/` vs `ticketdrop/`) achieves same separation without overhead.

---

### Alternative 5: Configuration-Only Approach

**Description:** Instead of code adapters, use configuration files to define backend behavior.

**Approach:**
```yaml
# runtime.config.yaml
persistence:
  type: convex
  url: ${CONVEX_URL}
  apiKey: ${AGENT_TD_KEY}

storage:
  type: convex-storage

profiles:
  source: filesystem
  path: ./profiles
```

**Pros:**
- No code needed for simple backends
- Easy to understand
- Can swap backends by changing config

**Cons:**
- Limited flexibility (can't handle complex logic)
- Configuration becomes programming (DSL)
- Still need code for non-trivial adapters
- Harder to debug

**Decision:** ❌ Rejected - Code-based adapters provide more flexibility. Configuration can still be used within adapters, but adapters themselves should be code.

---

## 10. Open Questions & Decisions Needed

### Q1: Error Handling Strategy

**Question:** How should errors from adapters be handled by the runtime?

**Options:**

**A) Bubble Up - Let Caller Handle**
- Runtime throws error immediately
- Application code catches and handles
- Simple, explicit

**B) Retry with Exponential Backoff**
- Runtime automatically retries failed operations
- Configurable retry policy
- More resilient

**C) Emit Error Events, Continue Running**
- Non-critical errors emitted via EventBus
- Runtime continues operating
- Application decides how to handle

**Recommendation:** **A + C**
- Critical errors (session creation fails) → bubble up and fail fast
- Non-critical errors (periodic sync fails) → emit event, retry in background
- Clear distinction: creation/resume = critical, sync = non-critical

**Decision:** TBD (needs stakeholder input)

---

### Q2: Session Metadata Schema Validation

**Question:** Should we validate the structure of session metadata?

**Options:**

**A) No Validation - Fully Dynamic**
- `metadata: Record<string, unknown>` with zero validation
- Maximum flexibility
- No constraints on applications

**B) Optional Zod Schema from Application**
- Application provides Zod schema in RuntimeConfig
- Runtime validates on session create
- Type-safe within application

**C) Required Base Metadata Fields**
- Runtime requires certain fields (e.g., `agentType`)
- Application can add custom fields
- Balances structure with flexibility

**Recommendation:** **B - Optional Zod Schema**
- Applications that want validation can provide schema
- Applications that want flexibility can skip it
- Best of both worlds

**Example:**
```typescript
const runtime = createAgentRuntime({
  // ...
  metadataSchema: z.object({
    agentType: z.string(),
    marketKey: z.string(),
    userId: z.string().optional(),
  }),
});
```

**Decision:** TBD

---

### Q3: MCP Tool Dependency Management

**Question:** How should MCP tool dependencies (npm packages) be installed in the sandbox?

**Options:**

**A) All Dependencies in Base Image**
- Dockerfile includes all possible dependencies
- Fast session startup
- Slow image builds, large images

**B) Dynamic npm Install Per Session**
- `npm install` runs when session created
- Small base image
- Slow session startup (30s+ for install)

**C) Layered Docker Images Per Agent Type**
- Build separate image for each agent type
- Cache dependencies in layers
- Fast startup, reasonable build times
- More complex image management

**Recommendation:** **A for v1, C for future**
- v1: Simple approach, include common deps in base image
- Future: Layer images for optimization once we have many agent types

**Decision:** TBD

---

### Q4: Hot Profile Reloading

**Question:** Should agent profiles be reloadable without restarting the runtime?

**Options:**

**A) No Hot Reload - Load at Session Creation**
- Profiles loaded when `getProfile()` called
- Runtime restart needed to pick up profile changes
- Simple implementation

**B) Yes - Cache with TTL**
- Profile loader caches with expiration
- Periodic refresh or TTL-based
- Can update profiles without restart

**C) Yes - Watch Filesystem**
- Watch profile directories for changes
- Invalidate cache on change
- Real-time updates

**Recommendation:** **A for v1**
- Profiles typically don't change frequently
- Simpler implementation
- Can add caching later if needed
- Profiles are loaded per-session anyway (not global)

**Decision:** TBD

---

### Q5: Sandbox Provider Abstraction

**Question:** Should we abstract Modal away to support other sandbox providers?

**Options:**

**A) No - Modal Only**
- Keep Modal adapter in `src/adapters/modal/`
- Simplest approach
- Can abstract later if needed

**B) Yes - SandboxProvider Interface**
- Create `SandboxProvider` interface
- Modal is one implementation
- Easier to add Docker, Lambda, etc. later

**C) Support Modal + Docker Compose**
- Two concrete implementations
- Practical local development alternative
- More upfront work

**Recommendation:** **A for v1**
- Modal is working well
- No immediate need for alternatives
- Abstraction can be added later if community requests it
- YAGNI principle

**Decision:** TBD

---

## 11. Success Criteria

### Must Have (v1 Launch Criteria)

Before declaring v1 complete:

- ✅ **Functional Parity**: TicketDrop agent-service works identically to current implementation
  - All features work (create, resume, message, MCP tools)
  - No new errors or warnings

- ✅ **Clean Separation**: Zero TicketDrop-specific code in `src/`
  - Verified by code review
  - Import analysis script passes

- ✅ **Import Isolation**: `ticketdrop/` imports from `src/` exclusively
  - No Convex imports in `src/`
  - Verified by linter rules

- ✅ **Type Safety**: All TypeScript types resolve correctly
  - Strict mode enabled
  - No `any` types in public APIs
  - All interfaces fully typed

- ✅ **Test Coverage**: Existing integration tests pass
  - Session creation test
  - Message sending test
  - Resume test
  - MCP tool test

- ✅ **No Regression**: Performance metrics match or exceed current
  - Session creation < 30s
  - Message latency < 500ms
  - Memory usage similar

---

### Should Have (v1 Quality Bar)

Nice to have for v1, but not blockers:

- ✅ **Documentation**: JSDoc comments on all public interfaces
- ✅ **Architecture README**: Overview of system design
- ✅ **Example Implementation**: TicketDrop serves as reference
- ✅ **Error Handling**: Graceful failures for adapter errors
- ✅ **Logging**: Structured logs with context

---

### Could Have (Future Enhancements)

Not planned for v1, but good ideas for future:

- 📋 **Additional Examples**: Filesystem, Postgres adapter examples
- 📋 **Published npm Package**: Extract `src/` to `@agent-runtime/core`
- 📋 **External Documentation Site**: Hosted docs with guides
- 📋 **OpenAPI Spec**: WebSocket protocol documentation
- 📋 **Performance Benchmarks**: Automated performance testing
- 📋 **Multi-Sandbox Providers**: Docker, Lambda support
- 📋 **Plugin System**: More dynamic extensibility

---

## 12. Timeline Estimate

### Total: 12-18 hours (1.5-2 work days for senior engineer)

| Phase | Tasks | Time | Deliverables |
|-------|-------|------|--------------|
| **1. Define Interfaces** | Create all adapter interfaces, RuntimeConfig, types | 2-3 hours | `src/types/adapters.ts`, `src/types/config.ts` |
| **2. Refactor Core** | Update SessionManager, AgentSession, remove Convex from src/ | 4-5 hours | Generic `src/` codebase, `createAgentRuntime()` factory |
| **3. TicketDrop Adapters** | Implement all adapters, move profiles | 3-4 hours | `ticketdrop/adapters/`, `ticketdrop/profiles/` |
| **4. Dynamic MCP** | Update sandbox executor, create TD MCP tool | 2-3 hours | Dynamic MCP loading, `ticketdrop/mcp-tools/` |
| **5. Entry Point** | Wire everything in `ticketdrop/index.ts` | 1 hour | Working TicketDrop implementation |
| **6. Testing** | Integration tests, manual testing, validation | 2-3 hours | All tests pass, docs updated |

### Breakdown by Day

**Day 1 (8 hours):**
- Morning: Phase 1 + Phase 2 start (interfaces + SessionManager)
- Afternoon: Phase 2 finish (AgentSession, runtime factory)
- End of day: `src/` is generic, compiles with stub adapters

**Day 2 (6-8 hours):**
- Morning: Phase 3 (TicketDrop adapters)
- Midday: Phase 4 (MCP loading)
- Afternoon: Phase 5 (entry point) + Phase 6 (testing)
- End of day: Fully working, tested, documented

### Contingency

- Add 25% buffer for unexpected issues: 15-22 hours
- Likely issues: TypeScript type errors, Modal sandbox config, MCP tool loading bugs

---

## 13. Next Steps

1. **✅ Review & Approve PRD + Design Doc**
   - Stakeholder review
   - Resolve open questions
   - Sign off on approach

2. **Create Implementation Tasks**
   - Break down phases into specific tickets
   - Assign to engineer
   - Set up project tracking

3. **Set Up Development Environment**
   - Create feature branch
   - Set up linting rules for import restrictions
   - Prepare test environment

4. **Begin Phase 1**
   - Start with interface definitions
   - Get team review on interfaces
   - Iterate based on feedback

5. **Implement Phase by Phase**
   - Complete each phase fully before moving to next
   - Test at end of each phase
   - Keep main branch working (feature branch development)

6. **Final Review & Merge**
   - Code review
   - Full integration testing
   - Update documentation
   - Merge to main

---

**Document Status:** Draft - Awaiting Review & Approval

**Next Action:** Review with team, resolve open questions, approve for implementation

---

*This design document is a living document and will be updated as implementation progresses.*
