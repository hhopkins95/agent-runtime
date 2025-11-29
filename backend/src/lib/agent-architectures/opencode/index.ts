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



export interface OpenCodeSessionOptions { 
  model? : string,
}


export class OpenCodeAdapter implements AgentArchitectureAdapter<OpenCodeSessionOptions> {

  public constructor(
    private readonly sandbox: SandboxPrimitive,
    private readonly sessionId: string
  ) {}

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
    const paths = this.getPaths();
    const storagePath = `${paths.AGENT_STORAGE_DIR}/storage`;

    try {
      // Read session file
      const sessionPath = `${storagePath}/session/${this.projectId}/${this.sessionId}.json`;
      const sessionJson = await this.sandbox.readFile(sessionPath);

      if (!sessionJson) {
        return { main: null, subagents: [] };
      }

      const session: OpenCodeSession = JSON.parse(sessionJson);

      // Read all messages for this session
      const messageDir = `${storagePath}/message/${this.sessionId}`;
      const messageFiles = await this.sandbox.listFiles(messageDir, '*.json');

      const messagesWithParts: OpenCodeMessageWithParts[] = [];

      for (const msgFile of messageFiles) {
        const msgJson = await this.sandbox.readFile(msgFile);
        if (!msgJson) continue;

        const message: OpenCodeMessage = JSON.parse(msgJson);

        // Read parts for this message
        const partDir = `${storagePath}/part/${message.id}`;
        const partFiles = await this.sandbox.listFiles(partDir, '*.json');

        const parts: OpenCodePart[] = [];
        for (const partFile of partFiles) {
          const partJson = await this.sandbox.readFile(partFile);
          if (partJson) {
            parts.push(JSON.parse(partJson));
          }
        }

        // Sort parts by time if available
        parts.sort((a, b) => {
          const aTime = getPartStartTime(a);
          const bTime = getPartStartTime(b);
          return aTime - bTime;
        });

        messagesWithParts.push({ message, parts });
      }

      // Sort messages by creation time
      messagesWithParts.sort((a, b) => {
        return a.message.time.created - b.message.time.created;
      });

      // Calculate totals
      let totalCost = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for (const { message } of messagesWithParts) {
        if (message.role === 'assistant') {
          totalCost += message.cost || 0;
          totalInputTokens += message.tokens?.input || 0;
          totalOutputTokens += message.tokens?.output || 0;
        }
      }

      // Build our intermediate format
      const transcript: OpenCodeSessionTranscript = {
        version: 1,
        sessionId: this.sessionId,
        projectId: this.projectId,
        session,
        messages: messagesWithParts,
        metadata: {
          createdAt: new Date(session.time.created).toISOString(),
          updatedAt: new Date(session.time.updated).toISOString(),
          totalCost,
          totalTokens: {
            input: totalInputTokens,
            output: totalOutputTokens,
          },
        },
      };

      return {
        main: JSON.stringify(transcript),
        subagents: [], // OpenCode handles subagents inline
      };
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Error reading OpenCode session transcripts');
      return { main: null, subagents: [] };
    }
  }

  public async *executeQuery(args: { query: string }): AsyncGenerator<StreamEvent> {
    // TODO: Implement actual OpenCode execution
    // This will either:
    // 1. Use `opencode serve` HTTP API with SSE streaming
    // 2. Use `opencode -p "prompt" -f json` CLI mode

    logger.warn({ sessionId: this.sessionId }, 'OpenCode executeQuery not yet implemented');

    throw new Error('OpenCode executeQuery not yet implemented. This is a stub implementation.');
  }

  public parseTranscripts(rawTranscript: string, subagents: { id: string; transcript: string }[]): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } {
    return OpenCodeAdapter.parseTranscripts(rawTranscript, subagents);
  }

  /**
   * Convert an OpenCode part to ConversationBlock(s)
   */
  private static convertPartToBlocks(part: OpenCodePart, message: OpenCodeMessage): ConversationBlock[] {
    const timestamp = new Date(getPartStartTime(part) || message.time.created).toISOString();

    switch (part.type) {
      case 'text':
        return [
          {
            type: 'assistant_text',
            id: part.id,
            timestamp,
            content: part.text,
            model: message.role === 'assistant' ? message.modelID : undefined,
          },
        ];

      case 'reasoning':
        return [
          {
            type: 'thinking',
            id: part.id,
            timestamp,
            content: part.text,
          },
        ];

      case 'tool': {
        const blocks: ConversationBlock[] = [
          {
            type: 'tool_use',
            id: part.id,
            timestamp,
            toolName: part.tool,
            toolUseId: part.callID,
            input: part.state.input || {},
            status: OpenCodeAdapter.mapToolStatus(part.state.status),
          },
        ];

        // Add result if completed or errored
        if (part.state.status === 'completed' || part.state.status === 'error') {
          const endTime = part.state.time?.end || part.time?.end;
          const startTime = part.state.time?.start || part.time?.start;
          const durationMs = endTime && startTime ? endTime - startTime : undefined;

          blocks.push({
            type: 'tool_result',
            id: `${part.id}_result`,
            timestamp: endTime ? new Date(endTime).toISOString() : timestamp,
            toolUseId: part.callID,
            output: part.state.output,
            isError: part.state.status === 'error',
            durationMs,
          });
        }

        return blocks;
      }

      case 'step-start':
        return [
          {
            type: 'system',
            id: part.id,
            timestamp,
            subtype: 'session_start',
            message: `Step ${part.step} started`,
            metadata: { step: part.step, snapshot: part.snapshot },
          },
        ];

      case 'step-finish':
        return [
          {
            type: 'system',
            id: part.id,
            timestamp,
            subtype: 'session_end',
            message: `Step ${part.step} finished`,
            metadata: {
              step: part.step,
              tokens: part.tokens,
              cost: part.cost,
            },
          },
        ];

      case 'subtask':
        return [
          {
            type: 'subagent',
            id: part.id,
            timestamp,
            subagentId: `subtask-${part.id}`,
            name: part.agent,
            input: part.prompt,
            status: 'pending',
          },
        ];

      case 'agent':
        return [
          {
            type: 'subagent',
            id: part.id,
            timestamp,
            subagentId: part.source?.sessionID || `agent-${part.id}`,
            name: part.name,
            input: '',
            status: 'success',
          },
        ];

      case 'retry':
        return [
          {
            type: 'system',
            id: part.id,
            timestamp,
            subtype: 'error',
            message: `Retry attempt ${part.attempt}: ${part.error.message}`,
            metadata: {
              attempt: part.attempt,
              error: part.error,
            },
          },
        ];

      // Parts we don't convert to blocks
      case 'file':
      case 'snapshot':
      case 'patch':
      case 'compaction':
        return [];

      default:
        logger.warn({ partType: (part as any).type }, 'Unknown OpenCode part type');
        return [];
    }
  }

  private static mapToolStatus(status: string): 'pending' | 'running' | 'success' | 'error' {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'running':
        return 'running';
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'pending';
    }
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

    const transcript: OpenCodeSessionTranscript = JSON.parse(rawTranscript);
    const blocks: ConversationBlock[] = [];

    for (const { message, parts } of transcript.messages) {
      if (message.role === 'user') {
        // Extract text from user message parts
        const textParts = parts.filter((p) => p.type === 'text');
        const content = textParts.map((p) => (p as any).text).join('\n');

        blocks.push({
          type: 'user_message',
          id: message.id,
          timestamp: new Date(message.time.created).toISOString(),
          content,
        });
      } else if (message.role === 'assistant') {
        // Process each part
        for (const part of parts) {
          const partBlocks = OpenCodeAdapter.convertPartToBlocks(part, message);
          blocks.push(...partBlocks);
        }
      }
    }

    // OpenCode doesn't have separate subagent transcripts
    return { blocks, subagents: [] };
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
    const paths = this.getPaths();
    const storagePath = `${paths.AGENT_STORAGE_DIR}/storage`;

    await this.sandbox.watch(storagePath, async (event) => {
      // Only process file additions and changes (not unlinks)
      if (event.type === 'unlink' || !event.content) {
        return;
      }

      const fileName = basename(event.path);
      const identification = this.identifySessionTranscriptFile({ fileName, content: event.content });

      if (!identification) {
        return;
      }

      // OpenCode doesn't have separate subagent transcripts - all changes are main
      // We need to re-read the full session to get the complete transcript
      try {
        const { main } = await this.readSessionTranscripts({});
        if (main) {
          callback({ type: 'main', content: main });
        }
      } catch (error) {
        logger.error({ error, path: event.path }, 'Error reading session transcripts on file change');
      }
    });
  }
}
