#!/usr/bin/env tsx
/**
 * SDK Executor - Runs inside Modal sandbox
 *
 * This script executes the Anthropic Agent SDK inside a Modal sandbox
 * and streams SDK messages as JSONL to stdout for consumption by the
 * agent-service.
 *
 * Usage:
 *   tsx execute-sdk-query.ts "<prompt>" --session-id <sessionId>
 *
 * Arguments:
 *   prompt              - The user's message/prompt to send to the agent
 *   --session-id <id>   - The session ID to use (required)
 *   --cwd <path>        - Working directory (default: /workspace)
 *
 * Output:
 *   Streams JSONL messages to stdout, one per line
 *   Each line is a JSON-serialized SDKMessage
 *
 * Session Management:
 *   - Automatically detects if session exists by checking ~/.claude/projects/
 *   - If session transcript found → resumes existing session
 *   - If no transcript found → creates new session with the given ID
 */

import { Options, PermissionMode, Query, query, SettingSource } from '@anthropic-ai/claude-agent-sdk';
import { Command } from "commander"
import * as fs from 'fs';
import * as path from 'path';

/**
 * Check if a session transcript exists by scanning ~/.claude/projects/
 */
const sessionExists = (sessionId: string): boolean => {
  const projectsDir = path.join(process.env.HOME || '~', '.claude', 'projects');

  if (!fs.existsSync(projectsDir)) {
    return false;
  }

  // Scan all subdirectories for {sessionId}.jsonl
  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of projectDirs) {
    const transcriptPath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(transcriptPath)) {
      return true;
    }
  }

  return false;
};

// Configure commander program
const program = new Command()
  .name('execute-claude-sdk-query')
  .description('Executes the Anthropic Agent SDK inside a Modal sandbox')
  .argument('<prompt>', 'The user\'s message/prompt to send to the agent')
  .option('-s, --session-id <sessionId>', 'The session id to use')
  .option('-c, --cwd <cwd>', 'The working directory to use. Default is /workspace')
  .parse();

// Extract parsed arguments
const prompt = program.args[0];
const options = program.opts();
const sessionId = options.sessionId;
const cwd = options.cwd || '/workspace';


if (!sessionId) { throw new Error("Session ID is required"); }
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
    let options : Options = {
      // Working directory
      cwd: cwd,

      // Load .claude/ configurations
      settingSources: ['project', 'local'] as SettingSource[],

      // Enable streaming of partial messages
      includePartialMessages: true,

      // Reasonable limits
      // maxTurns: 50,
      maxBudgetUsd: 5.0,


      // Permission mode - accept edits but allow tool use
      permissionMode: 'bypassPermissions',

      // MCP Servers - Register Convex backend tools
      mcpServers: {
        // convex: convexTools,
      },
    };


    // Check if session already exists by looking for transcript file
    const needsCreation = !sessionExists(sessionId);

    let generator: Query;
    if (needsCreation) {
      generator = query({
        prompt,
        options: {
          ...options,
          extraArgs: {
            'session-id': sessionId,
          }
        }
      });
    } else {
      generator = query({
        prompt,
        options: {
          ...options,
          resume: sessionId
        }
      });
    }

    await processQueryGenerator(generator);


    // Success - exit cleanly
    process.exit(0);
  } catch (error: any) {
    // Write error as JSONL message to stdout so adapter can process it
    const errorMsg = {
      type: 'system',
      subtype: 'error',
      error: {
        message: error.message || 'Unknown error',
        name: error.name,
      },
      timestamp: Date.now(),
    };

    console.log(JSON.stringify(errorMsg));
    process.exit(1);
  }
}


const processQueryGenerator = async (generator: Query) => {
    for await (const msg of generator) {
      // Write message as single-line JSON
      console.log(JSON.stringify(msg));

      // Flush stdout to ensure immediate delivery
      if (process.stdout.write('')) {
        // Write succeeded
      }
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
