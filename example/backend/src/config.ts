import type { AgentProfile } from "@hhopkins/agent-runtime";

/**
 * Example agent profile configuration for Claude SDK
 *
 * This demonstrates a minimal but functional agent profile with:
 * - Basic system prompt
 * - Core tools (Read, Write, Edit, Bash, Grep, Glob)
 * - No MCP servers (can be added as needed)
 */
export const exampleAgentProfile: AgentProfile = {
  id: "example-assistant",
  name: "Example Assistant",
  description: "A helpful AI assistant for general tasks and coding",

  // System prompt that defines the agent's behavior
  systemPrompt: `You are a helpful AI assistant. You can help users with:
- Writing and editing code
- Running bash commands
- Searching through files
- General programming questions

Be concise and helpful in your responses.`,

  // Enable core tools for the agent
  tools: [
    "Read",    // Read files
    "Write",   // Create new files
    "Edit",    // Edit existing files
    "Bash",    // Execute shell commands
    "Grep",    // Search file contents
    "Glob",    // Find files by pattern
  ],

  // MCP servers configuration (empty for this example)
  mcp: [],

  // Optional: npm packages to install in the sandbox
  // npmDependencies: ["lodash", "axios"],

  // Optional: pip packages to install in the sandbox
  // pipDependencies: ["requests", "pandas"],

  // Optional: Environment variables for the sandbox
  // environmentVariables: {
  //   API_KEY: "your-api-key",
  // },
};

/**
 * Persistence type: "memory" for in-memory storage, "sqlite" for SQLite database
 */
export type PersistenceType = "memory" | "sqlite";

/**
 * Environment configuration
 */
export const config = {
  port: parseInt(process.env.PORT || "3001"),
  nodeEnv: process.env.NODE_ENV || "development",
  workspaceDir: process.env.WORKSPACE_DIR || "./workspace",
  logLevel: process.env.LOG_LEVEL || "info",

  // Persistence configuration
  persistence: {
    type: (process.env.PERSISTENCE_TYPE || "sqlite") as PersistenceType,
    sqliteDbPath: process.env.SQLITE_DB_PATH || "./data/agent-sessions.db",
  },

  // Modal configuration
  modal: {
    tokenId: process.env.MODAL_TOKEN_ID,
    tokenSecret: process.env.MODAL_TOKEN_SECRET,
  },

  // Anthropic API key
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

/**
 * Validate required environment variables
 */
export function validateConfig() {
  const required = {
    MODAL_TOKEN_ID: config.modal.tokenId,
    MODAL_TOKEN_SECRET: config.modal.tokenSecret,
    ANTHROPIC_API_KEY: config.anthropicApiKey,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Please copy .env.example to .env and fill in the values."
    );
  }
}
