/**
 * OpenCode Agent Architecture Adapter
 *
 * Adapter for the OpenCode AI coding agent (https://github.com/sst/opencode).
 * OpenCode uses a file-based JSON storage format with hierarchical structure:
 * - storage/project/{projectID}.json
 * - storage/session/{projectID}/{sessionID}.json
 * - storage/message/{sessionID}/{messageID}.json
 * - storage/part/{messageID}/{partID}.json
 */

import { Event as OpenCodeEvent } from '@opencode-ai/sdk';
import { randomUUID } from 'crypto';
import { logger } from '../../../config/logger.js';
import { AgentProfile } from '../../../types/agent-profiles.js';
import { ConversationBlock } from '../../../types/session/blocks.js';
import { StreamEvent } from '../../../types/session/streamEvents.js';
import { readStreamToString, streamJSONL } from '../../helpers/stream.js';
import { SandboxPrimitive } from '../../sandbox/base.js';
import { AgentArchitectureAdapter, TranscriptChangeEvent, WorkspaceFileEvent } from '../base.js';
import { parseOpencodeStreamEvent } from './block-converter.js';
import { parseOpenCodeTranscriptFile } from './opencode-transcript-parser.js';
import { WorkspaceFile } from '../../../types/session/index.js';
import { buildConfigJson } from './build-config-json.js';


export interface OpenCodeSessionOptions {
  model?: string,
}


export class OpenCodeAdapter implements AgentArchitectureAdapter<OpenCodeSessionOptions> {

  private transcriptChangeCallback?: (event: TranscriptChangeEvent) => void;

  public constructor(
    private readonly sandbox: SandboxPrimitive,
    private readonly sessionId: string
  ) { }

  public getPaths(): {
    AGENT_STORAGE_DIR: string;
    WORKSPACE_DIR: string;
    AGENT_PROFILE_DIR: string;
    AGENT_MD_FILE: string;
  } {
    return {
      // OpenCode stores data in ~/.local/share/opencode/
      AGENT_STORAGE_DIR: `/root/.local/share/opencode`,
      WORKSPACE_DIR: `/workspace`,
      AGENT_PROFILE_DIR: `/workspace/.opencode`,
      AGENT_MD_FILE: `/workspace/.opencode/AGENTS.md`,
    };
  }


  public async initializeSession(args: {
    sessionId: string,
    sessionTranscript: string | undefined,
    agentProfile: AgentProfile,
    workspaceFiles: WorkspaceFile[]
  }): Promise<void> {
    logger.info({ sessionId: args.sessionId, profileId: args.agentProfile.id }, 'Initializing session');

    const paths = this.getPaths();
    const profile = args.agentProfile;

    // Ensure directories exist
    await this.sandbox.exec(['mkdir', '-p', paths.AGENT_PROFILE_DIR]);

    // Collect all files to write in batches
    const filesToWrite: { path: string; content: string }[] = [];

    // --- Transcript restoration ---
    if (args.sessionTranscript) {
      const tempPath = `/tmp/${randomUUID()}.json`;
      await this.sandbox.writeFile(tempPath, args.sessionTranscript);
      await this.sandbox.exec(['opencode', 'session', 'import', tempPath]);
    }

    // --- AGENTS.md file (OpenCode's equivalent of CLAUDE.md) ---
    if (profile.agentMDFile) {
      filesToWrite.push({
        path: paths.AGENT_MD_FILE,
        content: profile.agentMDFile,
      });
    }

    // --- Subagent definitions → .opencode/agent/ ---
    if (profile.subagents && profile.subagents.length > 0) {
      const agentsDir = `${paths.AGENT_PROFILE_DIR}/agent`;
      for (const subagent of profile.subagents) {
        const subagentContent = [
          `# ${subagent.name}`,
          '',
          subagent.description || '',
          '',
          subagent.prompt,
        ].join('\n');

        filesToWrite.push({
          path: `${agentsDir}/${subagent.name}.md`,
          content: subagentContent,
        });
      }
    }

    // --- Custom commands → .opencode/command/ ---
    if (profile.commands && profile.commands.length > 0) {
      const commandsDir = `${paths.AGENT_PROFILE_DIR}/command`;
      for (const command of profile.commands) {
        filesToWrite.push({
          path: `${commandsDir}/${command.name}.md`,
          content: command.prompt,
        });
      }
    }

    // --- Skills → .opencode/skills/{skillName}/ ---
    if (profile.skills && profile.skills.length > 0) {
      const skillsDir = `${paths.AGENT_PROFILE_DIR}/skills`;
      for (const skill of profile.skills) {
        const skillDir = `${skillsDir}/${skill.name}`;

        // Create SKILL.md with YAML frontmatter
        const skillContent = [
          '---',
          `name: ${skill.name}`,
          `description: "${skill.description.replace(/"/g, '\\"')}"`,
          '---',
          '',
          skill.skillMd,
        ].join('\n');

        filesToWrite.push({
          path: `${skillDir}/SKILL.md`,
          content: skillContent,
        });

        // Add supporting files
        if (skill.supportingFiles && skill.supportingFiles.length > 0) {
          for (const file of skill.supportingFiles) {
            filesToWrite.push({
              path: `${skillDir}/${file.relativePath}`,
              content: file.content,
            });
          }
        }
      }
    }

    // --- Config file (permissions + plugins + MCP) ---
    const mcpServersPath = this.sandbox.getBasePaths().BUNDLED_MCP_DIR;
    const config = buildConfigJson(profile, mcpServersPath);
    filesToWrite.push({
      path: `${paths.AGENT_PROFILE_DIR}/opencode.json`,
      content: JSON.stringify(config, null, 2),
    });

    // Write all files in batch
    if (filesToWrite.length > 0) {
      logger.debug({ fileCount: filesToWrite.length }, 'Writing OpenCode profile files');
      const result = await this.sandbox.writeFiles(filesToWrite);

      if (result.failed.length > 0) {
        logger.warn({ failed: result.failed }, 'Some OpenCode profile files failed to write');
      }
    }

    logger.info({ sessionId: args.sessionId }, 'Session initialization complete');
  }

