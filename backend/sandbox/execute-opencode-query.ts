#!/usr/bin/env tsx
/**
 * Opencode Executor - Runs inside Modal sandbox
 *
 * This script executes the Opencode SDK inside a Modal sandbox
 * and streams SDK messages as JSONL to stdout for consumption by the
 * agent-service.
 *
 * Usage:
 *   tsx execute-opencode-query.ts "<prompt>" --session-id <sessionId> --model <model>
 *
 * Arguments:
 *   prompt              - The user's message/prompt to send to the agent
 *   --session-id <id>   - The session ID to use (required)
 *   --model <model>     - Model in format "provider/model" (e.g., "anthropic/claude-sonnet-4-20250514")
 *   --cwd <path>        - Working directory (default: /workspace)
 *
 * Output:
 *   Streams JSONL messages to stdout, one per line
 *   Each line is a JSON-serialized Opencode event
 */

import { createOpencode } from "@opencode-ai/sdk";
import { exec } from "child_process";
import { Command } from "commander";
import { writeFile } from "fs/promises";
import { promisify } from "util";

const execAsync = promisify(exec);

// Configure commander program
const program = new Command()
  .name("execute-opencode-query")
  .description("Executes the Opencode SDK inside a Modal sandbox")
  .argument("<prompt>", "The user's message/prompt to send to the agent")
  .option("-s, --session-id <sessionId>", "The session id to use")
  .option("-m, --model <model>", "Model in format provider/model (e.g., anthropic/claude-sonnet-4-20250514)")
  .option("-c, --cwd <cwd>", "The working directory to use. Default is /workspace")
  .parse();

// Extract parsed arguments
const prompt = program.args[0];
const options = program.opts();
const sessionId = options.sessionId;
const model = options.model;
const _cwd = options.cwd || "/workspace"; // TODO: Use cwd when opencode supports it

if (!sessionId) {
  throw new Error("Session ID is required");
}

if (!model) {
  throw new Error("Model is required (format: provider/model)");
}

// Parse model string into provider and model ID
const modelParts = model.split("/");
if (modelParts.length !== 2) {
  throw new Error("Model must be in format provider/model (e.g., anthropic/claude-sonnet-4-20250514)");
}
const [providerID, modelID] = modelParts;

// Server and client references for cleanup
let server: { close: () => void } | null = null;

/**
 * Execute the agent query
 */
async function executeQuery() {
  try {
    // Start opencode server and client
    const opencode = await createOpencode({
      hostname: "127.0.0.1",
      port: 4096,
    });

    server = opencode.server;
    const client = opencode.client;

    console.log(`Client created`);

    // Check if session exists, create if not
    const existingSession = await client.session.get({ path: { id: sessionId } });
    console.log(`Existing session: ${JSON.stringify(existingSession)}`);
    if (!existingSession.data) {
      console.log(`Session ${sessionId} does not exist, creating...`);
      await createSessionWithId(sessionId);
      console.log(`Session ${sessionId} created!`);
    } else { 
    console.log(`Session ${sessionId} already exists`);
    }


    // Subscribe to events and stream them as JSONL
    const eventPromise = (async () => {
      const events = await client.event.subscribe();
      for await (const event of events.stream) {
        console.log(JSON.stringify(event));

        // Flush stdout to ensure immediate delivery
        if (process.stdout.write("")) {
          // Write succeeded
        }

        // Break when session goes idle (processing complete)
        if (event.type === 'session.idle' && event.properties.sessionID === sessionId) {
          break;
        }
      }
    })();


    // authenticate 
    await client.auth.set({
      path: { id: "zen" },
      body: {
        type: "api",
        key: process.env.OPENCODE_API_KEY || "",
      }


    })


    // Send the prompt
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID, modelID },
        parts: [{ type: "text", text: prompt }],

      },

    });


    // Wait for event stream to complete
    await eventPromise;

    console.log(`Event stream completed`);
    // Close server and exit
    server?.close();
    process.exit(0);
  } catch (error: any) {
    // Write error as JSONL message to stdout so adapter can process it
    const errorMsg = {
      type: "system",
      subtype: "error",
      error: {
        message: error.message || "Unknown error",
        name: error.name,
      },
      timestamp: Date.now(),
    };

    console.log(JSON.stringify(errorMsg));

    // Ensure server is closed
    server?.close();
    process.exit(1);
  }
}

// Handle termination signals gracefully
process.on("SIGINT", () => {
  console.log(
    JSON.stringify({
      type: "interrupted",
      message: "SDK execution interrupted by signal",
      timestamp: Date.now(),
    })
  );
  server?.close();
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.log(
    JSON.stringify({
      type: "terminated",
      message: "SDK execution terminated by signal",
      timestamp: Date.now(),
    })
  );
  server?.close();
  process.exit(143);
});

// Execute
executeQuery();



// Helper to create a session 


async function createSessionWithId(sessionId: string) {

  const sessionFileContents = `
{
  "info": {
    "id": "${sessionId}",
    "version": "1.0.120",
    "projectID": "global",
    "directory": "${_cwd}",
    "title": "Greeting and quick check-in",
    "time": {
      "created": ${Date.now()},
      "updated": ${Date.now()}
    },
    "summary": {
      "additions": 0,
      "deletions": 0,
      "files": 0
    }
  },
  messages : []
}
  `
  await writeFile(`/tmp/${sessionId}.json`, sessionFileContents);
  await execAsync(`opencode import /tmp/${sessionId}.json`);

  console.log(`Session ${sessionId} created`);
}