# Event Bus Architecture Pattern

## Overview

The Agent Service uses a centralized event bus pattern to decouple business logic from transport layer (WebSocket). This enables:

- **Type-safe** domain events
- **Testable** business logic (no Socket.io mocking required)
- **Flexible** transport layers (could add HTTP SSE, webhooks, etc.)
- **Clear separation** between commands and events
- **Easy debugging** (single place to log all events)

## Architecture Layers

```
┌──────────────────────────────────────────────────────────────┐
│                     Transport Layer                          │
│                    (WebSocket / HTTP)                        │
│                                                              │
│  Responsibilities:                                           │
│  - Receive commands from clients                             │
│  - Call Application Layer methods                            │
│  - Listen to EventBus for domain events                      │
│  - Translate domain events → transport events                │
│  - Send responses/events to clients                          │
└──────────────────────────────────────────────────────────────┘
                    │                           ▲
                    │ Commands                  │ Domain Events
                    ▼                           │
┌──────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│                 (SessionManager, AgentSession)               │
│                                                              │
│  Responsibilities:                                           │
│  - Execute business logic                                    │
│  - Manage domain state                                       │
│  - Emit domain events to EventBus                            │
│  - NO knowledge of transport layer                           │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ Emits/Listens
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                         Event Bus                            │
│                   (Centralized EventEmitter)                 │
│                                                              │
│  Responsibilities:                                           │
│  - Hub for all domain events                                 │
│  - Type-safe event definitions                               │
│  - Event routing                                             │
└──────────────────────────────────────────────────────────────┘
```

## Event Flow

### Command Flow (Client → Server → Domain)

```typescript
// 1. Client sends command via WebSocket
socket.emit('session:create', { agentType: 'event-researcher' }, (response) => {
  console.log(response.sessionId);
});

// 2. WebSocket handler receives command
socket.on('session:create', async (data, callback) => {
  // 3. Call SessionManager (Application Layer)
  const session = await sessionManager.createSession(data);

  // 4. Return response to client
  callback({ success: true, sessionId: session.sessionId });
});

// 5. SessionManager executes business logic and emits events
async createSession(request: CreateSessionRequest) {
  const session = await createNewSession(request, this.modalContext, this.eventBus);
  this.activeSessions.set(session.sessionId, session);

  // Emit domain event to event bus
  this.eventBus.emit('session:created', {
    sessionId: session.sessionId,
    metadata: session.getMetadata()
  });

  return session;
}
```

### Event Flow (Domain → Server → Client)

```typescript
// 1. Business logic emits domain event
this.eventBus.emit('session:message:new', {
  sessionId: this.sessionId,
  message: msg
});

// 2. WebSocket layer listens to event bus
eventBus.on('session:message:new', (data) => {
  // 3. Translate domain event → WebSocket event
  io.to(`session:${data.sessionId}`).emit('session:main:message', data);
});

// 4. All clients in session room receive WebSocket event
socket.on('session:main:message', (data) => {
  console.log('New message:', data.message);
});
```

## Type Safety

### Fully Typed Event Bus

```typescript
// lib/event-bus.ts

/**
 * Domain events emitted by business logic
 * ALL events MUST be defined here for type safety
 */
export interface DomainEvents {
  // Session lifecycle
  'session:created': { sessionId: string; metadata: SessionMetadata };
  'session:loaded': { sessionId: string };
  'session:destroyed': { sessionId: string };
  'session:status-changed': { sessionId: string; status: 'active' | 'inactive' };

  // Sessions list
  'sessions:changed': void;

  // Main transcript
  'session:message:new': { sessionId: string; message: SDKMessage };

  // Subagents
  'session:subagent:discovered': { sessionId: string; subagent: SubagentTranscript };
  'session:subagent:message': { sessionId: string; subagentId: string; message: SDKMessage };
  'session:subagent:completed': { sessionId: string; subagentId: string; status: 'completed' | 'failed' };

  // Files
  'session:file:created': { sessionId: string; file: FileMetadata };
  'session:file:modified': { sessionId: string; file: FileMetadata };
  'session:file:deleted': { sessionId: string; path: string };

  // Sandbox
  'sandbox:status-changed': { sessionId: string; sandboxId: string; status: 'healthy' | 'unhealthy' | 'terminated' };
}

/**
 * Type-safe event bus
 *
 * Usage:
 * - eventBus.emit('session:created', { sessionId, metadata }) // ✅ Type-safe
 * - eventBus.emit('session:created', { foo: 'bar' })          // ❌ Type error
 * - eventBus.on('session:created', (data) => ...)             // data is typed!
 */
export class EventBus extends EventEmitter {
  /**
   * Emit type-safe event
   */
  emit<K extends keyof DomainEvents>(
    event: K,
    ...args: DomainEvents[K] extends void ? [] : [DomainEvents[K]]
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Listen to type-safe event
   */
  on<K extends keyof DomainEvents>(
    event: K,
    listener: DomainEvents[K] extends void
      ? () => void
      : (data: DomainEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Listen once to type-safe event
   */
  once<K extends keyof DomainEvents>(
    event: K,
    listener: DomainEvents[K] extends void
      ? () => void
      : (data: DomainEvents[K]) => void
  ): this {
    return super.once(event, listener);
  }

  /**
   * Remove type-safe listener
   */
  off<K extends keyof DomainEvents>(
    event: K,
    listener: DomainEvents[K] extends void
      ? () => void
      : (data: DomainEvents[K]) => void
  ): this {
    return super.off(event, listener);
  }
}
```

