/**
 * AgentSandbox - Unified sandbox wrapper for Modal
 *
 * This class consolidates all sandbox-related operations:
 * 1. Infrastructure primitives (exec, file I/O, etc.)
 * 2. SDK execution and message streaming
 * 3. File system setup and session state management
 *
 * It replaces the previous SessionFileManager and AgentSDKService,
 * providing a single cohesive interface for all sandbox operations.
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../config/logger.js';
import { AgentArchitectureAdapter } from '../lib/agent-architectures/base.js';
import { ModalContext } from '../lib/sandbox/modal/client.js';
import { AgentProfile } from '../types/agent-profiles.js';
import { AGENT_ARCHITECTURE_TYPE, PersistedSessionData, WorkspaceFile } from '../types/session/index.js';

import { getAgentArchitectureAdapter } from '../lib/agent-architectures/factory.js';
import { streamJSONL } from '../lib/helpers/stream.js';
import { SandboxPrimitive } from '../lib/sandbox/base.js';
import { createSandbox } from '../lib/sandbox/factory.js';
import { ConversationBlock } from '../types/session/blocks.js';
import { StreamEvent } from '../types/session/streamEvents.js';


const GEMINI_PROJECT_HASH = "TODO_GET_PROJECT_HASH"

/**
 * Custom error message type (not in SDK)
 * Used for wrapping errors from SDK execution
 */
export interface SDKErrorMessage {
  type: 'error';
  error: {
    message: string;
    stack?: string;
    name?: string;
  };
  timestamp: number;
}

/**
 * File change event from file-watcher.ts
 * Emitted when files are created, updated, or deleted in watched directories
 */
export interface FileChangeEvent {
  path: string;           // relative to watched root
  type: 'created' | 'updated' | 'deleted' | 'ready' | 'error';
  content: string | null; // file content (null for binary/deleted/large files)
  timestamp: number;
  message?: string;       // for error/ready events
  stack?: string;         // for error events
  watched?: string;       // for ready events
}

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


interface AgentSandboxProps {
  modalContext: ModalContext,
  agentProfile: AgentProfile,
  session: {
    newSessionId: string,
    architecture: AGENT_ARCHITECTURE_TYPE
  } | {
    savedSessionData: PersistedSessionData
  }
}


/**
 * Unified wrapper around Modal Sandbox with all agent-related operations
 */
export class AgentSandbox {

  private readonly agentProfile: AgentProfile
  private readonly sessionId: string
  private readonly sandboxId: string
  private readonly sandbox: SandboxPrimitive
  private readonly architectureAdapter: AgentArchitectureAdapter

  // ============================================================================
  // Sandbox Factory
  // ============================================================================
  /**
   * Create and initialize a new AgentSandbox
   *
   * @param modalContext - Modal client context
   * @param options - Sandbox configuration
   * @returns Initialized AgentSandbox instance
   */
  static async create(
    props: AgentSandboxProps
  ): Promise<AgentSandbox> {

    const sandbox = await createSandbox({
      provider: "modal",
      agentProfile: props.agentProfile,
      modalContext: props.modalContext,
      agentArchitecture: "newSessionId" in props.session ? props.session.architecture : props.session.savedSessionData.type,
    });

    return new AgentSandbox({
      ...props,
      sandbox: sandbox,
    });
  }

  private constructor(
    props: AgentSandboxProps & { sandbox: SandboxPrimitive }
  ) {
    this.sandbox = props.sandbox;
    this.sandboxId = props.sandbox.getId();
    this.agentProfile = props.agentProfile;
    const architecture = "newSessionId" in props.session ? props.session.architecture : props.session.savedSessionData.type;

    if ('newSessionId' in props.session) {
      this.sessionId = props.session.newSessionId;
    } else {
      this.sessionId = props.session.savedSessionData.sessionId;
    }

    this.architectureAdapter = getAgentArchitectureAdapter(architecture, props.sandbox, this.sessionId);

    this.initialize(props);
  }

