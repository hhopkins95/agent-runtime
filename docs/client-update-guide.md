# Client Library Update Guide

This document describes the updates needed for the `@hhopkins/agent-runtime-react` client library to sync with backend changes made in the session data management refactor.

## Overview of Backend Changes

The backend was refactored to:
1. Remove `status` from persisted session data
2. Add `runtime: SessionRuntimeState` to all client-facing session data
3. Implement lazy sandbox creation (sandbox only created on `sendMessage`)
4. Use unified `session:status` event for all runtime state changes

## Type Changes

### Old Types (Deprecated)

```typescript
type SessionStatus = "pending" | "active" | "inactive" | "completed" | "failed" | "building-sandbox";

interface SessionListData {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;
  agentProfileReference: string;
  name?: string;
  status: SessionStatus;  // ❌ REMOVED
  lastActivity?: number;
  createdAt?: number;
}
```

### New Types

```typescript
type SandboxStatus = 'starting' | 'ready' | 'unhealthy' | 'terminated';

interface SessionRuntimeState {
  isLoaded: boolean;
  sandbox: {
    sandboxId: string;
    status: SandboxStatus;
    restartCount: number;
    lastHealthCheck: number;
  } | null;
}

// For session lists
interface SessionListItem {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;
  agentProfileReference: string;
  name?: string;
  lastActivity?: number;
  createdAt?: number;
  runtime: SessionRuntimeState;  // ✅ NEW
}

// For full session data
interface RuntimeSessionData extends SessionListItem {
  blocks: ConversationBlock[];
  workspaceFiles: WorkspaceFile[];
  subagents: { id: string; blocks: ConversationBlock[] }[];
}
```

## WebSocket Event Changes

### `sessions:list` Event

**Before:**
```typescript
socket.on('sessions:list', (sessions: SessionListData[]) => {
  // sessions[0].status === 'active'
});
```

**After:**
```typescript
socket.on('sessions:list', (sessions: SessionListItem[]) => {
  // sessions[0].runtime.isLoaded === true
  // sessions[0].runtime.sandbox?.status === 'ready'
});
```

### `session:status` Event

**Before:**
```typescript
socket.on('session:status', (data: { sessionId: string; status: SessionStatus }) => {
  // data.status === 'active'
});
```

**After:**
```typescript
socket.on('session:status', (data: { sessionId: string; runtime: SessionRuntimeState }) => {
  // data.runtime.isLoaded === true
  // data.runtime.sandbox?.status === 'ready'
});
```

### Removed Events

- `sandbox:status` - Folded into `session:status`
- `session:idle:warning` - Idle timeout now handled by Modal

## REST API Changes

### `POST /api/sessions` Response

**Before:**
```json
{
  "sessionId": "...",
  "status": "active",
  "createdAt": 1234567890
}
```

**After:**
```json
{
  "sessionId": "...",
  "runtime": {
    "isLoaded": true,
    "sandbox": null
  },
  "createdAt": 1234567890
}
```

Note: `sandbox` is `null` because sandbox is created lazily on first `sendMessage`.

### `GET /api/sessions` Response

Returns `SessionListItem[]` with `runtime` field instead of `status`.

### `GET /api/sessions/:id` Response

Returns `RuntimeSessionData` with `runtime` field.

### `DELETE /api/sessions/:id`

Endpoint unchanged, but internally calls `unloadSession` instead of `destroySession`.

## Files to Update in Client

### 1. Type Definitions

Location: `client/src/types/` (or wherever types are defined)

- Add `SandboxStatus` type
- Add `SessionRuntimeState` interface
- Replace `SessionListData` with `SessionListItem`
- Update `RuntimeSessionData` to extend `SessionListItem`
- Remove `SessionStatus` type (or keep as deprecated)

### 2. REST Client

Location: `client/src/rest.ts` (or similar)

- Update response types for session endpoints
- Handle `runtime` field instead of `status`

### 3. WebSocket Client

Location: `client/src/websocket.ts` (or similar)

- Update `sessions:list` handler type
- Update `session:status` handler to use `SessionRuntimeState`
- Remove `sandbox:status` handler if exists
- Remove `session:idle:warning` handler if exists

### 4. Hooks

#### `useSessionList`
- Update to handle `SessionListItem[]` type
- Any UI that showed `status` should now derive state from `runtime`:
  ```typescript
  // Old
  const isActive = session.status === 'active';

  // New
  const isLoaded = session.runtime.isLoaded;
  const hasSandbox = session.runtime.sandbox !== null;
  const sandboxReady = session.runtime.sandbox?.status === 'ready';
  ```

#### `useAgentSession`
- Update to handle `RuntimeSessionData` type
- Update status-related logic to use `runtime` field

### 5. UI Components

Any component that displays session status needs to be updated:

**Old pattern:**
```tsx
{session.status === 'active' && <Badge>Active</Badge>}
{session.status === 'building-sandbox' && <Spinner />}
```

**New pattern:**
```tsx
{session.runtime.isLoaded && !session.runtime.sandbox && <Badge>Loaded</Badge>}
{session.runtime.sandbox?.status === 'starting' && <Spinner />}
{session.runtime.sandbox?.status === 'ready' && <Badge color="green">Ready</Badge>}
{session.runtime.sandbox?.status === 'terminated' && <Badge color="gray">Idle</Badge>}
{!session.runtime.isLoaded && <Badge color="gray">Not Loaded</Badge>}
```

## Migration Checklist

- [ ] Update type definitions
- [ ] Update REST client response handling
- [ ] Update WebSocket event handlers
- [ ] Update `useSessionList` hook
- [ ] Update `useAgentSession` hook
- [ ] Update any UI components showing session/sandbox status
- [ ] Remove references to deprecated `status` field
- [ ] Test session list view
- [ ] Test session detail view
- [ ] Test sending messages (lazy sandbox creation)
- [ ] Test WebSocket status updates

## Behavioral Notes

1. **Sessions start without a sandbox** - When a session is created or loaded, `runtime.sandbox` will be `null`. The sandbox is only created when `sendMessage` is called.

2. **Sandbox lifecycle is visible** - Clients can now see:
   - `starting` - Sandbox being created
   - `ready` - Sandbox ready for messages
   - `unhealthy` - Health check failed
   - `terminated` - Modal terminated the sandbox (idle timeout)

3. **No auto-restart** - When a sandbox becomes unhealthy or terminates, it's not automatically restarted. The next `sendMessage` will create a fresh sandbox.

4. **Session unload on sandbox termination** - When Modal terminates a sandbox due to idle timeout, the session is automatically unloaded from memory. The client will receive a `session:status` event with `runtime.isLoaded: false`.