### Creating the Event Bus Instance

```typescript
// Option 1: Singleton (simpler, but global state)
export const eventBus = new EventBus();

// Option 2: Dependency injection (more testable, recommended)
// Create instance in index.ts and pass to all classes
const eventBus = new EventBus();
const sessionManager = new SessionManager(modalContext, eventBus);
const io = createWebSocketServer(httpServer, sessionManager, eventBus);
```

## Implementation Details

### AgentSession

```typescript
export class AgentSession {
  private readonly eventBus: EventBus;

  constructor(
    sessionId: string,
    request: CreateSessionRequest,
    modalContext: ModalContext,
    eventBus: EventBus
  ) {
    this.sessionId = sessionId;
    this.modalContext = modalContext;
    this.eventBus = eventBus;
    // No Socket.io dependency!
  }

  async sendMessage(message: string): Promise<void> {
    // Business logic...
    for await (const msg of this.sdkService.executeQuery(...)) {
      // Store in transcript
      this.mainTranscript.messages.push(msg);

      // Emit domain event (NOT WebSocket event)
      this.eventBus.emit('session:message:new', {
        sessionId: this.sessionId,
        message: msg
      });
    }
  }

  async destroy(): Promise<void> {
    // Cleanup logic...

    this.eventBus.emit('session:destroyed', {
      sessionId: this.sessionId
    });

    this.eventBus.emit('session:status-changed', {
      sessionId: this.sessionId,
      status: 'inactive'
    });
  }

  private handleFileCreated(file: FileMetadata): void {
    this.files.set(file.path, file);

    this.eventBus.emit('session:file:created', {
      sessionId: this.sessionId,
      file
    });
  }
}
```

### SessionManager

```typescript
export class SessionManager {
  private activeSessions: Map<string, AgentSession> = new Map();
  private readonly modalContext: ModalContext;
  private readonly eventBus: EventBus;

  constructor(modalContext: ModalContext, eventBus: EventBus) {
    this.modalContext = modalContext;
    this.eventBus = eventBus;
  }

  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    // Create session (injects eventBus)
    const session = await createNewSession(
      request,
      this.modalContext,
      this.eventBus
    );

    this.activeSessions.set(session.sessionId, session);

    // Emit domain events
    this.eventBus.emit('session:created', {
      sessionId: session.sessionId,
      metadata: session.getMetadata()
    });

    this.eventBus.emit('sessions:changed');

    return session;
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await session.destroy(); // Will emit session:destroyed
    this.activeSessions.delete(sessionId);

    this.eventBus.emit('sessions:changed');
  }
}
```

### WebSocket Layer

```typescript
// lib/websocket/index.ts

export function createWebSocketServer(
  httpServer: HTTPServer,
  sessionManager: SessionManager,
  eventBus: EventBus
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
    },
  });

  // Setup event listeners (domain → WebSocket)
  setupEventListeners(io, sessionManager, eventBus);

  // Setup socket handlers (WebSocket → domain)
  io.on('connection', (socket) => {
    setupSocketHandlers(socket, sessionManager);
  });

  return io;
}
```

