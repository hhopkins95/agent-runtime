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
import { SandboxPrimitive, WatchEvent } from '../lib/sandbox/base.js';
import { createSandbox } from '../lib/sandbox/factory.js';
import { ConversationBlock } from '../types/session/blocks.js';
import { StreamEvent } from '../types/session/streamEvents.js';
import type { EventBus } from './event-bus.js';


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

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


interface AgentSandboxProps {
  modalContext: ModalContext,
  agentProfile: AgentProfile,
  eventBus: EventBus,
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
  private readonly eventBus: EventBus

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
    this.eventBus = props.eventBus;
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
  // File Watchers - Using sandbox.watch() primitive
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

    // Start both watchers and wait for them to be ready
    await Promise.all([
      this.sandbox.watch(basePaths.WORKSPACE_DIR, (event: WatchEvent) => {
        this.handleWorkspaceFileEvent(event);
      }),
      this.sandbox.watch(adapterPaths.AGENT_STORAGE_DIR, (event: WatchEvent) => {
        this.handleTranscriptFileEvent(event);
      }),
    ]);

    logger.info({ sessionId: this.sessionId }, 'File watchers ready');
  }

  /**
   * Handle workspace file change events.
   * Emits file events to EventBus.
   */
  private handleWorkspaceFileEvent(event: WatchEvent): void {
    // Skip files with no content (unlink events or binary/large files)
    if (event.content === undefined) {
      logger.debug({ sessionId: this.sessionId, path: event.path, type: event.type }, 'Skipping file with no content');
      return;
    }

    logger.info({
      sessionId: this.sessionId,
      path: event.path,
      type: event.type,
      contentLength: event.content.length
    }, 'Emitting workspace file event');

    this.eventBus.emit('session:file:modified', {
      sessionId: this.sessionId,
      file: { path: event.path, content: event.content }
    });
  }

  /**
   * Handle transcript file change events.
   * Emits transcript change events to EventBus.
   */
  private handleTranscriptFileEvent(event: WatchEvent): void {
    // Skip files with no content
    if (event.content === undefined) {
      logger.debug({ sessionId: this.sessionId, path: event.path, type: event.type }, 'Skipping transcript with no content');
      return;
    }

    logger.debug({
      sessionId: this.sessionId,
      path: event.path,
      type: event.type,
      contentLength: event.content.length
    }, 'Transcript file changed');

    this.eventBus.emit('session:transcript:changed', {
      sessionId: this.sessionId,
      content: event.content,
      path: event.path,
    });
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

