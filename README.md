# Agent Service

Standalone Node.js service for running specialized Claude agents in isolated Modal sandboxes.

## Overview

The agent service provides:
- Isolated sandbox execution for Claude agents
- Session management with complete state persistence
- MCP tools for Convex backend integration
- Admin UI integration via HTTP/SSE

## Architecture

```
Node.js Server (Railway/Fly.io)
  ↓
  ├─→ Modal Sandboxes API (agent execution)
  └─→ Convex Backend (state persistence)
```

## Development

### Prerequisites

- Node.js >= 22 (required by Modal SDK)
- pnpm
- Modal account (for sandboxes)
- Anthropic API key

### Setup

```bash
# Install dependencies
cd apps/agent-service
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# (See .env.example for required variables)

# Start development server
pnpm dev
```

Server will start on `http://localhost:3003`

### Testing

**Story 1.1 & 1.2 - Basic Testing:**

```bash
# Health check
curl http://localhost:3003/health

# Server status (includes active session count)
curl http://localhost:3003/

# Create a test session
curl -X POST http://localhost:3003/sandbox-test/create \
  -H "Content-Type: application/json" \
  -d '{"agentType":"test-agent","marketKey":"clt"}'

# List all active sessions
curl http://localhost:3003/sandbox-test

# Get session details
curl http://localhost:3003/sandbox-test/{sessionId}

# Destroy a session
curl -X DELETE http://localhost:3003/sandbox-test/{sessionId}
```

**Note**: Sandbox execution uses Modal SDK with custom image containing Agent SDK and executor script.

### Build

```bash
# Type check
pnpm check-types

# Lint
pnpm lint

# Build for production
pnpm build

# Run production build
pnpm start
```

## Project Structure

```
apps/agent-service/
├── src/
│   ├── index.ts                    # Server entry point with SessionManager
│   ├── env.ts                      # Environment validation (Zod)
│   ├── types/
│   │   └── index.ts                # Session and sandbox types
│   ├── lib/
│   │   ├── logger.ts               # Pino logger setup
│   │   ├── modal.ts                # Modal client + buildSandboxImageCommands()
│   │   ├── session-manager.ts      # Session lifecycle management
│   │   ├── session-file-manager.ts # Sandbox filesystem setup
│   │   └── agent-sdk.ts            # Agent SDK execution service
│   └── routes/
│       ├── health.ts               # Health check endpoint
│       └── test.ts                 # Testing routes (temporary)
├── sandbox/                        # Files baked into Modal image at /app/
│   ├── package.json                # Dependencies for SDK executor
│   ├── execute-sdk-query.ts        # Agent SDK executor script
│   └── README.md                   # Documentation
├── agent-configs/                  # Agent configuration templates
│   └── event-researcher/           # Event researcher agent config
├── package.json
├── tsconfig.json
└── .env.example
```

## Current Status

**Phase 1 Progress: 6/7 stories complete**

**Completed Stories:**
- ✅ Story 1.1: Project setup with Hono server
- ✅ Story 1.2: Sandbox lifecycle management with Modal SDK
- ✅ Story 1.3: Dynamic .claude directory building
- ✅ Story 1.4: Agent SDK integration with streaming JSONL
- ✅ Story 1.5: MCP tools for Convex integration
- ✅ Story 1.6: Core HTTP routes with SSE streaming

**Key Architecture Improvements:**
- `buildSandboxImageCommands()` - Recursively copies `sandbox/` → `/app/` in Modal image
- All dependencies baked into image at build time (fully cached)
- Clean separation: `/app` for application code, `/workspace` for SDK operations
- MCP tools with typed Convex client for backend integration
- Custom agents API in backend with AGENT_TD_KEY authentication
- Production HTTP API with 5 routes and SSE streaming for messages
- Agent service as single entry point (Convex = persistence only)
- Derived session status (active/inactive) based on activeSessions Map

**Next**: Story 1.7 - File sync implementation

## Environment Variables

See `.env.example` for all configuration options.

**Required:**
- `PORT` - Server port (default: 3003)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (info/debug/error)
- `MODAL_TOKEN_ID` - Modal account token ID
- `MODAL_TOKEN_SECRET` - Modal account token secret
- `ANTHROPIC_API_KEY` - Anthropic API key for Agent SDK
- `CONVEX_URL` - Convex deployment URL (e.g., https://your-deployment.convex.cloud)
- `AGENT_TD_KEY` - Shared secret for agent service ↔ backend authentication

## Related Documentation

### Architecture
- **[AgentSandbox Architecture](./docs/architecture/agent-sandbox.md)** - Unified sandbox wrapper with health monitoring
- [Event Bus Pattern](./docs/architecture/event-bus-pattern.md) - Event-driven architecture
- [Design Document](./docs/DESIGN.md) - Generic runtime design
- [Refactoring Progress](./REFACTORING_PROGRESS.md) - Current refactoring status

### Product
- [Initiative Overview](../../docs/content/workspace/initiatives/agent-service/overview.md)
- [PRD](../../docs/content/workspace/initiatives/agent-service/prd.md)
- [Epic Breakdown](../../docs/content/workspace/initiatives/agent-service/epic.md)
