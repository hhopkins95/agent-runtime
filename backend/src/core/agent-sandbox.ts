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
  },
  /** Optional callback for status updates during sandbox creation */
  onStatusChange?: (message: string) => void,
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

  // Watcher state - initialized eagerly during sandbox creation
  private workspaceWatcherIterator?: AsyncGenerator<FileChangeEvent>;
  private transcriptWatcherIterator?: AsyncGenerator<FileChangeEvent>;

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
    const { onStatusChange } = props;

    // Emit status: creating container
    onStatusChange?.("Creating sandbox container...");

    const sandbox = await createSandbox({
      provider: "modal",
      agentProfile: props.agentProfile,
      modalContext: props.modalContext,
      agentArchitecture: "newSessionId" in props.session ? props.session.architecture : props.session.savedSessionData.type,
    });

    const agentSandbox = new AgentSandbox({
      ...props,
      sandbox: sandbox,
    });

    await agentSandbox.initialize(props);
    return agentSandbox;
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
  }

  /**
   * Get the unique sandbox ID
   */
  getId(): string {
    return this.sandboxId;
  }


  private async initialize(props: AgentSandboxProps) {
    const { onStatusChange } = props;

    // Emit status: setting up session files
    onStatusChange?.("Setting up session files...");

    // Run all file setup operations in parallel for better performance
    await Promise.all([
      this.setupSessionTranscripts({
        sessionId: this.sessionId,
        rawTranscript: 'savedSessionData' in props.session ? props.session.savedSessionData.rawTranscript : undefined,
        subagents: 'savedSessionData' in props.session ? props.session.savedSessionData.subagents?.map(subagent => ({
          id: subagent.id,
          rawTranscript: subagent.rawTranscript ?? '',
        })) : undefined,
      }),
      this.setupAgentProfile(),
      this.setupWorkspaceFiles([
        ...(this.agentProfile.defaultWorkspaceFiles || []),
        ...('savedSessionData' in props.session ? props.session.savedSessionData.workspaceFiles : [])
      ]),
    ]);

    // Emit status: initializing file watchers
    onStatusChange?.("Initializing file watchers...");

    // Start file watchers and wait for them to be ready
    // This ensures watchers are in place before any queries can be executed
    await this.startWatchers();
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
  }

  private async setupWorkspaceFiles(files: WorkspaceFile[]): Promise<void> {
    if (files.length === 0) return;

    const basePaths = this.sandbox.getBasePaths();
    const filesToWrite = files.map(file => ({
      path: `${basePaths.WORKSPACE_DIR}/${file.path}`,
      content: file.content
    }));

    const result = await this.sandbox.writeFiles(filesToWrite);
    if (result.failed.length > 0) {
      logger.warn({ failed: result.failed }, 'Some workspace files failed to write');
    }
  }

  // ==========================================================================
  // File Watchers - Initialized eagerly during sandbox creation
  // ==========================================================================

  /**
   * Start file watchers and wait for them to be ready.
   * This is called during initialize() to ensure watchers are in place
   * before any queries can be executed.
   */
  private async startWatchers(): Promise<void> {
    const basePaths = this.sandbox.getBasePaths();
    const adapterPaths = this.architectureAdapter.getPaths();

    logger.info({
      sessionId: this.sessionId,
      workspacePath: basePaths.WORKSPACE_DIR,
      transcriptPath: adapterPaths.AGENT_STORAGE_DIR,
    }, 'Starting file watchers...');

    // Start both watcher processes
    const workspaceWatcherProcess = await this.sandbox.exec([
      'tsx', '/app/file-watcher.ts', '--root', basePaths.WORKSPACE_DIR
    ]);

    const transcriptWatcherProcess = await this.sandbox.exec([
      'tsx', '/app/file-watcher.ts', '--root', adapterPaths.AGENT_STORAGE_DIR
    ]);

    // Create iterators from the streams
    this.workspaceWatcherIterator = streamJSONL<FileChangeEvent>(
      workspaceWatcherProcess.stdout, 'workspace-watcher'
    );
    this.transcriptWatcherIterator = streamJSONL<FileChangeEvent>(
      transcriptWatcherProcess.stdout, 'transcript-watcher'
    );

    // Wait for both 'ready' events before returning
    await Promise.all([
      this.waitForWatcherReady(this.workspaceWatcherIterator, 'workspace'),
      this.waitForWatcherReady(this.transcriptWatcherIterator, 'transcript'),
    ]);

    logger.info({ sessionId: this.sessionId }, 'File watchers ready');
  }

  /**
   * Wait for a watcher to emit its 'ready' event.
   * Pulls events from the iterator until 'ready' is received.
   */
  private async waitForWatcherReady(
    iterator: AsyncGenerator<FileChangeEvent>,
    name: string
  ): Promise<void> {
    for await (const event of iterator) {
      if (event.type === 'ready') {
        logger.info({ watched: event.watched }, `${name} watcher ready`);
        return;
      }
      if (event.type === 'error') {
        throw new Error(`${name} watcher failed to start: ${event.message}`);
      }
      // Shouldn't get file events before ready, but log if we do
      logger.warn({ event, name }, 'Received file event before watcher ready');
    }
    throw new Error(`${name} watcher ended without emitting ready event`);
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
    if (!this.workspaceWatcherIterator) {
      throw new Error('Workspace watcher not initialized - call startWatchers() first');
    }

    // Consume events from the already-initialized iterator
    // (ready event was already consumed in waitForWatcherReady)
    for await (const event of this.workspaceWatcherIterator) {
      // Filter out ready and error events (shouldn't happen, but handle gracefully)
      if (event.type === 'ready') {
        continue;
      }

      if (event.type === 'error') {
        logger.error({ message: event.message, stack: event.stack }, 'Workspace file watcher error');
        continue;
      }

      // Skip files with null content (binary, deleted, or too large)
      if (event.content === null) {
        logger.debug({ path: event.path, type: event.type }, 'Skipping file with null content');
        continue;
      }

      logger.info({
        sessionId: this.sessionId,
        path: event.path,
        type: event.type,
        contentLength: event.content.length
      }, 'Yielding workspace file change');

      yield {
        path: event.path,
        content: event.content
      };
    }

    logger.warn({ sessionId: this.sessionId }, 'Workspace file watcher process ended');
  }

  async *streamSessionTranscriptChanges(sessionId: string): AsyncGenerator<string> {
    if (!this.transcriptWatcherIterator) {
      throw new Error('Transcript watcher not initialized - call startWatchers() first');
    }

    // Consume events from the already-initialized iterator
    // (ready event was already consumed in waitForWatcherReady)
    for await (const event of this.transcriptWatcherIterator) {
      // Filter out ready and error events (shouldn't happen, but handle gracefully)
      if (event.type === 'ready') {
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
    if (!transcripts.main) {
      return {
        blocks: [],
        subagents: [],
      };
    }
    return this.architectureAdapter.parseTranscripts(transcripts.main, transcripts.subagents);
  }

  async readAllWorkspaceFiles() {
    const basePaths = this.sandbox.getBasePaths();
    const workspaceFiles = await this.sandbox.listFiles(basePaths.WORKSPACE_DIR);
    return await Promise.all(workspaceFiles.map(async fullPath => {
      // Store relative path (strip workspace dir prefix) for portability
      let relativePath = fullPath;
      if (fullPath.startsWith(basePaths.WORKSPACE_DIR)) {
        relativePath = fullPath.slice(basePaths.WORKSPACE_DIR.length);
        // Remove leading slash if present
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }
      }
      return {
        path: relativePath,
        content: await this.sandbox.readFile(fullPath)
      } as WorkspaceFile;
    }));
  }



  
}

