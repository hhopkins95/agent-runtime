# Workspace File Streaming Debug Session

## Problem
Files written by the agent to the workspace are not being streamed to the client in real-time. Files only appear after a page refresh (via periodic sync), not via WebSocket streaming.

## Root Causes Identified

### Issue 1: Shared AsyncGenerator Iterator (FIXED)
**Status:** ✅ FIXED

The AsyncGenerator iterator from `streamJSONL()` was being shared between:
1. `waitForWatcherReady()` - consumed 'ready' event then exited
2. `streamWorkspaceFileChanges()` - tried to continue from same iterator

When `waitForWatcherReady()` exited, the iterator/stream reader state became invalid.

**Fix Applied:**
- Replaced shared iterator pattern with EventBus + Promise-based ready coordination
- AgentSandbox now emits `session:file:modified` directly to EventBus
- AgentSession listens to EventBus to update internal state
- Added `session:transcript:changed` event to DomainEvents

**Files Modified:**
- `backend/src/core/agent-sandbox.ts` - New consumer functions, removed old streaming methods
- `backend/src/core/agent-session.ts` - Passes eventBus, uses EventBus listeners
- `backend/src/core/event-bus.ts` - Added `session:transcript:changed` event

### Issue 2: Chokidar Not Detecting File Changes (CURRENT)
**Status:** ❌ NOT FIXED

The file watcher uses chokidar with `usePolling: false` (native FS events). In Modal's containerized environment, native filesystem events (`inotify`) don't propagate correctly to the container.

**Evidence from logs:**
```
INFO: Workspace watcher ready
INFO: Transcript watcher ready
INFO: File watchers ready
```
- Watchers start successfully
- No "ended" logs (process stays alive)
- But NO file events are emitted even though agent writes files
- Periodic sync (direct file read) picks up the files correctly

**Proposed Fix:**
In `backend/sandbox/file-watcher.ts`, change:
```typescript
usePolling: false, // Use native FS events (more efficient)
```
To:
```typescript
usePolling: true, // Use polling - required for containerized environments
```

## Architecture After Issue 1 Fix

```
file-watcher.ts (Modal sandbox, stdout JSONL)
    ↓
AgentSandbox consumer loop (startWorkspaceWatcherConsumer)
    ↓ emits to
EventBus: session:file:modified
    ↓
├── AgentSession (listens, updates internal workspaceFiles array)
└── WebSocket bridge (event-listeners.ts, broadcasts to clients)
```

## Key Files

- `backend/sandbox/file-watcher.ts` - File watcher process (runs in Modal sandbox)
- `backend/src/core/agent-sandbox.ts` - Manages sandbox, consumer loops
- `backend/src/core/agent-session.ts` - Session management, EventBus listeners
- `backend/src/core/event-bus.ts` - Domain events
- `backend/src/transport/websocket/event-listeners.ts` - WebSocket broadcasts

## Next Step
Change `usePolling: false` to `usePolling: true` in `backend/sandbox/file-watcher.ts` line ~172.
