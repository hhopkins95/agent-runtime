# Agent Runtime Architecture

This document describes the architecture of the agent runtime system, including data flows, class responsibilities, and the type system.

## Overview

The agent runtime orchestrates AI agents (Claude via Agent SDK, Gemini via CLI) in isolated Modal sandboxes. It provides a backend runtime and React client library for building applications with AI agents.

```mermaid
graph TB
    subgraph Client["Client Application"]
        RC[React Components]
        RH[React Hooks]
        WS_C[WebSocket Client]
        REST_C[REST Client]
    end

    subgraph Runtime["Agent Runtime (Backend)"]
        subgraph Transport["Transport Layer"]
            REST[REST API - Hono]
            WS[WebSocket - Socket.IO]
        end

        subgraph Core["Core Layer"]
            SM[SessionManager]
            AS[AgentSession]
            EB[EventBus]
        end

        subgraph Sandbox["Sandbox Layer"]
            AGS[AgentSandbox]
            AAA[AgentArchitectureAdapter]
            SP[SandboxPrimitive]
        end
    end

    subgraph External["External Services"]
        MODAL[Modal Sandbox]
        PA[PersistenceAdapter]
        DB[(Database)]
    end

    RC --> RH
    RH --> WS_C
    RH --> REST_C
    WS_C <--> WS
    REST_C <--> REST

    REST --> SM
    WS --> SM
    SM --> AS
    AS --> EB
    EB --> WS

    AS --> AGS
    AGS --> AAA
    AGS --> SP
    SP --> MODAL

    SM --> PA
    AS --> PA
    PA --> DB
```

## Core Classes

### SessionManager

**Location:** `backend/src/core/session-manager.ts`

**Responsibility:** Container that orchestrates all agent sessions. Entry point for session operations.

```mermaid
classDiagram
    class SessionManager {
        -loadedSessions: Map~string, AgentSession~
        -modalContext: ModalContext
        -eventBus: EventBus
        -persistenceAdapter: PersistenceAdapter
        +getAllSessions() SessionListItem[]
        +createSession(request) AgentSession
        +loadSession(sessionId) AgentSession
        +unloadSession(sessionId) void
        +getSession(sessionId) AgentSession?
        +isSessionLoaded(sessionId) boolean
        -getRuntimeState(sessionId) SessionRuntimeState
    }
```

**Key Operations:**
- `getAllSessions()` - Fetches from persistence, enriches with runtime state
- `createSession()` - Creates new session, loads into memory (no sandbox yet)
- `loadSession()` - Loads existing session from persistence into memory (no sandbox yet)
- `unloadSession()` - Syncs to persistence, terminates sandbox if exists, removes from memory

### AgentSession

**Location:** `backend/src/core/agent-session.ts`

**Responsibility:** Manages individual session lifecycle, sandbox creation, and message execution.

```mermaid
classDiagram
    class AgentSession {
        +sessionId: string
        -sandbox: AgentSandbox?
        -blocks: ConversationBlock[]
        -workspaceFiles: WorkspaceFile[]
        -subagents: SubagentData[]
        -rawTranscript: string?
        +create(input, deps) AgentSession$
        +sendMessage(message) void
        +getState() RuntimeSessionData
        +getListData() SessionListItem
        +getRuntimeState() SessionRuntimeState
        +destroy() void
        -activateSandbox() void
        -deactivateSandbox() void
    }
```

**Key Operations:**
- `create()` - Static factory, loads data from persistence, parses transcript (no sandbox)
- `sendMessage()` - Creates sandbox if needed, executes agent query
- `activateSandbox()` - Private method to create sandbox on demand
- `deactivateSandbox()` - Terminates sandbox, keeps session in memory
- `destroy()` - Full cleanup (sync + terminate sandbox + ready for removal from SessionManager)

### AgentSandbox

**Location:** `backend/src/core/agent-sandbox.ts`

**Responsibility:** Unified wrapper around Modal sandbox with agent-specific operations.

```mermaid
classDiagram
    class AgentSandbox {
        -sandbox: SandboxPrimitive
        -architectureAdapter: AgentArchitectureAdapter
        -sessionId: string
        +create(props) AgentSandbox$
        +executeQuery(prompt) AsyncGenerator~StreamEvent~
        +streamWorkspaceFileChanges() AsyncGenerator~WorkspaceFile~
        +streamSessionTranscriptChanges() AsyncGenerator~string~
        +heartbeat() number?
        +terminate() void
        +readSessionTranscripts() TranscriptData
        +parseSessionTranscripts() ParsedBlocks
    }
```

