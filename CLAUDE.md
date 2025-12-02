# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a monorepo for an AI agent runtime system that orchestrates AI agents (Claude via Agent SDK, OpenCode) in isolated Modal sandboxes. It provides a Node.js backend runtime and React client library for building applications with AI agents.

## Workspace Structure

- `backend/` - `@hhopkins/agent-runtime` - Node.js runtime for orchestrating agents in Modal sandboxes
- `client/` - `@hhopkins/agent-runtime-react` - React hooks and context for connecting to the runtime
- `example/backend/` - Example server implementation using the runtime
- `example/frontend/` - Example Next.js frontend using the React client

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build individual packages
pnpm build:backend    # Build backend only
pnpm build:client     # Build client only

# Type checking
pnpm check            # Run type-check and lint across all packages

# Run example app (requires built packages)
pnpm dev              # Runs all dev watchers + example app concurrently
pnpm example:backend  # Run example backend only
pnpm example:frontend # Run example frontend only
```

## Architecture

### Backend Runtime (`backend/src/`)

The runtime uses dependency injection - applications provide a `PersistenceAdapter` implementation to integrate with their storage layer.

**Core Layer** (`core/`):
- `runtime.ts` - Factory function `createAgentRuntime()` that initializes the runtime and returns REST/WebSocket server factories
- `session-manager.ts` - Container managing all `AgentSession` instances, handles session lifecycle and idle timeout cleanup
- `agent-session.ts` - Individual session state, manages sandbox lifecycle, file watching, transcript parsing, and periodic sync
- `event-bus.ts` - Domain event pub/sub for session lifecycle events

**Transport Layer** (`transport/`):
- `rest/` - Hono-based REST API for session CRUD operations
- `websocket/` - Socket.IO server for real-time block streaming and session updates

**Agent Architectures** (`lib/agent-architectures/`):
- `claude-sdk/` - Adapter for Claude Agent SDK, parses JSONL transcripts into conversation blocks
- `opencode/` - Adapter for OpenCode agent, parses JSON transcripts into conversation blocks
- `factory.ts` - Factory to get the correct adapter based on `AGENT_ARCHITECTURE_TYPE`

**Sandbox** (`lib/sandbox/`):
- `modal/` - Modal SDK integration for creating isolated sandbox containers
- `base.ts` - `SandboxPrimitive` interface that agent adapters use to interact with sandboxes

### Client Library (`client/src/`)

React integration using Context + Reducer pattern:

**Hooks**:
- `useAgentSession` - Session lifecycle (create/load/destroy), auto-joins WebSocket room
- `useMessages` - Send messages, receive streaming block updates
- `useSessionList` - List all sessions
- `useWorkspaceFiles` - Track files modified by the agent
- `useSubagents` - Track subagent transcripts
- `useEvents` - Access debug event log for monitoring WebSocket events

**Clients**:
- `rest.ts` - REST API client for session operations
- `websocket.ts` - WebSocket manager for real-time events

### Key Types

- `AGENT_ARCHITECTURE_TYPE` = `"claude-agent-sdk" | "opencode"`
- `PersistenceAdapter` - Interface for storage backends (sessions, transcripts, workspace files)
- `ConversationBlock` - Unified block format (UserMessageBlock, AssistantTextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, SystemBlock, SubagentBlock, ErrorBlock)
- `RuntimeSessionData` - Full session state including parsed blocks
- `PersistedSessionData` - Persisted session state with raw transcripts

### Data Flow

1. Client creates session via REST API
2. Runtime creates `AgentSession` (sandbox is NOT created yet - lazy initialization)
3. Client joins WebSocket room for the session
4. First message triggers sandbox creation, then agent execution
5. Agent output streamed as block events via WebSocket (`block_start`, `text_delta`, `block_update`, `block_complete`)
6. Session state periodically synced to `PersistenceAdapter`

## Development Notes

- The runtime requires Modal credentials (`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`) for sandbox creation
- Example app uses `InMemoryPersistenceAdapter` - production apps should implement persistence to a database
- Block types support both Claude SDK and OpenCode: adapters convert native formats to unified `ConversationBlock`