  /**
   * Get the unique sandbox ID
   */
  getId(): string {
    return this.sandboxId;
  }


  private async initialize(props: AgentSandboxProps) {

    // Set up the session transcript files

    await this.setupSessionTranscripts({
      sessionId: this.sessionId,
      rawTranscript: 'savedSessionData' in props.session ? props.session.savedSessionData.rawTranscript : undefined,
      subagents: 'savedSessionData' in props.session ? props.session.savedSessionData.subagents?.map(subagent => ({
        id: subagent.id,
        rawTranscript: subagent.rawTranscript ?? '',
      })) : undefined,
    });


    // Set up the agent profile files 
    await this.setupAgentProfile();

    // Set up initial workspace files
    await this.setupWorkspaceFiles([...(this.agentProfile.defaultWorkspaceFiles || []), ...('savedSessionData' in props.session ? props.session.savedSessionData.workspaceFiles : [])]);

  }

  async terminate(): Promise<void> {
    await this.sandbox.terminate();
  }

  // ==========================================================================
  // File System Setup - High-Level Operations
  // ==========================================================================
  private async setupAgentProfile(): Promise<void> {
    await this.architectureAdapter.setupAgentProfile({
      agentProfile: this.agentProfile,
    });
    // const profile = this.agentProfile
    // const paths = this.getSandboxPaths();

    // // Set up the agent MD file
    // if (profile.agentMDFile) {
    //   await this.sandbox.writeFile(paths.AGENT_MD_FILE, profile.agentMDFile);
    // }

    // // Set up the Subagents (Claude only)
    // if (profile.type === 'claude-agent-sdk' && profile.subagents && profile.subagents.length > 0) {
    //   for (const subagent of profile.subagents) {
    //     await this.sandbox.writeFile(`${paths.AGENT_PROFILE_DIR}/agents/${subagent.name}.md`, `
    //      ---
    //      name: ${subagent.name}
    //      description: ${subagent.description}
    //      ---

    //      ${subagent.prompt} 
    //       `);
    //   }
    // }

    // // Set up the Commands 
    // if (profile.commands && profile.commands.length > 0) {
    //   for (const command of profile.commands) {
    //     await this.sandbox.writeFile(`${paths.AGENT_PROFILE_DIR}/commands/${command.name}.md`, `
    //       ${command.prompt}
    //     `);
    //   }
    // }
    // // Set up the skills 
    // if (profile.skills && profile.skills.length > 0) {
    //   for (const skill of profile.skills) {
    //     // Write the skill file
    //     await this.sandbox.writeFile(`${paths.AGENT_PROFILE_DIR}/skills/${skill.name}/SKILL.md`, `
    //       ---
    //       name: ${skill.name}
    //       description: ${skill.description}
    //       ---

    //       ${skill.skillMd}
    //     `);


    //     for (const supportingFile of skill.supportingFiles) {
    //       await this.sandbox.writeFile(`${paths.AGENT_PROFILE_DIR}/skills/${skill.name}/${supportingFile.relativePath}`, supportingFile.content);
    //     }
    //   }
    // }

  }

