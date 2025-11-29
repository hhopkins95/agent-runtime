/**
 * AgentSession - Individual session management
 *
 * Responsibilities:
 * - Load session state from persistence on initialization
 * - Parse transcripts using static parser (no sandbox needed)
 * - Lazily create sandbox only when sendMessage is called
 * - Execute agent queries in sandbox
 * - Track main transcript + subagent transcripts
 * - Monitor workspace file changes
 * - Sync state to persistence periodically
 * - Emit domain events to EventBus
 * - Notify SessionManager when sandbox terminates
 */

import { randomUUID } from 'crypto';
import { basename } from 'path';
import { logger } from '../config/logger.js';
import type { ModalContext } from '../lib/sandbox/modal/client.js';
import type { PersistenceAdapter } from '../types/persistence-adapter.js';
import type { AgentProfile } from '../types/agent-profiles.js';
import type {
  RuntimeSessionData,
  PersistedSessionData,
  PersistedSessionListData,
  WorkspaceFile,
  AGENT_ARCHITECTURE_TYPE,
  SessionRuntimeState,
  SandboxStatus,
} from '../types/session/index.js';
import type { ConversationBlock } from '../types/session/blocks.js';
import type { EventBus } from './event-bus.js';
import type { SandboxPrimitive, WatchEvent } from '../lib/sandbox/base.js';
import type { AgentArchitectureAdapter, AgentArchitectureSessionOptions } from '../lib/agent-architectures/base.js';
import { createSandbox } from '../lib/sandbox/factory.js';
import { getAgentArchitectureAdapter, parseTranscripts } from '../lib/agent-architectures/factory.js';

/**
 * Callback type for sandbox termination notification
 */
export type OnSandboxTerminatedCallback = (sessionId: string) => void;

/**
 * AgentSession class - manages individual session lifecycle
 */
export class AgentSession {
  // Identifiers
  public readonly sessionId: string;

  // Sandbox infrastructure (lazy - created on first sendMessage)
  private sandboxPrimitive?: SandboxPrimitive;
  private adapter?: AgentArchitectureAdapter;
  private sandboxId?: string;
  private sandboxStatus: SandboxStatus | null = null;
  private statusMessage?: string;
  private lastHealthCheck?: number;
  private sandboxRestartCount: number = 0;

  // Session metadata
  private createdAt?: number;
  private lastActivity?: number;

  // Session data
  private blocks: ConversationBlock[];
  private rawTranscript?: string;
  private subagents: { id: string; blocks: ConversationBlock[], rawTranscript?: string }[];
  private workspaceFiles: WorkspaceFile[];
  private sessionOptions?: AgentArchitectureSessionOptions;

  // Agent Details
  private agentProfile: AgentProfile;
  private architecture: AGENT_ARCHITECTURE_TYPE;

  // Services
  private readonly modalContext: ModalContext;
  private readonly eventBus: EventBus;
  private readonly persistenceAdapter: PersistenceAdapter;

  // Callback for sandbox termination (set by SessionManager)
  private onSandboxTerminated?: OnSandboxTerminatedCallback;

  // Periodic jobs (only active when sandbox exists)
  private syncInterval?: NodeJS.Timeout;
  private sandboxHeartbeat?: NodeJS.Timeout;

  static async create(
    input: {
      sessionId: string
    } | {
      agentProfileRef: string,
      sessionOptions: AgentArchitectureSessionOptions,
      architecture: AGENT_ARCHITECTURE_TYPE
    },
    modalContext: ModalContext,
    eventBus: EventBus,
    persistenceAdapter: PersistenceAdapter,
    onSandboxTerminated?: OnSandboxTerminatedCallback,
  ): Promise<AgentSession> {

    let session: AgentSession;
    let sessionInput: { newSessionId: string; architecture: AGENT_ARCHITECTURE_TYPE, sessionOptions?: AgentArchitectureSessionOptions } | { savedSessionData: PersistedSessionData };

    if ('sessionId' in input) {
      // Load existing session from persistence
      const sessionData = await persistenceAdapter.loadSession(input.sessionId);
      if (!sessionData) {
        throw new Error(`Session ${input.sessionId} not found in persistence`);
      }

      const agentProfile = await persistenceAdapter.loadAgentProfile(sessionData.agentProfileReference);
      if (!agentProfile) {
        throw new Error(`Agent profile ${sessionData.agentProfileReference} not found in persistence`);
      }

      sessionInput = { savedSessionData: sessionData };
      session = new AgentSession({
        modalContext,
        eventBus,
        persistenceAdapter,
        agentProfile,
        session: sessionInput,
        onSandboxTerminated,
      });
    } else {
      // Create a new session
      const uuid = randomUUID();
      const agentProfile = await persistenceAdapter.loadAgentProfile(input.agentProfileRef);
      if (!agentProfile) {
        throw new Error(`Agent profile ${input.agentProfileRef} not found in persistence`);
      }

      sessionInput = { newSessionId: uuid, architecture: input.architecture, sessionOptions: input.sessionOptions };
      session = new AgentSession({
        modalContext,
        eventBus,
        persistenceAdapter,
        agentProfile,
        session: sessionInput,
        onSandboxTerminated,
      });
    }

    // Initialize session (parses transcripts, NO sandbox creation)
    await session.initialize(sessionInput);
    return session;
  }