### EventBus

**Location:** `backend/src/core/event-bus.ts`

**Responsibility:** Type-safe pub/sub for domain events, decouples business logic from transport.

---

## Type System

### Persistence Layer Types

These types are used by the `PersistenceAdapter` and represent what's stored in the database.

```mermaid
classDiagram
    class PersistedSessionListData {
        +sessionId: string
        +type: AGENT_ARCHITECTURE_TYPE
        +agentProfileReference: string
        +name?: string
        +createdAt?: number
        +lastActivity?: number
        +metadata?: Record~string, unknown~
    }

    class PersistedSessionData {
        +rawTranscript?: string
        +subagents?: SubagentTranscript[]
        +workspaceFiles: WorkspaceFile[]
    }

    PersistedSessionListData <|-- PersistedSessionData
```

**Key Point:** No `status` field. The transcript is the source of truth for session state.

### Runtime Layer Types

These types are returned to clients and include runtime-derived state.

```mermaid
classDiagram
    class SessionRuntimeState {
        +isLoaded: boolean
        +sandbox: SandboxState?
    }

    class SandboxState {
        +sandboxId: string
        +status: SandboxStatus
        +restartCount: number
        +lastHealthCheck: number
    }

    class SessionListItem {
        +sessionId: string
        +type: AGENT_ARCHITECTURE_TYPE
        +agentProfileReference: string
        +name?: string
        +createdAt?: number
        +lastActivity?: number
        +runtime: SessionRuntimeState
    }

    class RuntimeSessionData {
        +blocks: ConversationBlock[]
        +workspaceFiles: WorkspaceFile[]
        +subagents: SubagentData[]
    }

    SessionListItem <|-- RuntimeSessionData
    SessionListItem *-- SessionRuntimeState
    SessionRuntimeState *-- SandboxState
```

### Type Definitions

```typescript
// Sandbox status values
type SandboxStatus = 'starting' | 'ready' | 'unhealthy' | 'terminated';

// Runtime state (never persisted)
interface SessionRuntimeState {
  isLoaded: boolean;
  sandbox: {
    sandboxId: string;
    status: SandboxStatus;
    restartCount: number;
    lastHealthCheck: number;  // timestamp
  } | null;
}

// What clients see for session lists
interface SessionListItem extends PersistedSessionListData {
  runtime: SessionRuntimeState;
}

// Full session data for clients
interface RuntimeSessionData extends SessionListItem {
  blocks: ConversationBlock[];
  workspaceFiles: WorkspaceFile[];
  subagents: { id: string; blocks: ConversationBlock[] }[];
}
```

---

## Data Flows

### Session Creation Flow

```mermaid
sequenceDiagram
    participant Client
    participant REST
    participant SM as SessionManager
    participant AS as AgentSession
    participant PA as PersistenceAdapter
    participant EB as EventBus

    Client->>REST: POST /api/sessions
    REST->>SM: createSession(request)
    SM->>PA: loadAgentProfile(profileRef)
    PA-->>SM: AgentProfile
    SM->>AS: AgentSession.create(input, deps)
    AS->>PA: (no persistence call - new session)
    Note over AS: Parse empty transcript<br/>No sandbox created
    AS-->>SM: AgentSession instance
    SM->>SM: loadedSessions.set(sessionId, session)
    SM->>PA: createSessionRecord(listData)
    SM->>EB: emit('session:created')
    SM->>EB: emit('sessions:changed')
    SM-->>REST: AgentSession
    REST-->>Client: { sessionId, runtime: { isLoaded: true, sandbox: null } }
```

### Session Load Flow

```mermaid
sequenceDiagram
    participant Client
    participant REST
    participant SM as SessionManager
    participant AS as AgentSession
    participant PA as PersistenceAdapter
    participant Parser as ArchitectureParser

    Client->>REST: GET /api/sessions/:id
    REST->>SM: getSession(sessionId)
    SM-->>REST: null (not loaded)
    REST->>SM: loadSession(sessionId)
    SM->>PA: loadSession(sessionId)
    PA-->>SM: PersistedSessionData
    SM->>AS: AgentSession.create(input, deps)
    AS->>Parser: parseTranscripts(rawTranscript, subagents)
    Note over AS: Parse transcript into blocks<br/>No sandbox created
    Parser-->>AS: { blocks, subagents }
    AS-->>SM: AgentSession instance
    SM->>SM: loadedSessions.set(sessionId, session)
    SM-->>REST: AgentSession
    REST->>AS: getState()
    AS-->>REST: RuntimeSessionData
    REST-->>Client: RuntimeSessionData with runtime state
```

