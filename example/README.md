# Agent Runtime Example

A complete example application demonstrating how to use `@hhopkins/agent-runtime` and `@hhopkins/agent-runtime-react` to build an AI agent application.

## Overview

This example showcases:

- **Backend**: Standalone Node.js server with agent runtime
- **Frontend**: Next.js application with React hooks
- **Persistence**: In-memory adapter (for demo purposes)
- **Agent**: Claude SDK with basic tool set
- **UI Features**: Chat, file workspace, subagent viewer, session management

## Project Structure

```
example/
├── backend/                    # Node.js backend server
│   ├── src/
│   │   ├── server.ts          # Main server entry point
│   │   ├── config.ts          # Agent profile and environment config
│   │   └── persistence/
│   │       └── in-memory-adapter.ts  # In-memory persistence implementation
│   ├── package.json
│   └── .env.example
│
└── frontend/                   # Next.js frontend
    ├── src/
    │   ├── app/               # Next.js app router
    │   │   ├── layout.tsx     # Root layout with providers
    │   │   ├── page.tsx       # Main dashboard
    │   │   └── providers.tsx  # Client-side provider wrapper
    │   ├── components/        # React components
    │   │   ├── AgentChat.tsx
    │   │   ├── SessionList.tsx
    │   │   ├── FileWorkspace.tsx
    │   │   ├── SubagentViewer.tsx
    │   │   └── MessageRenderer.tsx
    │   └── lib/
    │       └── constants.ts   # Configuration
    ├── package.json
    └── .env.local.example
```

## Prerequisites

Before running this example, you need:

1. **Node.js** >= 18
2. **pnpm** >= 8
3. **Modal account** - Sign up at [modal.com](https://modal.com)
   - Get your Modal token ID and secret from [modal.com/settings](https://modal.com/settings)
4. **Anthropic API key** - Get from [console.anthropic.com](https://console.anthropic.com)

## Setup Instructions

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

This will install dependencies for all packages including the example.

### 2. Configure Backend

Navigate to the backend directory and set up environment variables:

```bash
cd example/backend
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
PORT=3001
NODE_ENV=development

# Modal Configuration (required)
MODAL_TOKEN_ID=your_modal_token_id
MODAL_TOKEN_SECRET=your_modal_token_secret

# Anthropic API Key (required)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional
WORKSPACE_DIR=./workspace
LOG_LEVEL=info
```

### 3. Configure Frontend

Navigate to the frontend directory:

```bash
cd example/frontend
cp .env.local.example .env.local
```

Edit `.env.local` if needed (default should work):

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### 4. Run the Example

You have several options:

#### Option A: Run Both Together (Recommended)

From the **repository root**:

```bash
pnpm example:dev
```

This starts both backend and frontend in parallel.

#### Option B: Run Separately

**Terminal 1 - Backend:**
```bash
pnpm example:backend
```

**Terminal 2 - Frontend:**
```bash
pnpm example:frontend
```

### 5. Access the Application

Open your browser and navigate to:

```
http://localhost:3000
```

The backend server runs on `http://localhost:3001`.

## Usage Guide

### Creating a Session

1. Click the **"New Session"** button in the left sidebar
2. A new session will be created with the "Example Assistant" agent profile
3. The session will appear in the session list

### Chatting with the Agent

1. Select a session from the list
2. Click the **"Chat"** tab
3. Type a message in the input box and press Enter
4. The agent will respond with streaming updates

### Viewing Files

1. Select an active session
2. Click the **"Files"** tab
3. Files created or modified by the agent will appear here
4. Click on a file to view its contents

### Viewing Subagents

1. Select an active session
2. Click the **"Subagents"** tab
3. When the agent spawns subagents (Claude SDK feature), they'll appear here
4. Click on a subagent to view its conversation

## What's Happening Behind the Scenes

### Backend Architecture

1. **In-Memory Persistence** (`example/backend/src/persistence/in-memory-adapter.ts`)
   - Implements the `PersistenceAdapter` interface
   - Stores sessions, transcripts, and files in memory
   - Data is lost when the server restarts (use a real database in production)

2. **Agent Profile** (`example/backend/src/config.ts`)
   - Defines the agent's behavior and capabilities
   - Configures available tools (Read, Write, Edit, Bash, Grep, Glob)
   - Sets the system prompt

3. **Runtime Initialization** (`example/backend/src/server.ts`)
   - Creates the agent runtime with persistence adapter
   - Starts HTTP REST API server
   - Attaches WebSocket server for real-time updates
   - Handles graceful shutdown

### Frontend Architecture

1. **Provider Setup** (`example/frontend/src/app/providers.tsx`)
   - Wraps the app with `AgentServiceProvider`
   - Connects to backend REST and WebSocket servers
   - Enables all React hooks

2. **React Hooks** (all components)
   - `useAgentSession()` - Session lifecycle management
   - `useSessionList()` - List all sessions
   - `useMessages()` - Chat and conversation blocks
   - `useWorkspaceFiles()` - Track agent-created files
   - `useSubagents()` - View subagent conversations

3. **Real-Time Updates**
   - WebSocket connection for live streaming
   - Automatic UI updates when blocks arrive
   - Session status changes reflected immediately

## Customization Ideas

### Add Your Own Agent Profile

Edit `example/backend/src/config.ts`:

```typescript
export const myCustomAgent: AgentProfile = {
  id: "my-custom-agent",
  name: "My Custom Agent",
  description: "A specialized agent for...",
  systemPrompt: "Your custom system prompt...",
  tools: ["Read", "Write", "Bash", "CustomTool"],
  mcp: [
    // MCP server configurations
  ],
};
```

### Use Real Database Persistence

Implement `PersistenceAdapter` for your database:

```typescript
import { PersistenceAdapter } from "@hhopkins/agent-runtime";

export class PostgresPersistenceAdapter implements PersistenceAdapter {
  constructor(private pool: Pool) {}

  async listAllSessions() {
    // Query PostgreSQL
  }

  // Implement other methods...
}
```

### Add Authentication

Wrap the REST and WebSocket servers with your auth middleware:

```typescript
// Add JWT verification, OAuth, etc.
```

### Customize the UI

The frontend uses Tailwind CSS. Modify components in `example/frontend/src/components/` to match your design system.

## Troubleshooting

### Backend won't start

- **Check environment variables**: Make sure `.env` is configured with valid Modal and Anthropic credentials
- **Port already in use**: Change `PORT` in `.env` to a different port
- **Modal connection fails**: Verify your Modal token ID and secret are correct

### Frontend can't connect

- **Backend not running**: Make sure the backend server is running on port 3001
- **CORS errors**: The backend should automatically allow requests from localhost:3000
- **WebSocket connection fails**: Check browser console for errors

### Agent not responding

- **Anthropic API key**: Verify your API key is valid and has available credits
- **Modal sandbox**: Check Modal dashboard for any sandbox errors
- **Network issues**: Check your internet connection

## Production Considerations

This example uses shortcuts for simplicity:

- **In-memory persistence** - Use a real database (PostgreSQL, MongoDB, Convex, etc.)
- **Hardcoded API key** - Use proper API key management
- **No authentication** - Add JWT, OAuth, or similar
- **No rate limiting** - Implement rate limiting for production
- **Simple error handling** - Add comprehensive error handling and logging
- **Single agent profile** - Support multiple agent profiles

## Learn More

- [Agent Runtime Documentation](../README.md)
- [Backend Package](../backend/README.md)
- [React Client Package](../client/README.md)
- [Modal Documentation](https://modal.com/docs)
- [Claude SDK Documentation](https://github.com/anthropics/claude-agent-sdk)

## License

MIT