  private constructor(
    props: {
      modalContext: ModalContext,
      eventBus: EventBus,
      persistenceAdapter: PersistenceAdapter,
      agentProfile: AgentProfile,
      session: {
        newSessionId: string,
        architecture: AGENT_ARCHITECTURE_TYPE, 
        sessionOptions?: AgentArchitectureSessionOptions,
      } | {
        savedSessionData: PersistedSessionData,
      },
      onSandboxTerminated?: OnSandboxTerminatedCallback,
    }
  ) {
    this.modalContext = props.modalContext;
    this.eventBus = props.eventBus;
    this.persistenceAdapter = props.persistenceAdapter;
    this.agentProfile = props.agentProfile;
    this.onSandboxTerminated = props.onSandboxTerminated;

    // Get architecture from session data
    if ('newSessionId' in props.session) {
      this.architecture = props.session.architecture;
      this.sessionId = props.session.newSessionId;
      this.createdAt = Date.now();
      this.blocks = [];
      this.subagents = [];
      this.workspaceFiles = [];
      this.sessionOptions = props.session.sessionOptions;
    } else {
      this.architecture = props.session.savedSessionData.type;
      this.sessionId = props.session.savedSessionData.sessionId;
      this.createdAt = props.session.savedSessionData.createdAt;
      this.rawTranscript = props.session.savedSessionData.rawTranscript;
      this.workspaceFiles = props.session.savedSessionData.workspaceFiles;
      this.blocks = []; // Will be parsed in initialize()
      this.sessionOptions = props.session.savedSessionData.sessionOptions;
      this.subagents = props.session.savedSessionData.subagents?.map(subagent => ({
        id: subagent.id,
        blocks: [],
        rawTranscript: subagent.rawTranscript,
      })) ?? [];
    }

    this.lastActivity = Date.now();
  }

  /**
   * Initialize the session - parses transcripts using static parser
   * Does NOT create sandbox - that's done lazily in sendMessage()
   */
  private async initialize(session: {
    newSessionId: string,
    architecture: AGENT_ARCHITECTURE_TYPE
  } | {
    savedSessionData: PersistedSessionData,
  }): Promise<void> {

    // For existing sessions, parse blocks using static parser (no sandbox needed)
    if ('savedSessionData' in session && session.savedSessionData.rawTranscript) {
      const subagentTranscripts = this.subagents.map(s => ({
        id: s.id,
        transcript: s.rawTranscript ?? '',
      }));
      const parsed = parseTranscripts(this.architecture, session.savedSessionData.rawTranscript, subagentTranscripts);
      this.blocks = parsed.blocks;
      this.subagents = parsed.subagents.map(sub => ({
        id: sub.id,
        blocks: sub.blocks,
        rawTranscript: this.subagents.find(s => s.id === sub.id)?.rawTranscript,
      }));
    }

    // Emit initial status (loaded but no sandbox)
    this.emitRuntimeStatus();

    logger.info({ sessionId: this.sessionId }, 'Session initialized (no sandbox yet)');
  }

