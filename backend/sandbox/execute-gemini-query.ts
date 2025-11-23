#!/usr/bin/env tsx
/**
 * Gemini CLI Executor - Runs inside Modal sandbox
 *
 * This script executes the Gemini CLI inside a Modal sandbox
 * and streams CLI output as JSONL to stdout for consumption by the
 * agent-service.
 *
 * Usage:
 *   tsx execute-gemini-query.ts "<prompt>" --resume <sessionId>
 *
 * Arguments:
 *   prompt           - The user's message/prompt to send to the agent
 *   --resume <id>    - (Required) Resume from existing session
 *
 * Output:
 *   Streams JSONL messages to stdout, one per line
 *   Each line is a JSON-serialized message from the Gemini CLI
 *
 * Session Management:
 *   - Gemini always requires a session ID via --resume
 *   - No support for starting new sessions with specific IDs
 */

import { Command } from "commander";
import { spawn } from "child_process";
import * as readline from "readline";

// Configure commander program
const program = new Command()
  .name('execute-gemini-query')
  .description('Executes the Gemini CLI inside a Modal sandbox')
  .argument('<prompt>', 'The user\'s message/prompt to send to the agent')
  .option('-r, --resume <sessionId>', 'Resume from existing session (required)')
  .parse();

// Extract parsed arguments
const prompt = program.args[0];
const options = program.opts();
const sessionId = options.resume;

// Validate required arguments
if (!sessionId) {
  console.error('Error: --resume <sessionId> is required for Gemini');
  process.exit(1);
}

// Validate environment
if (!process.env.GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable not set');
  process.exit(1);
}

/**
 * Execute the Gemini CLI
 */
async function executeQuery() {
  try {
    // Build CLI arguments
    const args = [
      '--resume', sessionId,
      '-p', prompt,
      '--output-format', 'stream-json'
    ];

    // Spawn Gemini CLI process
    const geminiProcess = spawn('gemini', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      }
    });

    // Handle spawn errors
    geminiProcess.on('error', (error) => {
      const errorMsg = {
        type: 'error',
        error: {
          message: `Failed to spawn Gemini CLI: ${error.message}`,
          stack: error.stack,
          name: error.name,
        },
        timestamp: Date.now(),
      };
      console.error(JSON.stringify(errorMsg));
      process.exit(1);
    });

    // Stream stdout line-by-line as JSONL
    const rl = readline.createInterface({
      input: geminiProcess.stdout,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      // Each line from Gemini CLI should already be JSON
      // Write it directly to stdout
      console.log(line);

      // Flush stdout to ensure immediate delivery
      if (process.stdout.write('')) {
        // Write succeeded
      }
    });

    // Capture stderr for error reporting
    let stderrOutput = '';
    const stderrRl = readline.createInterface({
      input: geminiProcess.stderr,
      crlfDelay: Infinity,
    });

    stderrRl.on('line', (line) => {
      stderrOutput += line + '\n';
    });

    // Handle process exit
    geminiProcess.on('close', (code) => {
      if (code === 0) {
        // Success - exit cleanly
        process.exit(0);
      } else {
        // Error - report and exit with error code
        const errorMsg = {
          type: 'error',
          error: {
            message: `Gemini CLI exited with code ${code}`,
            stderr: stderrOutput,
          },
          timestamp: Date.now(),
        };
        console.error(JSON.stringify(errorMsg));
        process.exit(code || 1);
      }
    });

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

    console.error(JSON.stringify(errorMsg));
    process.exit(1);
  }
}

// Handle termination signals gracefully
process.on('SIGINT', () => {
  console.error(JSON.stringify({
    type: 'interrupted',
    message: 'Gemini CLI execution interrupted by signal',
    timestamp: Date.now(),
  }));
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.error(JSON.stringify({
    type: 'terminated',
    message: 'Gemini CLI execution terminated by signal',
    timestamp: Date.now(),
  }));
  process.exit(143);
});

// Execute
executeQuery();
