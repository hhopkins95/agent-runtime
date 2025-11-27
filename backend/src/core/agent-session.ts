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
import { AgentSandbox } from './agent-sandbox.js';
import type { EventBus } from './event-bus.js';
import { getArchitectureParser } from '../lib/agent-architectures/factory.js';

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

  // Modal sandbox (lazy - created on first sendMessage)
  private sandbox?: AgentSandbox;
  private sandboxId?: string;
  private sandboxStatus: SandboxStatus | null = null;
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
      architecture: AGENT_ARCHITECTURE_TYPE
    },
    modalContext: ModalContext,
    eventBus: EventBus,
    persistenceAdapter: PersistenceAdapter,
    onSandboxTerminated?: OnSandboxTerminatedCallback,
  ): Promise<AgentSession> {

    let session: AgentSession;
    let sessionInput: { newSessionId: string; architecture: AGENT_ARCHITECTURE_TYPE } | { savedSessionData: PersistedSessionData };

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

      sessionInput = { newSessionId: uuid, architecture: input.architecture };
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
        architecture: AGENT_ARCHITECTURE_TYPE
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
    } else {
      this.architecture = props.session.savedSessionData.type;
      this.sessionId = props.session.savedSessionData.sessionId;
      this.createdAt = props.session.savedSessionData.createdAt;
      this.rawTranscript = props.session.savedSessionData.rawTranscript;
      this.workspaceFiles = props.session.savedSessionData.workspaceFiles;
      this.blocks = []; // Will be parsed in initialize()
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
      const parser = getArchitectureParser(this.architecture);
      const subagentTranscripts = this.subagents.map(s => ({
        id: s.id,
        transcript: s.rawTranscript ?? '',
      }));
      const parsed = parser(session.savedSessionData.rawTranscript, subagentTranscripts);
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
    if (this.sandbox) return;

    logger.info({ sessionId: this.sessionId }, 'Activating sandbox...');

    this.sandboxStatus = 'starting';
    this.emitRuntimeStatus();

    // Build session data for sandbox creation
    const savedSessionData: PersistedSessionData = {
      sessionId: this.sessionId,
      type: this.architecture,
      agentProfileReference: this.agentProfile.id,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      rawTranscript: this.rawTranscript,
      subagents: this.subagents.map(s => ({ id: s.id, rawTranscript: s.rawTranscript })),
      workspaceFiles: this.workspaceFiles,
    };

    this.sandbox = await AgentSandbox.create({
      agentProfile: this.agentProfile,
      modalContext: this.modalContext,
      session: { savedSessionData },
    });

    this.sandboxId = this.sandbox.getId();
    this.sandboxStatus = 'ready';
    this.lastHealthCheck = Date.now();

    // Start watchers and monitoring (only when sandbox exists)
    this.startWorkspaceFileWatcher();
    this.startSessionTranscriptWatcher();
    this.startPeriodicSync();
    this.startHealthMonitoring();

    this.emitRuntimeStatus();

    logger.info({ sessionId: this.sessionId, sandboxId: this.sandboxId }, 'Sandbox activated');
  }

  /**
   * Emit the current runtime status
   */
  private emitRuntimeStatus(): void {
    this.eventBus.emit('session:status', {
      sessionId: this.sessionId,
      runtime: this.getRuntimeState(),
    });
  }

  /**
   * Send message to agent and stream responses
   */
  async sendMessage(message: string): Promise<void> {
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

      for await (const event of this.sandbox!.executeQuery(message)) {
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
    if (!this.sandbox) {
      // No sandbox, nothing to sync from
      return;
    }

    // Read raw transcripts and workspace files from sandbox
    const transcripts = await this.sandbox.readSessionTranscripts();
    const workspaceFiles = await this.sandbox.readAllWorkspaceFiles();

    this.workspaceFiles = workspaceFiles;
    this.rawTranscript = transcripts.main ?? undefined;

    // Parse blocks using sandbox adapter
    const parsed = await this.sandbox.parseSessionTranscripts();
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

  /**
   * Destroy session and cleanup resources
   */
  async destroy(): Promise<void> {
    try {
      // Stop watchers and periodic jobs first
      this.stopWatchersAndJobs();

      // Sync state if sandbox exists
      if (this.sandbox) {
        await this.syncSessionStateToStorage();
        await this.sandbox.terminate();
        this.sandbox = undefined;
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
      sandbox: this.sandboxId && this.sandboxStatus ? {
        sandboxId: this.sandboxId,
        status: this.sandboxStatus,
        restartCount: this.sandboxRestartCount,
        lastHealthCheck: this.lastHealthCheck ?? Date.now(),
      } : null,
    };
  }

  private startWorkspaceFileWatcher(): void {
    if (!this.sandbox) return;
    (async () => {
      try {
        for await (const file of this.sandbox!.streamWorkspaceFileChanges()) {
          const existingIndex = this.workspaceFiles.findIndex(f => f.path === file.path);
          if (existingIndex >= 0) {
            this.workspaceFiles[existingIndex] = file;
          } else {
            this.workspaceFiles.push(file);
          }

          this.eventBus.emit('session:file:modified', {
            sessionId: this.sessionId,
            file
          });
        }
      } catch (error) {
        logger.error({ error, sessionId: this.sessionId }, 'Workspace file watcher failed');
      }
    })();
  }

  private startSessionTranscriptWatcher(): void {
    if (!this.sandbox) return;

    (async () => {
      try {
        for await (const transcriptContent of this.sandbox!.streamSessionTranscriptChanges(this.sessionId)) {
          this.rawTranscript = transcriptContent;

          // Parse blocks via sandbox
          const parsed = await this.sandbox!.parseSessionTranscripts();
          this.blocks = parsed.blocks;
        }
      } catch (error) {
        logger.error({ error, sessionId: this.sessionId }, 'Session transcript watcher failed');
      }
    })();
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
      if (!this.sandbox) return;

      const exitCode = await this.sandbox.heartbeat();
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