  private async setupSessionTranscripts({
    sessionId,
    rawTranscript,
    subagents,
  }: {
    sessionId: string,
    rawTranscript?: string,
    subagents?: {
      id: string,
      rawTranscript: string,
    }[]
  }): Promise<void> {

    await this.architectureAdapter.setupSessionTranscripts({
      sessionId: sessionId,
      mainTranscript: rawTranscript ?? '',
      subagents: subagents?.map(subagent => ({
        id: subagent.id,
        transcript: subagent.rawTranscript ?? '',
      })) ?? [],
    });
    // if (!rawTranscript) return
    // const paths = this.getSandboxPaths();

    // if (this.agentProfile.type === 'claude-agent-sdk') {
    //   const filename = `${sessionId}.jsonl`;
    //   this.TRANSCRIPT_FILE_NAME = filename;
    //   await this.sandbox.writeFile(`${paths.AGENT_STORAGE_DIR}/${filename}`, rawTranscript);
    //   for (const subagent of subagents || []) {
    //     if (!subagent.rawTranscript) continue;
    //     await this.sandbox.writeFile(`${paths.AGENT_STORAGE_DIR}/${subagent.id}.jsonl`, subagent.rawTranscript);
    //   }
    // }

    // if (this.agentProfile.type === 'gemini-cli') {
    //   // example file name : session-2025-11-19T23-40-e677eecd.json 
    //   const fileName = new Date().toISOString().replace(/[:.]/g, '-') + '-' + "aaaaaaaa" + '.json';
    //   this.TRANSCRIPT_FILE_NAME = fileName;
    //   await this.sandbox.writeFile(`${paths.AGENT_STORAGE_DIR}/${fileName}`, rawTranscript);
    //   // No subagents for gemini-cli
    // }




  }

  private async setupWorkspaceFiles(files: WorkspaceFile[]): Promise<void> {
    const paths = this.architectureAdapter.getPaths();
    for (const file of files) {
      await this.sandbox.writeFile(`${paths.WORKSPACE_DIR}/${file.path}`, file.content);
    }
  }



  // ==========================================================================
  // Operations
  // ==========================================================================

  async* executeQuery(
    prompt: string,
  ): AsyncGenerator<StreamEvent> {
    yield* this.architectureAdapter.executeQuery({
      query: prompt,
    });
  }


  async *streamWorkspaceFileChanges(): AsyncGenerator<WorkspaceFile> {
    const paths = this.sandbox.getBasePaths()
    logger.info({
      sessionId: this.sessionId,
      watchPath: paths.WORKSPACE_DIR
    }, 'Starting workspace file watcher...');

    // Start file watcher process with --root flag
    const process = await this.sandbox.exec([
      'tsx',
      '/app/file-watcher.ts',
      '--root',
      paths.WORKSPACE_DIR
    ]);

    // Stream file change events
    for await (const event of streamJSONL<FileChangeEvent>(process.stdout, 'workspace-watcher')) {
      // Filter out ready and error events
      if (event.type === 'ready') {
        logger.info({ watched: event.watched }, 'Workspace file watcher ready');
        continue;
      }

      if (event.type === 'error') {
        logger.error({ message: event.message, stack: event.stack }, 'Workspace file watcher error');
        continue;
      }

      // Transform FileChangeEvent to WorkspaceFile
      // Skip files with null content (binary, deleted, or too large)
      if (event.content === null) {
        logger.debug({ path: event.path, type: event.type }, 'Skipping file with null content');
        continue;
      }

      yield {
        path: event.path,
        content: event.content
      };
    }

    logger.warn('Workspace file watcher process ended');
  }

  async *streamSessionTranscriptChanges(sessionId: string): AsyncGenerator<string> {

    const paths = this.architectureAdapter.getPaths();

    logger.info({
      sessionId,
      watchPath: paths.AGENT_STORAGE_DIR,
    }, 'Starting session transcript file watcher...');

    // Start file watcher process with --root flag
    const process = await this.sandbox.exec([
      'tsx',
      '/app/file-watcher.ts',
      '--root',
      paths.AGENT_STORAGE_DIR
    ]);


    // Stream file change events
    for await (const event of streamJSONL<FileChangeEvent>(process.stdout, 'transcript-watcher')) {
      // Filter out ready and error events
      if (event.type === 'ready') {
        logger.info({ watched: event.watched }, 'Transcript file watcher ready');
        continue;
      }

      if (event.type === 'error') {
        logger.error({ message: event.message, stack: event.stack }, 'Transcript file watcher error');
        continue;
      }

      // Skip files with null content (deleted or error reading)
      if (event.content === null) {
        logger.debug({ path: event.path, type: event.type }, 'Transcript file has null content');
        continue;
      }

      logger.debug({ path: event.path, type: event.type, contentLength: event.content.length }, 'Transcript file changed');

      // Yield the raw transcript content
      yield event.content;
    }

    logger.warn({ sessionId }, 'Transcript file watcher process ended');
  }

