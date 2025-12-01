/**
 * Modal Sandbox Operations
 *
 * Handles sandbox creation, configuration, and termination.
 */

import type { Sandbox } from 'modal';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ModalContext } from './client.js';
import { AgentProfile } from '../../../types/agent-profiles.js';
import { generateCopyFileCommands, generateSandboxAppInstallCommands } from '../../helpers/generate-docker-commands.js';
import { normalizeString } from '../../util/normalize-string.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const localSandboxAppDir = path.resolve(__dirname, '../../../../sandbox');

/**
 * Create a new Modal sandbox with standard configuration
 *
 * @param modalContext Modal client and app context
 * @param options Configuration options for the sandbox
 * @returns Modal Sandbox instance
 */
export async function createModalSandbox(
  modalContext: ModalContext,
  agentProfile : AgentProfile
): Promise<Sandbox> {

  const workdir = "/workspace";

  const { modal, app } = modalContext;

  try {
    logger.info('Creating Modal sandbox with custom image...');

    let customCommands: string[] = [];

    // Build dockerfile commands to copy sandbox directory into /app
    customCommands.push(...generateSandboxAppInstallCommands({
      localDirPath: localSandboxAppDir,
      targetSandboxDirPath: "/app",
    }));


    // For each mcp in the agent profile, build the app commands
    if (agentProfile.bundledMCPs) {
    for (const localmcp of agentProfile.bundledMCPs) { 
      const sandboxPath = path.join("/mcps", normalizeString(localmcp.name));
      customCommands.push(...generateSandboxAppInstallCommands({
        localDirPath: localmcp.localProjectPath,
        targetSandboxDirPath: sandboxPath,
      }));
    }
  }

    // Build custom image with Node.js 22 and sandbox application
    // This image is cached by Modal and reused across sandboxes
    const image = modal.images
      .fromRegistry('node:22-slim')
      .dockerfileCommands([
        // Copy all files from sandbox/ to /app/ in image
        ...customCommands,

        // Install dependencies in /app
        'WORKDIR /app',
        'RUN npm install',

        // Install Claude Code CLI globally (needed by the claude-agent-sdk)
        'RUN npm install -g @anthropic-ai/claude-code',

        // Install the Gemini CLI globally (executed directly by gemini agents)
        'RUN npm install -g @google/gemini-cli',

        'RUN npm i -g opencode-ai@latest',

        'RUN npm install -g tsx',

        'RUN npm install -g chokidar-cli',
        // Set working directory to /workspace for SDK operations
        `WORKDIR ${workdir}`
      ])

    logger.info('Building/using cached image with Node.js 22 and sandbox application...');

    // Create sandbox with configuration
    const sandbox = await modal.sandboxes.create(app, image, {
      workdir: workdir,
      timeoutMs : 1000 * 60 * 60 * 24, // 24 hours
      idleTimeoutMs : 1000 * 60 * 15, // 15 minutes
      env: {
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
        CLAUDE_CODE_CWD: workdir,
        OPENCODE_API_KEY: process.env.OPENCODE_API_KEY || "",
        IS_SANDBOX: "1", // see https://github.com/anthropics/claude-agent-sdk-typescript/issues/54
      },
    });

    logger.info({
      sandboxId: sandbox.sandboxId
    }, 'Modal sandbox created successfully');

    return sandbox;
  } catch (error) {
    logger.error({ error }, 'Failed to create Modal sandbox');
    throw error;
  }
}