  /**
   * Lazily create sandbox when needed (private, called by sendMessage)
   */
  private async activateSandbox(): Promise<void> {
    if (this.sandboxPrimitive) return;

    logger.info({ sessionId: this.sessionId }, 'Activating sandbox...');

    // Note: 'starting' status is already emitted by sendMessage() before calling this method
    // This ensures clients get immediate feedback before the sandbox creation process

    // Step 1: Create the sandbox primitive
    this.emitRuntimeStatus("Creating sandbox container...");
    this.sandboxPrimitive = await createSandbox({
      provider: "modal",
      agentProfile: this.agentProfile,
      modalContext: this.modalContext,
      agentArchitecture: this.architecture,
    });
    this.sandboxId = this.sandboxPrimitive.getId();

    // Step 2: Create the architecture adapter
    this.adapter = getAgentArchitectureAdapter(this.architecture, this.sandboxPrimitive, this.sessionId);

    // Step 3: Setup session files
    this.emitRuntimeStatus("Setting up session files...");
    await this.setupSessionFiles();

    // Step 4: Start watchers
    this.emitRuntimeStatus("Initializing file watchers...");
    await this.startWatchers();

    // Step 5: Start monitoring and sync
    this.startPeriodicSync();
    this.startHealthMonitoring();

    this.sandboxStatus = 'ready';
    this.lastHealthCheck = Date.now();
    this.emitRuntimeStatus("Ready");

    logger.info({ sessionId: this.sessionId, sandboxId: this.sandboxId }, 'Sandbox activated');
  }

  /**
   * Setup session files in the sandbox (transcripts, profile, workspace files)
   */
  private async setupSessionFiles(): Promise<void> {
    if (!this.adapter || !this.sandboxPrimitive) {
      throw new Error('Cannot setup session files without adapter and sandbox');
    }

    // Run all file setup operations in parallel for better performance
    await Promise.all([
      // Setup transcripts
      this.adapter.setupSessionTranscripts({
        sessionId: this.sessionId,
        mainTranscript: this.rawTranscript ?? '',
        subagents: this.subagents.map(s => ({
          id: s.id,
          transcript: s.rawTranscript ?? '',
        })),
      }),
      // Setup agent profile
      this.adapter.setupAgentProfile({
        agentProfile: this.agentProfile,
      }),
      // Setup workspace files
      this.setupWorkspaceFiles(),
    ]);
  }

  /**
   * Write workspace files to the sandbox
   */
  private async setupWorkspaceFiles(): Promise<void> {
    if (!this.sandboxPrimitive) return;

    const files = [
      ...(this.agentProfile.defaultWorkspaceFiles || []),
      ...this.workspaceFiles,
    ];

    if (files.length === 0) return;

    const basePaths = this.sandboxPrimitive.getBasePaths();
    const filesToWrite = files.map(file => ({
      path: `${basePaths.WORKSPACE_DIR}/${file.path}`,
      content: file.content
    }));

    const result = await this.sandboxPrimitive.writeFiles(filesToWrite);
    if (result.failed.length > 0) {
      logger.warn({ failed: result.failed }, 'Some workspace files failed to write');
    }
  }

  /**
   * Start file watchers for workspace and transcript directories
   */
  private async startWatchers(): Promise<void> {
    if (!this.sandboxPrimitive || !this.adapter) {
      throw new Error('Cannot start watchers without sandbox and adapter');
    }

    const basePaths = this.sandboxPrimitive.getBasePaths();
    const adapterPaths = this.adapter.getPaths();

    logger.info({
      sessionId: this.sessionId,
      workspacePath: basePaths.WORKSPACE_DIR,
      transcriptPath: adapterPaths.AGENT_STORAGE_DIR,
    }, 'Starting file watchers...');

    // Start both watchers and wait for them to be ready
    await Promise.all([
      this.sandboxPrimitive.watch(basePaths.WORKSPACE_DIR, (event) => {
        this.handleWorkspaceFileChange(event);
      }),
      this.sandboxPrimitive.watch(adapterPaths.AGENT_STORAGE_DIR, (event) => {
        this.handleTranscriptFileChange(event);
      }),
    ]);

    logger.info({ sessionId: this.sessionId }, 'File watchers ready');
  }

