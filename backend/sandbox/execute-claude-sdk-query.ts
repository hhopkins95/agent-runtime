#!/usr/bin/env tsx
/**
 * SDK Executor - Runs inside Modal sandbox
 *
 * This script executes the Anthropic Agent SDK inside a Modal sandbox
 * and streams SDK messages as JSONL to stdout for consumption by the
 * agent-service.
 *
 * Usage:
 *   tsx execute-sdk-query.ts "<prompt>" [--resume <sessionId>]
 *
 * Arguments:
 *   prompt           - The user's message/prompt to send to the agent
 *   --resume <id>    - (Optional) Resume from existing session
 *
 * Output:
 *   Streams JSONL messages to stdout, one per line
 *   Each line is a JSON-serialized SDKMessage
 *
 * Session Management:
 *   - First message: Don't pass --resume → SDK creates new session
 *   - Subsequent messages: Pass --resume <id> → SDK resumes session
 */

import { Options, PermissionMode, query, SettingSource } from '@anthropic-ai/claude-agent-sdk';
import { Command } from "commander"

// Configure commander program
const program = new Command()
  .name('execute-claude-sdk-query')
  .description('Executes the Anthropic Agent SDK inside a Modal sandbox')
  .argument('<prompt>', 'The user\'s message/prompt to send to the agent')
  .option('-r, --resume <sessionId>', 'Resume from existing session')
  .option('-s, --session-id <sessionId>', 'The session id to use. Only used if --resume is not provided')
  .parse();

// Extract parsed arguments
const prompt = program.args[0];
const options = program.opts();
const resumeId = options.resume;
const newSessionId = options.sessionId;


// Validate environment
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set');
  process.exit(1);
}

/**
 * Execute the agent query
 */
async function executeQuery() {
  try {
    // Configure SDK options
    const options : Options = {
      // Working directory
      // cwd: process.env.CLAUDE_CODE_CWD || '/workspace',

      // Load .claude/ configurations
      settingSources: ['project', 'local'] as SettingSource[],

      // Enable streaming of partial messages
      includePartialMessages: true,

      // Reasonable limits
      // maxTurns: 50,
      maxBudgetUsd: 5.0,


      // This is how we can start a new session with a specific session id
      extraArgs: {
        'session-id': newSessionId,
      },

      // Session management
      resume: resumeId,


      // Permission mode - accept edits but allow tool use
      permissionMode: 'acceptEdits' as PermissionMode,

      // MCP Servers - Register Convex backend tools
      mcpServers: {
        // convex: convexTools,
      },
    };

    // Create query generator
    const generator = query({
      prompt,
      options,
    });

    // Stream messages as JSONL
    for await (const msg of generator) {
      // Write message as single-line JSON
      console.log(JSON.stringify(msg));

      // Flush stdout to ensure immediate delivery
      if (process.stdout.write('')) {
        // Write succeeded
      }
    }

    // Success - exit cleanly
    process.exit(0);
  } catch (error: any) {
    // Write error as JSONL message
    const errorMsg = {
      type: 'error',
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack,
        name: error.name,
      },
      timestamp: Date.now(),
    };

    console.error("ERROR HERE" + JSON.stringify(errorMsg));
    process.exit(1);
  }
}

// Handle termination signals gracefully
process.on('SIGINT', () => {
  console.error(JSON.stringify({
    type: 'interrupted',
    message: 'SDK execution interrupted by signal',
    timestamp: Date.now(),
  }));
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.error(JSON.stringify({
    type: 'terminated',
    message: 'SDK execution terminated by signal',
    timestamp: Date.now(),
  }));
  process.exit(143);
});

// Execute
executeQuery();