  public async readSessionTranscript(): Promise<string | null> {
    const result = await this.sandbox.exec(['opencode', 'export', this.sessionId]);
    const exitCode = await result.wait();

    // Read all stdout content using universal stream helper
    const stdout = await readStreamToString(result.stdout);

    if (exitCode !== 0) {
      const stderr = await readStreamToString(result.stderr);
      logger.error({ exitCode, stderr, sessionId: this.sessionId }, 'OpenCode export command failed');
      return null;
    }

    return stdout || null;
  }

  public async *executeQuery(args: { query: string, options? : OpenCodeSessionOptions }): AsyncGenerator<StreamEvent> {

    const model = args.options?.model || 'opencode/gemini-3-pro';
    const command = ['tsx', '/app/execute-opencode-query.ts', args.query, '--session-id', this.sessionId, '--model', model];

    logger.debug({ command }, 'Executing OpenCode command');

    // Execute SDK script in sandbox
    const { stdout, stderr } = await this.sandbox.exec(command);

    // Capture stderr in background
    const stderrLines: string[] = [];
    const stderrPromise = (async () => {
      try {
        for await (const line of streamJSONL<any>(stderr, 'opencode-stderr', logger)) {
          stderrLines.push(JSON.stringify(line));
          logger.warn({ sessionId: this.sessionId, stderr: line }, 'Claude SDK stderr');
        }
      } catch (error) {
        // Stderr parsing errors are not critical
        logger.debug({ error }, 'Error parsing stderr (non-critical)');
      }
    })();

    // Stream JSONL messages and convert to StreamEvents
    let messageCount = 0;
    for await (const opencodeEvent of streamJSONL<OpenCodeEvent>(stdout, 'claude-sdk', logger)) {
      messageCount++;



      // Convert SDK message to StreamEvents and yield each one
      const streamEvents = parseOpencodeStreamEvent(opencodeEvent, this.sessionId);
      for (const event of streamEvents) {
        yield event;
      }
    }

    // Wait for stderr reader to complete
    await stderrPromise;

    // Check for failed execution with no output
    if (messageCount === 0 && stderrLines.length > 0) {
      throw new Error(`OpenCode SDK failed with no output. Stderr: ${stderrLines.join('\n')}`);
    }

    // emit a transcript change event
    const newTranscript = await this.readSessionTranscript()
    if (newTranscript) {
      this.emitTranscriptChange({ content: newTranscript });
    }

    logger.info({ sessionId: this.sessionId, messageCount }, 'OpenCode SDK query completed');
  } catch(error: Error) {
    logger.error({ error, sessionId: this.sessionId }, 'Error during SDK execution');
    throw error;
  }


  public parseTranscript(rawTranscript: string): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } {
    return OpenCodeAdapter.parseTranscript(rawTranscript);
  }

  // Static methods
  public static createSessionId(): string {
    const timestamp = Date.now();
    const timeBytes = timestamp.toString(16).padStart(12, '0');
    const random = Math.random().toString(36).substring(2, 13);
    return `ses_${timeBytes}_${random}`;
  }

  public static parseTranscript(rawTranscript: string): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } {
    if (!rawTranscript) {
      return { blocks: [], subagents: [] };
    }

    return parseOpenCodeTranscriptFile(rawTranscript);
  }

  public async watchWorkspaceFiles(callback: (event: WorkspaceFileEvent) => void): Promise<void> {
    const paths = this.getPaths();

    await this.sandbox.watch(paths.WORKSPACE_DIR, (event) => {
      callback({
        type: event.type,
        path: event.path,
        content: event.content,
      });
    }, {
      ignorePatterns: ['**/.opencode/**'],
    });
  }

  public async watchSessionTranscriptChanges(callback: (event: TranscriptChangeEvent) => void): Promise<void> {
    this.transcriptChangeCallback = callback;
  }

  protected emitTranscriptChange(event: TranscriptChangeEvent): void {
    if (this.transcriptChangeCallback) {
      this.transcriptChangeCallback(event);
    }
  }
}