  /**
   * Handle workspace file change events directly
   */
  private handleWorkspaceFileChange(event: WatchEvent): void {
    // Skip files with no content (unlink events or binary/large files)
    if (event.content === undefined) {
      logger.debug({ sessionId: this.sessionId, path: event.path, type: event.type }, 'Skipping file with no content');
      return;
    }

    logger.debug({
      sessionId: this.sessionId,
      path: event.path,
      type: event.type,
      contentLength: event.content.length
    }, 'Workspace file changed');

    const file: WorkspaceFile = { path: event.path, content: event.content };

    // Direct state update
    const existingIndex = this.workspaceFiles.findIndex(f => f.path === file.path);
    if (existingIndex >= 0) {
      this.workspaceFiles[existingIndex] = file;
    } else {
      this.workspaceFiles.push(file);
    }

    // Persist immediately (fire and forget, log errors)
    this.persistenceAdapter.saveWorkspaceFile(this.sessionId, file)
      .then(() => logger.debug({ sessionId: this.sessionId, path: file.path }, 'Persisted workspace file'))
      .catch(error => logger.error({ error, sessionId: this.sessionId, path: file.path }, 'Failed to persist workspace file'));

    // Emit for WebSocket clients
    this.eventBus.emit('session:file:modified', {
      sessionId: this.sessionId,
      file,
    });
  }

  /**
   * Handle transcript file change events directly
   */
  private handleTranscriptFileChange(event: WatchEvent): void {
    // Skip files with no content
    if (event.content === undefined) {
      logger.debug({ sessionId: this.sessionId, path: event.path, type: event.type }, 'Skipping transcript with no content');
      return;
    }

    if (!this.adapter) return;

    const fileName = basename(event.path);
    const identification = this.adapter.identifySessionTranscriptFile({ fileName, content: event.content });

    if (!identification) {
      logger.debug({ sessionId: this.sessionId, path: event.path }, 'Skipping non-transcript file');
      return;
    }

    logger.debug({
      sessionId: this.sessionId,
      path: event.path,
      type: event.type,
      contentLength: event.content.length,
      isMain: 'isMain' in identification,
    }, 'Transcript file changed');

    if ('isMain' in identification) {
      // Main transcript changed
      this.rawTranscript = event.content;

      // Re-parse all transcripts
      const subagentTranscripts = this.subagents.map(s => ({
        id: s.id,
        transcript: s.rawTranscript ?? '',
      }));
      const parsed = this.adapter.parseTranscripts(event.content, subagentTranscripts);
      this.blocks = parsed.blocks;
      // Update subagent blocks (keep rawTranscripts, update blocks)
      this.subagents = parsed.subagents.map(sub => ({
        id: sub.id,
        blocks: sub.blocks,
        rawTranscript: this.subagents.find(s => s.id === sub.id)?.rawTranscript,
      }));

      // Persist immediately
      this.persistenceAdapter.saveTranscript(this.sessionId, event.content)
        .then(() => logger.debug({ sessionId: this.sessionId, path: event.path }, 'Persisted main transcript'))
        .catch(error => logger.error({ error, sessionId: this.sessionId, path: event.path }, 'Failed to persist main transcript'));

      // Emit for WebSocket clients
      this.eventBus.emit('session:transcript:changed', {
        sessionId: this.sessionId,
        content: event.content,
        path: event.path,
      });
    } else {
      // Subagent transcript changed
      const { subagentId } = identification;

      // Check if it's a placeholder (skip if ≤1 line)
      const lines = event.content.trim().split('\n').filter(l => l.trim().length > 0);
      if (lines.length <= 1) {
        logger.debug({ sessionId: this.sessionId, subagentId, lines: lines.length }, 'Skipping placeholder subagent transcript');
        return;
      }

      // Update subagent rawTranscript
      const existingSubagent = this.subagents.find(s => s.id === subagentId);
      if (existingSubagent) {
        existingSubagent.rawTranscript = event.content;
      } else {
        this.subagents.push({
          id: subagentId,
          blocks: [],
          rawTranscript: event.content,
        });
      }

      // Re-parse all transcripts to get updated blocks
      const subagentTranscripts = this.subagents.map(s => ({
        id: s.id,
        transcript: s.rawTranscript ?? '',
      }));
      const parsed = this.adapter.parseTranscripts(this.rawTranscript ?? '', subagentTranscripts);
      this.subagents = parsed.subagents.map(sub => ({
        id: sub.id,
        blocks: sub.blocks,
        rawTranscript: this.subagents.find(s => s.id === sub.id)?.rawTranscript,
      }));

      // Persist immediately
      this.persistenceAdapter.saveTranscript(this.sessionId, event.content, subagentId)
        .then(() => logger.debug({ sessionId: this.sessionId, subagentId }, 'Persisted subagent transcript'))
        .catch(error => logger.error({ error, sessionId: this.sessionId, subagentId }, 'Failed to persist subagent transcript'));

      // Emit for WebSocket clients
      this.eventBus.emit('session:subagent:changed', {
        sessionId: this.sessionId,
        subagentId,
        content: event.content,
      });
    }
  }