  /**
   * Check sandbox health
   * @returns null if running, exit code (number) if exited
   */
  async heartbeat(): Promise<number | null> {
    return await this.sandbox.poll();
  }



  // ==========================================================================
  // File System Operations - Reading All Files
  // ==========================================================================
  // async readAgentProfileFiles() {
  //   const paths = this.getSandboxPaths();
  //   const agentProfileFiles = await this.sandbox.listFiles(paths.AGENT_PROFILE_DIR);
  //   return await Promise.all(agentProfileFiles.map(async path => ({
  //     path,
  //     content: await this.sandbox.readFile(path)
  //   })));
  // }

  async readSessionTranscripts() {
    return await this.architectureAdapter.readSessionTranscripts({});
    // const paths = this.getSandboxPaths();
    // const transcriptFiles = await this.sandbox.listFiles(paths.AGENT_STORAGE_DIR);


    // if (this.agentProfile.type === 'claude-agent-sdk') {
    //   const mainTranscriptFilePath = transcriptFiles.find(path => path.includes(this.sessionId) && path.endsWith('.jsonl'));
    //   if (!mainTranscriptFilePath) {
    //     throw new Error(`Main transcript file not found for session ${this.sessionId}`);
    //   }
    //   const mainTranscriptContent = await this.sandbox.readFile(mainTranscriptFilePath);

    //   // The rest of the paths are the subagent transcripts
    //   const subagentTranscriptFilePaths = transcriptFiles.filter(p => p !== mainTranscriptFilePath);

    //   const subagents = await Promise.all(subagentTranscriptFilePaths.map(async path => {
    //     // agent id is the last part of the path
    //     const agentId = path.split('/').pop();
    //     if (!agentId) {
    //       throw new Error(`Agent id not found in path ${path}`);
    //     }
    //     const agentTranscriptContent = await this.sandbox.readFile(path);
    //     return {
    //       id: agentId,
    //       transcript : agentTranscriptContent
    //     }
    //   }));


    //   return {
    //     main : mainTranscriptContent,
    //     subagents : subagents
    //   }

    // }

    // if (this.agentProfile.type === 'gemini-cli') {
    //   const mainPath = transcriptFiles.find(file => file.includes(this.TRANSCRIPT_FILE_NAME));
    //   if (!mainPath) {
    //     throw new Error(`Main transcript file not found for session ${this.sessionId}`);
    //   }
    //   const mainTranscriptContent = await this.sandbox.readFile(mainPath);
    //   return {
    //     main : mainTranscriptContent,
    //     subagents : []
    //   }
    // }

  }

  /**
   * Parse session transcripts into ConversationBlocks
   *
   * This method reads the raw transcripts from the sandbox and parses them
   * using the architecture adapter into a unified ConversationBlock format.
   *
   * @returns Parsed blocks for main conversation and subagents
   */
  async parseSessionTranscripts(): Promise<{
    blocks: ConversationBlock[];
    subagents: { id: string; blocks: import('../types/session/blocks.js').ConversationBlock[] }[];
  }> {
    const transcripts = await this.readSessionTranscripts();
    return this.architectureAdapter.parseTranscripts(transcripts.main, transcripts.subagents);
  }

  async readAllWorkspaceFiles() {
    const paths = this.sandbox.getBasePaths();
    const workspaceFiles = await this.sandbox.listFiles(paths.WORKSPACE_DIR);
    return await Promise.all(workspaceFiles.map(async path => ({
      path,
      content: await this.sandbox.readFile(path)
    } as WorkspaceFile)));
  }



  
}

