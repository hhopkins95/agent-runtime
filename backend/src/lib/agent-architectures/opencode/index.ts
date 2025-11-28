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
import { AgentArchitectureAdapter } from '../base.js';
import { AgentProfile } from '../../../types/agent-profiles.js';
import { StreamEvent } from '../../../types/session/streamEvents.js';
import { SandboxPrimitive } from '../../sandbox/base.js';
import { ConversationBlock } from '../../../types/session/blocks.js';
import { logger } from '../../../config/logger.js';
import {
  OpenCodeSessionTranscript,
  OpenCodeMessage,
  OpenCodeMessageWithParts,
  OpenCodePart,
  OpenCodeSession,
  OpenCodeProject,
  ID_PREFIX,
} from './types.js';

/**
 * Generate an OpenCode-style ID
 * Format: prefix_timeBytes_randomString (26 chars total)
 */
function generateOpenCodeId(prefix: string): string {
  const timestamp = Date.now();
  const timeBytes = timestamp.toString(16).padStart(12, '0');
  const random = Math.random().toString(36).substring(2, 13);
  return `${prefix}_${timeBytes}_${random}`;
}

/**
 * Get start time from a part, handling different time structures
 */
function getPartStartTime(part: OpenCodePart): number {
  if (!part.time) return 0;
  // RetryPart has { created: number }, others have { start?: number }
  if ('created' in part.time) {
    return part.time.created;
  }
  return part.time.start || 0;
}

export class OpenCodeAdapter implements AgentArchitectureAdapter<OpenCodeMessage> {
  // Default project ID for sandbox workspace
  private readonly projectId: string;

  public constructor(
    private readonly sandbox: SandboxPrimitive,
    private readonly sessionId: string
  ) {
    // Use a consistent project ID for the workspace
    this.projectId = generateOpenCodeId(ID_PREFIX.project);
  }

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

  public identifySessionTranscriptFile(args: {
    fileName: string;
    content: string;
  }): { isMain: true } | { subagentId: string } | null {
    // OpenCode uses .json files in specific directories
    if (!args.fileName.endsWith('.json')) {
      return null;
    }

    // Session files are the main transcripts
    // OpenCode doesn't have separate subagent transcript files like Claude
    // Subagents are handled inline via 'agent' and 'subtask' parts
    return { isMain: true };
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
      if (profile.mcp && profile.mcp.length > 0) {
        mcpConfig = {
          stdio: profile.mcp.map((server) => ({
            command: server.command,
            args: server.args || [],
            ...(server.env && { env: server.env }),
          })),
        };
      }

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
    const paths = this.getPaths();
    const storagePath = `${paths.AGENT_STORAGE_DIR}/storage`;

    // Ensure storage directories exist
    await this.sandbox.exec(['mkdir', '-p', `${storagePath}/project`]);
    await this.sandbox.exec(['mkdir', '-p', `${storagePath}/session/${this.projectId}`]);
    await this.sandbox.exec(['mkdir', '-p', `${storagePath}/message`]);
    await this.sandbox.exec(['mkdir', '-p', `${storagePath}/part`]);

    // If no transcript to restore, just create empty project
    if (!args.mainTranscript) {
      // Create project file
      const project: OpenCodeProject = {
        id: this.projectId,
        worktree: paths.WORKSPACE_DIR,
        time: {
          created: Date.now(),
        },
      };

      await this.sandbox.writeFile(
        `${storagePath}/project/${this.projectId}.json`,
        JSON.stringify(project, null, 2)
      );
      return;
    }

    // Parse our intermediate format
    const transcript: OpenCodeSessionTranscript = JSON.parse(args.mainTranscript);

    const filesToWrite: { path: string; content: string }[] = [];

    // 1. Write project file
    const project: OpenCodeProject = {
      id: this.projectId,
      worktree: paths.WORKSPACE_DIR,
      time: {
        created: Date.parse(transcript.metadata.createdAt),
      },
    };
    filesToWrite.push({
      path: `${storagePath}/project/${this.projectId}.json`,
      content: JSON.stringify(project, null, 2),
    });

    // 2. Write session file
    const session: OpenCodeSession = {
      ...transcript.session,
      id: this.sessionId,
      projectID: this.projectId,
      directory: paths.WORKSPACE_DIR,
    };
    filesToWrite.push({
      path: `${storagePath}/session/${this.projectId}/${this.sessionId}.json`,
      content: JSON.stringify(session, null, 2),
    });

    // 3. Write message and part files
    for (const msgWithParts of transcript.messages) {
      const message = {
        ...msgWithParts.message,
        sessionID: this.sessionId,
      };

      // Create message directory
      await this.sandbox.exec(['mkdir', '-p', `${storagePath}/message/${this.sessionId}`]);

      filesToWrite.push({
        path: `${storagePath}/message/${this.sessionId}/${message.id}.json`,
        content: JSON.stringify(message, null, 2),
      });

      // Write parts
      if (msgWithParts.parts.length > 0) {
        await this.sandbox.exec(['mkdir', '-p', `${storagePath}/part/${message.id}`]);

        for (const part of msgWithParts.parts) {
          const partWithRefs = {
            ...part,
            sessionID: this.sessionId,
            messageID: message.id,
          };
          filesToWrite.push({
            path: `${storagePath}/part/${message.id}/${part.id}.json`,
            content: JSON.stringify(partWithRefs, null, 2),
          });
        }
      }
    }

    // Write all files in batch
    if (filesToWrite.length > 0) {
      logger.debug({ fileCount: filesToWrite.length }, 'Writing OpenCode session files');
      const result = await this.sandbox.writeFiles(filesToWrite);

      if (result.failed.length > 0) {
        logger.warn(
          { failed: result.failed, succeeded: result.success.length },
          'Some OpenCode session files failed to write'
        );
      }
    }

    logger.info({ sessionId: this.sessionId }, 'OpenCode session transcripts restored');
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

  public parseTranscripts(
    rawTranscript: string,
    subagents: { id: string; transcript: string }[]
  ): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } {
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
}
