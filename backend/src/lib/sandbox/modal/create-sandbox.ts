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

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively build dockerfile commands to copy sandbox directory into /app
 *
 * Reads all files from apps/agent-service/sandbox/ (except node_modules)
 * and generates RUN commands to recreate them in the Modal image at /app/
 *
 * @returns Array of dockerfile commands
 */
export function buildSandboxImageCommands(): string[] {
  const commands: string[] = [];

  // Get the sandbox directory path
  // From: /path/to/apps/agent-service/src/adapters/modal/sandbox.ts
  // To:   /path/to/apps/agent-service/sandbox/
  const sandboxDir = path.resolve(__dirname, '../../../../sandbox');

  if (!fs.existsSync(sandboxDir)) {
    logger.warn({ sandboxDir }, 'Sandbox directory not found, skipping file copy');
    return ['RUN mkdir -p /app'];
  }

  logger.info({ sandboxDir }, 'Building sandbox image commands...');

  // Create /app directory
  commands.push('RUN mkdir -p /app');

  /**
   * Recursively process directory and generate commands
   */
  function processDirectory(dir: string, relativePath: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativeFilePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      // Skip node_modules directory
      if (entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        // Create directory in image
        const targetDir = `/app/${relativeFilePath}`;
        commands.push(`RUN mkdir -p ${targetDir}`);

        // Recursively process subdirectory
        processDirectory(fullPath, relativeFilePath);
      } else if (entry.isFile()) {
        // Read file content
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Escape content for shell (handle quotes and special chars)
        // Using base64 encoding to safely transfer content
        const base64Content = Buffer.from(content).toString('base64');
        const targetFile = `/app/${relativeFilePath}`;

        // Use base64 decoding to write file (avoids quote escaping issues)
        commands.push(`RUN echo '${base64Content}' | base64 -d > ${targetFile}`);

        logger.debug({ file: relativeFilePath, size: content.length }, 'Added file to image');
      }
    }
  }

  // Process the sandbox directory
  processDirectory(sandboxDir);

  logger.info({ commandCount: commands.length }, 'Sandbox image commands built');

  return commands;
}

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

    // Build dockerfile commands to copy sandbox directory into /app
    const sandboxCommands = buildSandboxImageCommands();

    // Build custom image with Node.js 22 and sandbox application
    // This image is cached by Modal and reused across sandboxes
    const image = modal.images
      .fromRegistry('node:22-slim')
      .dockerfileCommands([
        // Copy all files from sandbox/ to /app/ in image
        ...sandboxCommands,

        // Install dependencies in /app
        'WORKDIR /app',
        'RUN npm install',

        // Install Claude Code CLI globally (needed by the claude-agent-sdk)
        'RUN npm install -g @anthropic-ai/claude-code',

        // Install the Gemini CLI globally (executed directly by gemini agents)
        'RUN npm install -g @google/gemini-cli',

        'RUN npm install -g tsx',
        // Set working directory to /workspace for SDK operations
        `WORKDIR ${workdir}`
      ])

    logger.info('Building/using cached image with Node.js 22 and sandbox application...');


    logger.info({
      claudeCodeCwd: workdir,
    })

    // Create sandbox with configuration
    const sandbox = await modal.sandboxes.create(app, image, {
      workdir: workdir,
      idleTimeoutMs : 1000 * 60 * 15, // 15 minutes
      env: {
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
        CLAUDE_CODE_CWD: workdir,
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