### Send Message Flow (Lazy Sandbox Creation)

```mermaid
sequenceDiagram
    participant Client
    participant REST
    participant SM as SessionManager
    participant AS as AgentSession
    participant AGS as AgentSandbox
    participant Modal
    participant EB as EventBus
    participant WS as WebSocket

    Client->>REST: POST /api/sessions/:id/messages
    REST->>SM: getSession(sessionId)
    SM-->>REST: AgentSession
    REST->>AS: sendMessage(message)

    alt No sandbox exists
        AS->>AS: activateSandbox()
        AS->>EB: emit('session:status', { sandbox: { status: 'starting' } })
        EB->>WS: broadcast to session room
        AS->>AGS: AgentSandbox.create(props)
        AGS->>Modal: Create sandbox
        Modal-->>AGS: Sandbox instance
        AGS->>AGS: Setup transcripts, profile, files
        AGS-->>AS: AgentSandbox
        AS->>EB: emit('session:status', { sandbox: { status: 'ready' } })
    end

    AS->>AGS: executeQuery(message)
    loop Stream events
        AGS-->>AS: StreamEvent
        AS->>EB: emit('session:block:*')
        EB->>WS: broadcast to session room
        WS->>Client: block events
    end
    AS-->>REST: void
    REST-->>Client: 200 OK
```

### Session Unload Flow (Modal Idle Timeout)

```mermaid
sequenceDiagram
    participant Modal
    participant AGS as AgentSandbox
    participant AS as AgentSession
    participant SM as SessionManager
    participant PA as PersistenceAdapter
    participant EB as EventBus

    Note over Modal: Modal idle timeout triggers
    Modal->>Modal: Terminate sandbox

    loop Health check interval
        AS->>AGS: heartbeat()
        AGS->>Modal: poll()
        Modal-->>AGS: exitCode (non-null = terminated)
        AGS-->>AS: exitCode
    end

    Note over AS: Sandbox terminated detected
    AS->>EB: emit('session:status', { sandbox: { status: 'terminated' } })
    AS->>AS: deactivateSandbox()

    Note over SM: Could trigger full unload
    SM->>AS: destroy()
    AS->>PA: saveTranscript()
    AS->>PA: saveWorkspaceFiles()
    AS-->>SM: void
    SM->>SM: loadedSessions.delete(sessionId)
    SM->>EB: emit('session:status', { isLoaded: false, sandbox: null })
```

### List Sessions Flow (Enrichment)

```mermaid
sequenceDiagram
    participant Client
    participant REST
    participant SM as SessionManager
    participant PA as PersistenceAdapter

    Client->>REST: GET /api/sessions
    REST->>SM: getAllSessions()
    SM->>PA: listAllSessions()
    PA-->>SM: PersistedSessionListData[]

    loop For each session
        SM->>SM: getRuntimeState(sessionId)
        Note over SM: Check loadedSessions map<br/>Get sandbox state if loaded
    end

    SM-->>REST: SessionListItem[] (with runtime state)
    REST-->>Client: { sessions: SessionListItem[] }
```

---

## Events

### Domain Events (EventBus)

```typescript
// Unified session status event
'session:status': {
  sessionId: string;
  runtime: SessionRuntimeState;
}

// Block streaming events
'session:block:start': { sessionId, conversationId, block }
'session:block:delta': { sessionId, conversationId, blockId, delta }
'session:block:update': { sessionId, conversationId, blockId, updates }
'session:block:complete': { sessionId, conversationId, blockId, block }

// Workspace events
'session:file:modified': { sessionId, file }

// Session list changed (triggers refetch)
'sessions:changed': void
```

### WebSocket Events (Client-facing)

Same as domain events - the event bridge forwards them to connected clients in the appropriate session rooms.

---

## State Diagram

