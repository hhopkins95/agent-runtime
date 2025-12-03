# Agent Design Types Reference

## AgentProfile

```typescript
interface AgentProfile extends AgentProfileListData {
  /** System prompt - the agent's core personality and instructions */
  systemPrompt?: string;

  /** Agent memory file content (CLAUDE.md or AGENT.md) */
  agentMDFile?: string;

  /** Skills available to the agent */
  skills?: ClaudeSkill[];

  /** Subagents the main agent can delegate to */
  subagents?: ClaudeSubagent[];

  /** Commands that can be invoked via prompt */
  commands?: AgentCommand[];

  /** Tools the agent can use */
  tools?: string[];

  /** MCP servers bundled with the agent */
  bundledMCPs?: LocalMcpServer[];

  /** External MCP server configurations */
  externalMCPs?: McpServerConfig[];

  /** npm packages to install in sandbox */
  npmDependencies?: string[];

  /** pip packages to install in sandbox */
  pipDependencies?: string[];

  /** Environment variables for the sandbox */
  environmentVariables?: Record<string, string>;

  /** Files to create in workspace on session start */
  defaultWorkspaceFiles?: WorkspaceFile[];
}

interface AgentProfileListData {
  id: string;
  name: string;
  description?: string;
}
```

## Skills

```typescript
interface ClaudeSkill {
  /** Skill identifier */
  name: string;

  /** When the agent should use this skill */
  description: string;

  /** Main skill content (markdown format) */
  skillMd: string;

  /** Supporting files (templates, scripts, examples) */
  supportingFiles?: {
    relativePath: string;
    content: string;
  }[];

  /** npm dependencies needed for this skill */
  npmDependencies?: string[];

  /** pip dependencies needed for this skill */
  pipDependencies?: string[];
}
```

## Subagents

```typescript
interface ClaudeSubagent {
  /** Subagent identifier */
  name: string;

  /** When the main agent should delegate to this subagent */
  description: string;

  /** Subagent's system prompt / instructions */
  prompt: string;

  /** Model to use: "sonnet" | "opus" | "haiku" | "inherit" */
  model?: string;

  /** Tools available to subagent (subset of main agent tools) */
  tools?: string[];
}
```

## Commands

```typescript
interface AgentCommand {
  /** Command identifier (invoked as /command-name) */
  name: string;

  /** Instructions executed when command is invoked */
  prompt: string;
}
```

## MCP Servers

```typescript
/** MCP server bundled with the agent */
interface LocalMcpServer {
  /** Server identifier */
  name: string;

  /** What this server provides */
  description: string;

  /** Path to MCP server project directory */
  localProjectPath: string;

  /** Command to start the server */
  startCommand: string;

  /** Command to install dependencies */
  installCommand: string;
}

/** External MCP server configuration (from @anthropic-ai/claude-agent-sdk) */
interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
```

## Available Tools

Tools available for Claude Agent SDK agents:

| Tool | Description |
|------|-------------|
| `Read` | Read file contents |
| `Write` | Create new files |
| `Edit` | Edit existing files |
| `Bash` | Execute shell commands |
| `Grep` | Search file contents with regex |
| `Glob` | Find files by pattern |

## Workspace Files

```typescript
interface WorkspaceFile {
  /** Relative path in workspace */
  path: string;

  /** File contents */
  content: string;

  /** Creation timestamp */
  createdAt?: string;

  /** Last modification timestamp */
  modifiedAt?: string;
}
```

## Architecture Types

```typescript
type AGENT_ARCHITECTURE_TYPE = "claude-agent-sdk" | "opencode";
```

## Session Options

```typescript
interface AgentArchitectureSessionOptions {
  /** Model to use for this session */
  model?: string;

  /** Additional architecture-specific options */
  [key: string]: unknown;
}
```

## Example: Complete Profile

```typescript
const exampleProfile: AgentProfile = {
  // Identity
  id: "example-assistant",
  name: "Example Assistant",
  description: "A helpful AI assistant for general tasks",

  // Behavior
  systemPrompt: `You are a helpful AI assistant.
Be concise and helpful in your responses.`,

  agentMDFile: `# Project Context
This is an example project using TypeScript.`,

  // Tools
  tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],

  // Skills
  skills: [{
    name: "code-review",
    description: "Review code for issues",
    skillMd: `# Code Review
1. Check for bugs
2. Verify style
3. Suggest improvements`,
  }],

  // Subagents
  subagents: [{
    name: "test-writer",
    description: "Write unit tests",
    prompt: "Write comprehensive unit tests.",
    model: "haiku",
    tools: ["Read", "Write", "Bash"],
  }],

  // Commands
  commands: [{
    name: "review",
    prompt: "Review all changed files and provide feedback.",
  }],

  // MCP Servers
  bundledMCPs: [{
    name: "echo-server",
    description: "Echo MCP for testing",
    localProjectPath: "./mcps/echo-server",
    startCommand: "tsx src/index.ts",
    installCommand: "npm install",
  }],

  // Environment
  npmDependencies: ["lodash"],
  environmentVariables: {
    NODE_ENV: "development",
  },
};
```