  /**
   * Emit the current runtime status
   * @param message Optional human-readable status message for UI display
   */
  private emitRuntimeStatus(message?: string): void {
    this.statusMessage = message;
    this.eventBus.emit('session:status', {
      sessionId: this.sessionId,
      runtime: this.getRuntimeState(),
    });
  }

  /**
   * Send message to agent and stream responses
   */
  async sendMessage(message: string): Promise<void> {
    // Emit 'starting' status immediately when sandbox doesn't exist
    // This provides feedback to clients before sandbox creation (which can take a while)
    if (!this.sandboxPrimitive) {
      this.sandboxStatus = 'starting';
      this.emitRuntimeStatus("Preparing...");
    }

    // Lazily create sandbox if it doesn't exist
    await this.activateSandbox();

    // Update lastActivity timestamp
    this.lastActivity = Date.now();

    // Emit user message block before agent processing
    const userBlockId = randomUUID();
    const userBlock = {
      id: userBlockId,
      type: 'user_message' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };

    this.eventBus.emit('session:block:start', {
      sessionId: this.sessionId,
      conversationId: 'main',
      block: userBlock,
    });
    this.eventBus.emit('session:block:complete', {
      sessionId: this.sessionId,
      conversationId: 'main',
      blockId: userBlockId,
      block: userBlock,
    });

    try {
      logger.info(
        {
          sessionId: this.sessionId,
          architecture: this.architecture,
          messageLength: message.length,
        },
        'Sending message to agent...'
      );

      for await (const event of this.adapter!.executeQuery({ query: message, options: this.sessionOptions })) {
        switch (event.type) {
          case 'block_start':
            this.eventBus.emit('session:block:start', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              block: event.block,
            });
            break;

          case 'text_delta':
            this.eventBus.emit('session:block:delta', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              blockId: event.blockId,
              delta: event.delta,
            });
            break;

          case 'block_update':
            this.eventBus.emit('session:block:update', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              blockId: event.blockId,
              updates: event.updates,
            });
            break;

          case 'block_complete':
            this.eventBus.emit('session:block:complete', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              blockId: event.blockId,
              block: event.block,
            });
            break;