### Session Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> Persisted: Session created/exists in DB

    Persisted --> Loaded: loadSession()
    Loaded --> Persisted: unloadSession()

    Loaded --> SandboxStarting: sendMessage() [no sandbox]
    SandboxStarting --> SandboxReady: Sandbox initialized

    SandboxReady --> SandboxUnhealthy: Health check failed
    SandboxUnhealthy --> SandboxReady: Sandbox restarted

    SandboxReady --> SandboxTerminated: Modal idle timeout
    SandboxTerminated --> Loaded: deactivateSandbox()
    SandboxTerminated --> Persisted: unloadSession()

    SandboxReady --> SandboxStarting: sendMessage() after terminate

    note right of Persisted
        Data exists in database
        Not loaded in memory
        runtime.isLoaded = false
        runtime.sandbox = null
    end note

    note right of Loaded
        AgentSession in memory
        Blocks parsed
        No active sandbox
        runtime.isLoaded = true
        runtime.sandbox = null
    end note

    note right of SandboxReady
        Active sandbox
        Can execute queries
        Watchers running
        runtime.sandbox.status = 'ready'
    end note
```

---

## Architecture Adapters

The `AgentArchitectureAdapter` interface abstracts the differences between agent architectures (Claude SDK, Gemini CLI).

```mermaid
classDiagram
    class AgentArchitectureAdapter {
        <<interface>>
        +getPaths() Paths
        +identifySessionTranscriptFile(args) FileIdentification
        +setupAgentProfile(args) void
        +setupSessionTranscripts(args) void
        +readSessionTranscripts(args) TranscriptData
        +executeQuery(args) AsyncGenerator~StreamEvent~
        +parseTranscripts(raw, subagents) ParsedBlocks
    }

    class ClaudeSDKAdapter {
        +parseTranscripts(raw, subagents) ParsedBlocks$
    }

    class GeminiCLIAdapter {
        +parseTranscripts(raw, subagents) ParsedBlocks$
    }

    AgentArchitectureAdapter <|.. ClaudeSDKAdapter
    AgentArchitectureAdapter <|.. GeminiCLIAdapter
```

**Static Parsing:** Both adapters have a static `parseTranscripts()` method accessible via `getArchitectureParser(type)` factory function. This allows parsing transcripts without a sandbox.

---

## Persistence Adapter

The `PersistenceAdapter` interface allows applications to integrate with their storage layer.

```typescript
interface PersistenceAdapter {
  // Session operations (no status field)
  listAllSessions(): Promise<PersistedSessionListData[]>;
  loadSession(sessionId: string): Promise<PersistedSessionData | null>;
  createSessionRecord(session: PersistedSessionListData): Promise<void>;
  updateSessionRecord(sessionId: string, updates: Partial<PersistedSessionListData>): Promise<void>;

  // Storage operations
  saveTranscript(sessionId: string, rawTranscript: string, subagentId?: string): Promise<void>;
  saveWorkspaceFile(sessionId: string, file: WorkspaceFile): Promise<void>;
  deleteSessionFile(sessionId: string, path: string): Promise<void>;

  // Agent profile operations
  listAgentProfiles(): Promise<AgentProfileListData[]>;
  loadAgentProfile(agentProfileId: string): Promise<AgentProfile | null>;
}
```

---

## Key Design Decisions

### 1. No Persisted Status Field

**Rationale:** The transcript is the source of truth. Status like "active", "building-sandbox" are transient runtime states that don't make sense to persist.

**Implementation:** Runtime state is derived from:
- Is the session in `loadedSessions` map? → `isLoaded`
- Does the AgentSession have a sandbox? → `sandbox.exists`
- What's the sandbox health? → `sandbox.status`

### 2. Lazy Sandbox Creation

**Rationale:** Modal sandboxes are expensive. We shouldn't create one just to view session history.

**Implementation:**
- `loadSession()` only parses transcript and loads into memory
- `sendMessage()` creates sandbox on-demand via `activateSandbox()`
- Transcript parsing uses static `getArchitectureParser()` - no sandbox needed

### 3. Modal Idle Timeout as Unload Signal

**Rationale:** Long-running async tasks shouldn't be interrupted. Modal knows when a sandbox is truly idle.

**Implementation:**
- Health check detects sandbox termination (exitCode from `poll()`)
- Emits `session:status` with `sandbox.status = 'terminated'`
- Can trigger session unload or just sandbox deactivation

### 4. Type Separation (Persistence vs Runtime)

**Rationale:** Clear boundary between what's stored vs what's computed.

**Implementation:**
- `PersistedSessionListData` / `PersistedSessionData` - no runtime fields
- `SessionListItem` / `RuntimeSessionData` - extends persisted with `runtime: SessionRuntimeState`
- SessionManager enriches persistence data before returning to clients
