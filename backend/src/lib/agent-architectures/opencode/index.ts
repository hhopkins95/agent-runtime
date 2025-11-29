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

import { basename } from 'path';
import { AgentArchitectureAdapter, AgentArchitectureStaticMethods, WorkspaceFileEvent, TranscriptChangeEvent } from '../base.js';
import { AgentProfile } from '../../../types/agent-profiles.js';
import { StreamEvent } from '../../../types/session/streamEvents.js';
import { SandboxPrimitive } from '../../sandbox/base.js';
import { ConversationBlock } from '../../../types/session/blocks.js';
import { logger } from '../../../config/logger.js';
import { randomUUID } from 'crypto';
import { parseOpenCodeTranscriptFile } from './opencode-transcript-parser.js';
import { streamJSONL } from '../../helpers/stream.js';
import { Event as OpenCodeEvent } from '@opencode-ai/sdk';
import { parseOpencodeStreamEvent } from './block-converter.js';


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

  public async setupAgentProfile(args: { agentProfile: AgentProfile }): Promise<void> {
    const paths = this.getPaths();
    const profile = args.agentProfile;

    try {
      logger.info({ profileId: profile.id }, 'Setting up agent profile for OpenCode');

      const filesToWrite: { path: string; content: string }[] = [];

      // 1. AGENTS.md file (OpenCode's equivalent of CLAUDE.md)
      if (profile.agentMDFile) {
        filesToWrite.push({
          path: paths.AGENT_MD_FILE,
          content: profile.agentMDFile,
        });
      }

      // 2. Subagent definitions → .opencode/agent/
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

      // 3. Custom commands → .opencode/command/
      if (profile.commands && profile.commands.length > 0) {
        const commandsDir = `${paths.AGENT_PROFILE_DIR}/command`;
        for (const command of profile.commands) {
          filesToWrite.push({
            path: `${commandsDir}/${command.name}.md`,
            content: command.prompt,
          });
        }
      }

      // 4. Skills → .opencode/skills/{skillName}/
      // Uses the opencode-skills plugin (https://github.com/malhashemi/opencode-skills)
      // which implements Anthropic's Skills specification
      if (profile.skills && profile.skills.length > 0) {
        const skillsDir = `${paths.AGENT_PROFILE_DIR}/skills`;
        for (const skill of profile.skills) {
          const skillDir = `${skillsDir}/${skill.name}`;

          // Create SKILL.md with frontmatter
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

      // 5. OpenCode configuration file
      // Include opencode-skills plugin if skills are defined
      const plugins: string[] = [];
      if (profile.skills && profile.skills.length > 0) {
        plugins.push('opencode-skills');
      }

      // Build MCP server configuration if present
      // OpenCode uses a slightly different MCP config format than Claude SDK
      let mcpConfig: Record<string, unknown> | undefined;
      // if (profile.mcp && profile.mcp.length > 0) {
      //   mcpConfig = {
      //     stdio: profile.mcp.map((server) => ({
      //       command: server.command,
      //       args: server.args || [],
      //       ...(server.env && { env: server.env }),
      //     })),
      //   };
      // }

      filesToWrite.push({
        path: `${paths.AGENT_PROFILE_DIR}/opencode.json`,
        content: JSON.stringify(
          {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            permission: {
              bash: 'allow', // Non-interactive mode
              edit: 'allow',
              external_directory: false,
            },
            ...(plugins.length > 0 && { plugin: plugins }),
            ...(mcpConfig && { mcp: mcpConfig }),
          },
          null,
          2
        ),
      });

      // Write all files in a batch
      if (filesToWrite.length > 0) {
        logger.debug({ fileCount: filesToWrite.length }, 'Writing OpenCode profile files');
        const result = await this.sandbox.writeFiles(filesToWrite);

        if (result.failed.length > 0) {
          logger.warn(
            { failed: result.failed, succeeded: result.success.length },
            'Some OpenCode profile files failed to write'
          );
        }
      }

      logger.info({ profileId: profile.id }, 'OpenCode agent profile setup complete');
    } catch (error) {
      logger.error({ error, profileId: profile.id }, 'Failed to setup OpenCode agent profile');
      throw error;
    }
  }

  public async setupSessionTranscripts(args: {
    sessionId: string;
    mainTranscript: string;
    subagents: { id: string; transcript: string }[];
  }): Promise<void> {

    const randomId = randomUUID()
    const filePath = `/tmp/${randomId}.json`

    // write the transcript to a random tmp file 
    await this.sandbox.writeFile(filePath, args.mainTranscript);

    // import the transcript into opencode
    await this.sandbox.exec(['opencode', 'session', 'import', filePath]);
  }

  public async readSessionTranscripts(_args: {}): Promise<{
    main: string | null;
    subagents: { id: string; transcript: string }[];
  }> {
    const result = await this.sandbox.exec(['opencode', 'export', this.sessionId]);
    const exitCode = await result.wait();
    const stdout = await result.stdout.getReader().read()

    if (exitCode !== 0) {
      const stderr = await result.stderr.getReader().read();
      logger.error({ exitCode, stderr, sessionId: this.sessionId }, 'OpenCode export command failed');
      return { main: null, subagents: [] };
    }

    return {
      main: stdout.value || null,
      subagents: [],
    };
  }

  public async *executeQuery(args: { query: string }): AsyncGenerator<StreamEvent> {
    const command = ['tsx', '/app/execute-opencode-query.ts', args.query, '--session-id', this.sessionId];

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
    const newTranscript = await this.readSessionTranscripts({})
    if (newTranscript.main) {
      this.emitTranscriptChange({ type: 'main', content: newTranscript.main });
    }

    logger.info({ sessionId: this.sessionId, messageCount }, 'OpenCode SDK query completed');
  } catch(error: Error) {
    logger.error({ error, sessionId: this.sessionId }, 'Error during SDK execution');
    throw error;
  }


  public parseTranscripts(rawTranscript: string, subagents: { id: string; transcript: string }[]): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } {
    return OpenCodeAdapter.parseTranscripts(rawTranscript, subagents);
  }

  // Static methods
  public static createSessionId(): string {
    const timestamp = Date.now();
    const timeBytes = timestamp.toString(16).padStart(12, '0');
    const random = Math.random().toString(36).substring(2, 13);
    return `ses_${timeBytes}_${random}`;
  }

  public static parseTranscripts(
    rawTranscript: string,
    subagents: { id: string; transcript: string }[]
  ): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } {
    if (!rawTranscript) {
      return { blocks: [], subagents: [] };
    }

    return parseOpenCodeTranscriptFile(rawTranscript)

  }

  public async watchWorkspaceFiles(callback: (event: WorkspaceFileEvent) => void): Promise<void> {
    const paths = this.getPaths();

    await this.sandbox.watch(paths.WORKSPACE_DIR, (event) => {
      callback({
        type: event.type,
        path: event.path,
        content: event.content,
      });
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
