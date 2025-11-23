# Agent Runtime

A flexible, framework-agnostic runtime for orchestrating AI agents (Claude, Gemini) in isolated sandboxes with real-time streaming support.

## Overview

This repository contains two npm packages that work together to provide a complete agent orchestration solution:

- **[@hhopkins/agent-runtime](./backend/)** - Node.js runtime for managing agent sessions, sandboxes, and persistence
- **[@hhopkins/agent-runtime-react](./client/)** - React hooks for building agent UIs with real-time updates

## Key Features

- 🔒 **Isolated Sandbox Execution** - Run agents in secure Modal sandboxes
- 🔄 **Real-time Streaming** - WebSocket-based streaming of agent responses
- 💾 **Flexible Persistence** - Adapter pattern for any database (Convex, PostgreSQL, etc.)
- 🎯 **Architecture Agnostic** - Support for Claude Agent SDK and Gemini CLI
- ⚛️ **React Integration** - Complete set of hooks for building agent UIs
- 📦 **Type-Safe** - Full TypeScript support with shared types

## Installation

### Backend Runtime

```bash
npm install @hhopkins/agent-runtime
# or
pnpm add @hhopkins/agent-runtime
```

### React Client

```bash
npm install @hhopkins/agent-runtime-react
# or
pnpm add @hhopkins/agent-runtime-react
```

## Quick Start

### 1. Set Up the Runtime (Backend)

The runtime requires you to provide adapters for persistence and configuration:

```typescript
import { AgentRuntime } from '@hhopkins/agent-runtime';
import type { PersistenceAdapter, RuntimeConfig } from '@hhopkins/agent-runtime/types';

// Implement your persistence adapter
const persistenceAdapter: PersistenceAdapter = {
  async listAllSessions() { /* ... */ },
  async loadSession(sessionId) { /* ... */ },
  async createSessionRecord(data) { /* ... */ },
  async updateSession(sessionId, updates) { /* ... */ },
  // ... other methods
};

// Configure the runtime
const config: RuntimeConfig = {
  modal: {
    tokenId: process.env.MODAL_TOKEN_ID,
    tokenSecret: process.env.MODAL_TOKEN_SECRET,
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  persistence: persistenceAdapter,
  port: 3000,
};

// Start the runtime
const runtime = new AgentRuntime(config);
await runtime.start();
```

See [backend/README.md](./backend/README.md) for detailed runtime documentation.

### 2. Build the UI (React)

Use the React hooks to connect to your runtime:

```typescript
import { AgentServiceProvider, useAgentSession, useMessages } from '@hhopkins/agent-runtime-react';

function App() {
  return (
    <AgentServiceProvider config={{
      apiUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000',
      apiKey: 'your-api-key',
    }}>
      <AgentChat />
    </AgentServiceProvider>
  );
}

function AgentChat() {
  const { session, createSession, sendMessage } = useAgentSession();
  const { messages } = useMessages(session?.sessionId);

  // Build your UI...
}
```

See [client/README.md](./client/README.md) for detailed React hooks documentation.

## Architecture

```
┌─────────────────────────────────────────┐
│         Your Application                │
│  (React, Next.js, Express, etc.)        │
└────────────┬────────────────────────────┘
             │
             │ HTTP/WebSocket
             ↓
┌─────────────────────────────────────────┐
│    @hhopkins/agent-runtime (Backend)    │
│  • Session management                   │
│  • WebSocket streaming                  │
│  • Adapter integration                  │
└────────────┬────────────────────────────┘
             │
             ├──→ Modal Sandboxes (Agent execution)
             ├──→ Your Persistence Layer (via adapter)
             └──→ Your Custom Logic (via adapters)
```

## Important: You Provide the Infrastructure

This library is a **runtime and client**, not a complete service. Your application must provide:

- ✅ **Persistence Layer** - Implement `PersistenceAdapter` for your database (Convex, PostgreSQL, MongoDB, etc.)
- ✅ **Modal Account** - For sandbox orchestration ([Modal.com](https://modal.com))
- ✅ **API Keys** - Anthropic API key for Claude agents
- ✅ **Server Deployment** - Host the runtime on your infrastructure (Railway, Fly.io, AWS, etc.)
- ✅ **Authentication** - Add your own auth layer (JWT, OAuth, etc.)

See the [backend README](./backend/README.md) for a complete guide on implementing adapters.

## Project Structure

```
agent-service/
├── backend/          # @hhopkins/agent-runtime
│   ├── src/
│   │   ├── core/     # Session management, event bus
│   │   ├── types/    # Shared type definitions
│   │   ├── transport/ # HTTP + WebSocket servers
│   │   └── lib/      # Agent architectures, utilities
│   └── sandbox/      # Modal sandbox configuration
│
├── client/           # @hhopkins/agent-runtime-react
│   ├── src/
│   │   ├── hooks/    # React hooks (useAgentSession, etc.)
│   │   ├── context/  # Provider and state management
│   │   └── client/   # REST + WebSocket clients
│   └── dist/         # Built output
│
└── README.md         # This file
```

## Documentation

- **[Backend Runtime Documentation](./backend/README.md)** - Runtime setup, adapters, configuration
- **[React Client Documentation](./client/README.md)** - Hooks API, examples, troubleshooting

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (recommended)
- React >= 18.0 (for client package)

## License

MIT

## Contributing

Issues and pull requests are welcome! Please see individual package READMEs for development setup.