```typescript
// lib/websocket/event-listeners.ts

/**
 * Listen to domain events and translate to WebSocket events
 * This is where domain events get broadcast to clients
 */
export function setupEventListeners(
  io: SocketIOServer,
  sessionManager: SessionManager,
  eventBus: EventBus
): void {
  // Sessions list changed → broadcast to all clients
  eventBus.on('sessions:changed', async () => {
    const sessions = await sessionManager.getAllSessions();
    io.emit('sessions:list', sessions);
  });

  // New message → broadcast to session room
  eventBus.on('session:message:new', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:main:message', data);
  });

  // Subagent discovered → broadcast to session room
  eventBus.on('session:subagent:discovered', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:subagent:discovered', data);
  });

  // Subagent message → broadcast to session room
  eventBus.on('session:subagent:message', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:subagent:message', data);
  });

  // Subagent completed → broadcast to session room
  eventBus.on('session:subagent:completed', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:subagent:completed', data);
  });

  // File events → broadcast to session room
  eventBus.on('session:file:created', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:file:created', data);
  });

  eventBus.on('session:file:modified', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:file:modified', data);
  });

  eventBus.on('session:file:deleted', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:file:deleted', data);
  });

  // Sandbox status → broadcast to session room
  eventBus.on('sandbox:status-changed', (data) => {
    io.to(`session:${data.sessionId}`).emit('sandbox:status', data);
  });

  // Session status → broadcast to session room
  eventBus.on('session:status-changed', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:status', data);
  });
}
```

```typescript
// lib/websocket/socket-handlers.ts

/**
 * Handle incoming WebSocket events from clients
 * This is where commands from clients get executed
 */
export function setupSocketHandlers(
  socket: Socket,
  sessionManager: SessionManager
): void {
  logger.info({ socketId: socket.id }, 'Client connected');

  // ============================================================================
  // Global Session Commands
  // ============================================================================

  socket.on('sessions:get', async (callback) => {
    try {
      await sessionManager.broadcastSessionsList();
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // Session Lifecycle Commands
  // ============================================================================

  socket.on('session:create', async (data, callback) => {
    try {
      const session = await sessionManager.createSession(data);
      callback({ success: true, sessionId: session.sessionId });
    } catch (error) {
      callback({ success: false, error: getErrorMessage(error) });
    }
  });

  socket.on('session:load', async (data, callback) => {
    try {
      await sessionManager.loadSession(data.sessionId, data);
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: getErrorMessage(error) });
    }
  });

  socket.on('session:join', (sessionId, callback) => {
    try {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        callback({ success: false, error: 'Session not active' });
        return;
      }

      socket.join(`session:${sessionId}`);
      socket.data.sessionId = sessionId;
      session.connectedClients.add(socket.id);

      // Send full session state
      session.emitSessionState(socket.id);

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: getErrorMessage(error) });
    }
  });

  socket.on('session:leave', (sessionId, callback) => {
    socket.leave(`session:${sessionId}`);
    socket.data.sessionId = undefined;

    const session = sessionManager.getSession(sessionId);
    if (session) {
      session.connectedClients.delete(socket.id);
    }

    callback({ success: true });
  });

  socket.on('session:destroy', async (sessionId, callback) => {
    try {
      await sessionManager.destroySession(sessionId);
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // Session Operations
  // ============================================================================

  socket.on('session:message:send', async (data, callback) => {
    try {
      const session = sessionManager.getSession(data.sessionId);
      if (!session) {
        callback({ success: false, error: 'Session not active' });
        return;
      }

      await session.sendMessage(data.message);
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: getErrorMessage(error) });
    }
  });

  socket.on('session:sync', async (sessionId, callback) => {
    try {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        callback({ success: false, error: 'Session not active' });
        return;
      }

      await session.syncToConvex();
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, reason }, 'Client disconnected');

    if (socket.data.sessionId) {
      const session = sessionManager.getSession(socket.data.sessionId);
      if (session) {
        session.connectedClients.delete(socket.id);
      }
    }
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal server error';
}
```

### Main Entry Point

```typescript
// index.ts

import { EventBus } from './lib/event-bus.js';
import { SessionManager } from './lib/session-manager.js';
import { createWebSocketServer } from './lib/websocket/index.js';

async function startServer() {
  // Initialize Modal
  const modalContext = await initializeModal();

  // Create HTTP server
  const httpServer = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    res.writeHead(404);
    res.end('Use WebSocket');
  });

  // Create event bus
  const eventBus = new EventBus();

  // Create SessionManager
  const sessionManager = new SessionManager(modalContext, eventBus);

  // Create WebSocket server
  const io = createWebSocketServer(httpServer, sessionManager, eventBus);

  // Start background jobs
  sessionManager.startIdleTimeoutJob();

  // Optional: Event logging in development
  if (env.NODE_ENV === 'development') {
    setupEventLogging(eventBus);
  }

  // Start server
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Agent service started');
  });
}

/**
 * Log all domain events for debugging
 */
function setupEventLogging(eventBus: EventBus): void {
  const events: Array<keyof DomainEvents> = [
    'session:created',
    'session:message:new',
    'session:subagent:discovered',
    'session:file:created',
    // ... add all events you want to log
  ];

  events.forEach((event) => {
    eventBus.on(event, (data: any) => {
      logger.debug({ event, data }, 'Domain event emitted');
    });
  });
}
```