          case 'metadata_update':
            this.eventBus.emit('session:metadata:update', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              metadata: event.metadata,
            });
            break;
        }
      }

      // Update lastActivity after message processing completes
      this.lastActivity = Date.now();
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, architecture: this.architecture }, 'Failed to send message');

      // Emit error event so WebSocket clients are notified
      this.eventBus.emit('session:error', {
        sessionId: this.sessionId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  private async syncSessionStateWithSandbox(): Promise<void> {
    if (!this.sandboxPrimitive || !this.adapter) {
      // No sandbox, nothing to sync from
      return;
    }

    // Read raw transcripts from sandbox
    const transcripts = await this.adapter.readSessionTranscripts({});

    // Read workspace files from sandbox
    const basePaths = this.sandboxPrimitive.getBasePaths();
    const workspaceFilePaths = await this.sandboxPrimitive.listFiles(basePaths.WORKSPACE_DIR);
    const workspaceFiles = await Promise.all(workspaceFilePaths.map(async fullPath => {
      // Store relative path (strip workspace dir prefix) for portability
      let relativePath = fullPath;
      if (fullPath.startsWith(basePaths.WORKSPACE_DIR)) {
        relativePath = fullPath.slice(basePaths.WORKSPACE_DIR.length);
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }
      }
      return {
        path: relativePath,
        content: await this.sandboxPrimitive!.readFile(fullPath)
      } as WorkspaceFile;
    }));

    this.workspaceFiles = workspaceFiles;
    this.rawTranscript = transcripts.main ?? undefined;

    // Parse blocks using adapter
    const parsed = this.adapter.parseTranscripts(transcripts.main ?? '', transcripts.subagents);
    this.blocks = parsed.blocks;
    this.subagents = parsed.subagents.map(sub => ({
      id: sub.id,
      blocks: sub.blocks,
      rawTranscript: transcripts.subagents.find(t => t.id === sub.id)?.transcript,
    }));
  }

  private async persistFullSessionState(): Promise<void> {
    // Save all the transcripts
    await Promise.all([
      this.persistenceAdapter.saveTranscript(this.sessionId, this.rawTranscript ?? ""),
      ...this.subagents.map(subagent =>
        this.persistenceAdapter.saveTranscript(this.sessionId, subagent.rawTranscript ?? "", subagent.id)
      ),
    ]);

    // Save all the workspace files
    await Promise.all(
      this.workspaceFiles.map(file =>
        this.persistenceAdapter.saveWorkspaceFile(this.sessionId, file)
      )
    );

    // Update lastActivity
    await this.persistenceAdapter.updateSessionRecord(this.sessionId, {
      lastActivity: this.lastActivity,
    });
  }

  async syncSessionStateToStorage(): Promise<void> {
    await this.syncSessionStateWithSandbox();
    await this.persistFullSessionState();
  }

  async updateSessionOptions(sessionOptions: AgentArchitectureSessionOptions): Promise<void> {
    this.sessionOptions = sessionOptions;
    await this.persistenceAdapter.updateSessionRecord(this.sessionId, {
      sessionOptions: sessionOptions,
    });
    this.eventBus.emit('session:options:update', {
      sessionId: this.sessionId,
      options: sessionOptions,
    });
  }

  /**
   * Destroy session and cleanup resources
   */
  async destroy(): Promise<void> {
    try {
      // Stop watchers and periodic jobs first
      this.stopWatchersAndJobs();

      // Sync state if sandbox exists
      if (this.sandboxPrimitive) {
        await this.syncSessionStateToStorage();
        await this.sandboxPrimitive.terminate();
        this.sandboxPrimitive = undefined;
        this.adapter = undefined;
      }

      logger.info({ sessionId: this.sessionId }, 'Session destroyed');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to destroy AgentSession');
      throw error;
    }
  }

  private stopWatchersAndJobs(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
    if (this.sandboxHeartbeat) {
      clearInterval(this.sandboxHeartbeat);
      this.sandboxHeartbeat = undefined;
    }
  }

  /**
   * Get full session state for clients
   */
  getState(): RuntimeSessionData {
    return {
      sessionId: this.sessionId,
      agentProfileReference: this.agentProfile.id,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
      type: this.architecture,
      runtime: this.getRuntimeState(),
      blocks: this.blocks,
      workspaceFiles: this.workspaceFiles,
      subagents: this.subagents.map(s => ({
        id: s.id,
        blocks: s.blocks,
      })),
    };
  }

  /**
   * Get minimal session data for persistence
   */
  getPersistedListData(): PersistedSessionListData {
    return {
      sessionId: this.sessionId,
      type: this.architecture,
      agentProfileReference: this.agentProfile.id,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
    };
  }

  /**
   * Get runtime state (isLoaded, sandbox info)
   */
  getRuntimeState(): SessionRuntimeState {
    return {
      isLoaded: true, // If this method is called, session is loaded
      sandbox: this.sandboxStatus ? {
        sandboxId: this.sandboxId,
        status: this.sandboxStatus,
        statusMessage: this.statusMessage,
        restartCount: this.sandboxRestartCount,
        lastHealthCheck: this.lastHealthCheck ?? Date.now(),
      } : null,
    };
  }

  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      try {
        await this.syncSessionStateToStorage();
      } catch (error) {
        logger.error({ error, sessionId: this.sessionId }, 'Periodic sync failed');
      }
    }, 1000 * 60 * 1); // 1 minute
  }

  private startHealthMonitoring(): void {
    if (this.sandboxHeartbeat) {
      logger.warn({ sessionId: this.sessionId }, 'Health monitoring already running');
      return;
    }

    logger.info({ sessionId: this.sessionId }, 'Starting sandbox health monitoring');

    this.sandboxHeartbeat = setInterval(async () => {
      if (!this.sandboxPrimitive) return;

      const exitCode = await this.sandboxPrimitive.poll();
      this.lastHealthCheck = Date.now();

      if (exitCode !== null) {
        // Sandbox has terminated
        logger.warn({ sessionId: this.sessionId, exitCode }, 'Sandbox terminated');
        this.sandboxStatus = 'terminated';
        this.emitRuntimeStatus();

        // Stop monitoring and watchers
        this.stopWatchersAndJobs();

        // Notify SessionManager to unload this session
        if (this.onSandboxTerminated) {
          this.onSandboxTerminated(this.sessionId);
        }
      } else {
        // Sandbox is healthy
        if (this.sandboxStatus !== 'ready') {
          this.sandboxStatus = 'ready';
          this.emitRuntimeStatus();
        }
      }
    }, 1000 * 30); // 30 seconds
  }
}
