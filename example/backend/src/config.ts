import type { AgentProfile } from "@hhopkins/agent-runtime";
import path from "path";
import { fileURLToPath } from "url";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Example agent profile configuration for Claude SDK
 *
 * This demonstrates a functional agent profile with:
 * - Basic system prompt
 * - Core tools (Read, Write, Edit, Bash, Grep, Glob)
 * - Example skill (echo-info)
 * - Example bundled MCP server (echo-server)
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

  // Skills configuration
  skills: [
    {
      name: "echo-info",
      description: "A simple skill that echoes back information to verify skills are working.",
      skillMd: `# Echo Info Skill

This is a test skill to verify skills are properly loaded.

## Usage
When invoked, this skill should:
1. Acknowledge successful loading
2. Echo back any input provided

## Verification
If you can read this, the skill system is working correctly.`,
      supportingFiles: [
        {
          relativePath: "examples/sample.txt",
          content: "Sample supporting file for echo-info skill."
        }
      ]
    }
  ],

  // Bundled MCP servers
  bundledMCPs: [
    {
      name: "echo-server",
      description: "A simple echo MCP server for testing MCP integration",
      localProjectPath: path.resolve(__dirname, "../mcps/echo-server"),
      startCommand: "tsx src/index.ts",
      installCommand: "npm install"
    }
  ],

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