## Testing Benefits

### Unit Testing Business Logic

```typescript
// test/session-manager.test.ts

describe('SessionManager', () => {
  it('should emit session:created event when creating session', async () => {
    const eventBus = new EventBus();
    const sessionManager = new SessionManager(mockModalContext, eventBus);

    // Listen for event
    const eventPromise = new Promise((resolve) => {
      eventBus.once('session:created', (data) => {
        resolve(data);
      });
    });

    // Create session
    const session = await sessionManager.createSession({
      agentType: 'test-agent'
    });

    // Verify event was emitted
    const eventData = await eventPromise;
    expect(eventData).toEqual({
      sessionId: session.sessionId,
      metadata: expect.objectContaining({
        agentType: 'test-agent'
      })
    });
  });
});
```

### Integration Testing Without Socket.io

```typescript
// test/message-flow.test.ts

describe('Message Flow', () => {
  it('should emit message events when sending message', async () => {
    const eventBus = new EventBus();
    const sessionManager = new SessionManager(mockModalContext, eventBus);
    const session = await sessionManager.createSession({ agentType: 'test' });

    const messages: any[] = [];

    // Collect all message events
    eventBus.on('session:message:new', (data) => {
      messages.push(data.message);
    });

    // Send message
    await session.sendMessage('Hello');

    // Verify messages were emitted
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].type).toBe('user');
  });
});
```

## Benefits Summary

### 1. Type Safety
- ✅ All events are typed in `DomainEvents` interface
- ✅ TypeScript enforces correct event data structure
- ✅ Autocomplete for event names and data
- ✅ Compile-time errors for invalid events

### 2. Testability
- ✅ Test business logic without Socket.io
- ✅ Easy to mock event bus
- ✅ Can verify events were emitted
- ✅ Integration tests without transport layer

### 3. Separation of Concerns
- ✅ Business logic doesn't know about WebSocket
- ✅ Transport layer doesn't know about domain logic
- ✅ Easy to add new transport layers
- ✅ Clear dependency flow

### 4. Debugging
- ✅ Single place to log all events
- ✅ Can add middleware for metrics
- ✅ Easy to trace event flow
- ✅ Development event logging

### 5. Flexibility
- ✅ Can add webhooks by listening to event bus
- ✅ Can add HTTP SSE endpoints
- ✅ Can add event replay for debugging
- ✅ Can add event persistence

## Common Patterns

### Pattern 1: Command with Event Response

```typescript
// Client sends command
const response = await socket.emitWithAck('session:create', { agentType: 'test' });

// Server executes command
socket.on('session:create', async (data, callback) => {
  const session = await sessionManager.createSession(data);
  callback({ success: true, sessionId: session.sessionId }); // Immediate response
});

// Business logic emits events
this.eventBus.emit('session:created', { sessionId, metadata });

// All clients receive broadcast
socket.on('sessions:list', (sessions) => {
  updateUI(sessions);
});
```

### Pattern 2: Event Aggregation

```typescript
// Multiple domain events trigger one broadcast
eventBus.on('session:created', () => broadcastSessionsList());
eventBus.on('session:destroyed', () => broadcastSessionsList());
eventBus.on('session:status-changed', () => broadcastSessionsList());

async function broadcastSessionsList() {
  const sessions = await sessionManager.getAllSessions();
  io.emit('sessions:list', sessions);
}
```

### Pattern 3: Event Middleware

```typescript
class EventBus extends EventEmitter {
  emit<K extends keyof DomainEvents>(event: K, ...args: any[]): boolean {
    // Log all events
    logger.debug({ event, data: args[0] }, 'Event emitted');

    // Track metrics
    metrics.increment(`events.${event}`);

    // Emit to listeners
    return super.emit(event, ...args);
  }
}
```

## Migration Guide

To convert existing code to use event bus pattern:

1. Create `lib/event-bus.ts` with typed event definitions
2. Update `AgentSession` to accept `eventBus` instead of `io`
3. Update `SessionManager` to accept `eventBus` instead of `io`
4. Replace all `this.io.emit()` calls with `this.eventBus.emit()`
5. Create `lib/websocket/event-listeners.ts` to translate events
6. Update `lib/websocket/index.ts` to wire everything together
7. Update `index.ts` to create and inject event bus

## References

- WebSocket events schema: `src/types/events.ts`
- Socket.io documentation: https://socket.io/docs/
- Node.js EventEmitter: https://nodejs.org/api/events.html
