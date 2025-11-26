/**
 * AgentSession - Individual session management
 *
 * Refactored Responsibilities:
 * - Create and manage Modal sandbox
 * - Load session state from persistence on initialization
 * - Execute Claude Agent SDK
 * - Track main transcript + subagent transcripts
 * - Monitor workspace file changes (chokidar)
 * - Sync state to persistence periodically
 * - Emit domain events to EventBus
 * - Keep sandbox alive
 * - Clean up on destroy
 *
 * REFACTORED: Now uses injected adapters instead of direct Convex calls
 */

import { randomUUID } from 'crypto';
import { logger } from '../config/logger.js';
import type { ModalContext } from '../lib/sandbox/modal/client.js';
import type {
  PersistenceAdapter,
} from '../types/persistence-adapter.js';
import type { AgentProfile } from '../types/agent-profiles.js';
import type {
  RuntimeSessionData,
  SavedSessionData,
  WorkspaceFile,
  AGENT_ARCHITECTURE_TYPE,
  SessionListData
} from '../types/session/index.js';
import type { ConversationBlock } from '../types/session/blocks.js';
import type { StreamEvent } from '../types/session/streamEvents.js';
import { AgentSandbox } from './agent-sandbox.js';
import type { EventBus } from './event-bus.js';

/**
 * AgentSession class - manages individual session lifecycle
 */
export class AgentSession {
  // Identifiers
  public readonly sessionId: string;

  // Modal sandbox
  private sandbox?: AgentSandbox;
  private sandboxId?: string;

  // Session state (from SessionListData)
  private status: RuntimeSessionData['status'];
  private createdAt?: number;
  private lastActivity?: number;

  // Session data (structure matches SessionData)
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

  // Periodic jobs
  private syncInterval?: NodeJS.Timeout; // Sync session state to the persistence adapter 
  private sandboxHeartbeat?: NodeJS.Timeout; // Check if the sandbox is still alive

  // Watchers
  private workspaceWatcher?: AsyncGenerator<WorkspaceFile>;
  private sessionTranscriptWatcher?: AsyncGenerator<string>;



  static async create(
    /**
     * Session id. If undefined, a new session will be created via the persistence adapter,
     */
    input: {
      // For loading an existing session
      sessionId: string
    } | {
      // for creating a new session
      agentProfileRef: string,
      architecture: AGENT_ARCHITECTURE_TYPE
    },
    modalContext: ModalContext,
    eventBus: EventBus,
    persistenceAdapter: PersistenceAdapter,
  ): Promise<AgentSession> {

    if ('sessionId' in input) {
      // Load existing session from persistence
      const sessionData = await persistenceAdapter.loadSession(input.sessionId);
      if (!sessionData) {
        throw new Error(`Session ${input.sessionId} not found in persistence`);
      }

      const agentProfile = await persistenceAdapter.loadAgentProfile(sessionData.agentProfileReference)


      if (!agentProfile) {
        throw new Error(`Agent profile ${sessionData.agentProfileReference} not found in persistence`);
      }

      return new AgentSession({
        modalContext,
        eventBus,
        persistenceAdapter,
        agentProfile,
        session: { savedSessionData: sessionData },
      });
    }

    // otherwise create a new session
    const uuid = randomUUID();
    const agentProfile = await persistenceAdapter.loadAgentProfile(input.agentProfileRef);
    if (!agentProfile) {
      throw new Error(`Agent profile ${input.agentProfileRef} not found in persistence`);
    }

    return new AgentSession({
      modalContext,
      eventBus,
      persistenceAdapter,
      agentProfile,
      session: { newSessionId: uuid, architecture: input.architecture },
    });



  }

  private constructor(
    props: {
      // Application services
      modalContext: ModalContext,
      eventBus: EventBus,
      persistenceAdapter: PersistenceAdapter,

      agentProfile: AgentProfile,

      session: {
        newSessionId: string,
        architecture: AGENT_ARCHITECTURE_TYPE
      } | {
        savedSessionData: SavedSessionData,
      }
    }
  ) {

    this.modalContext = props.modalContext;
    this.eventBus = props.eventBus;
    this.persistenceAdapter = props.persistenceAdapter;
    this.agentProfile = props.agentProfile;

    // Get architecture from session data
    if ('newSessionId' in props.session) {
      this.architecture = props.session.architecture;
    } else {
      this.architecture = props.session.savedSessionData.type;
    }

    this.status = 'pending';

    this.lastActivity = Date.now();

    if ('newSessionId' in props.session) {

      this.sessionId = props.session.newSessionId;
      this.createdAt = Date.now();
      this.blocks = [];
      this.subagents = [];
      this.workspaceFiles = [];

    } else {

      this.sessionId = props.session.savedSessionData.sessionId;
      this.rawTranscript = props.session.savedSessionData.rawTranscript;
      this.workspaceFiles = props.session.savedSessionData.workspaceFiles;

      // Initialize with empty blocks - will be parsed eagerly after sandbox is created
      this.blocks = [];
      this.subagents = props.session.savedSessionData.subagents?.map(subagent => ({
        id: subagent.id,
        blocks: [],
        rawTranscript: subagent.rawTranscript,
      })) ?? [];
    }


    this.initialize(props.session);
  }

  private async initialize(session: {
    newSessionId: string,
    architecture: AGENT_ARCHITECTURE_TYPE
  } | {
    savedSessionData: SavedSessionData,
  }): Promise<void> {

    // Create the sandbox
    this.status = "building-sandbox";
    this.eventBus.emit('session:status', {
      sessionId: this.sessionId,
      status: 'building-sandbox',
    });
    if ('newSessionId' in session) {
      this.sandbox = await AgentSandbox.create({
        agentProfile: this.agentProfile,
        modalContext: this.modalContext,
        session: {
          newSessionId: session.newSessionId,
          architecture: session.architecture,
        }
      })
    } else {
      this.sandbox = await AgentSandbox.create({
        agentProfile: this.agentProfile,
        modalContext: this.modalContext,
        session: {
          savedSessionData: session.savedSessionData,
        }
      })

      // For existing sessions, parse blocks eagerly
      const parsed = await this.sandbox.parseSessionTranscripts();
      this.blocks = parsed.blocks;
      this.subagents = parsed.subagents.map(sub => ({
        id: sub.id,
        blocks: sub.blocks,
        rawTranscript: this.subagents.find(s => s.id === sub.id)?.rawTranscript,
      }));
    }

    // Start the file watchers and periodic syncs
    this.startWorkspaceFileWatcher()
    this.startSessionTranscriptWatcher()
    this.startPeriodicSync()
    this.startHealthMonitoring()

    // Transition to active status and notify clients
    this.status = 'active';
    this.eventBus.emit('session:status', {
      sessionId: this.sessionId,
      status: 'active',
    });
  }

  private async reloadSandbox(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.terminate();
    }

    // Get the latest saved session data
    const sessionData = await this.persistenceAdapter.loadSession(this.sessionId);
    if (!sessionData) {
      throw new Error(`Session ${this.sessionId} not found in persistence`);
    }
    // Create the new sandbox
    this.sandbox = await AgentSandbox.create({
      agentProfile: this.agentProfile,
      modalContext: this.modalContext,
      session: { savedSessionData: sessionData },
    });
  }

  /**
   * Send message to agent and stream responses
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Session not initialized');
    }

    console.log("Sending Message")

    try {

      logger.info(
        {
          sessionId: this.sessionId,
          architecture: this.architecture,
          messageLength: message.length,
        },
        'Sending message to agent...'
      );

      for await (const event of this.sandbox.executeQuery(message)) {
        // Emit block-based events
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
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, architecture: this.architecture }, 'Failed to send message');
      throw error;
    }
  }

  private async syncSessionStateWithSandbox(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Sandbox not initialized');
    }

    // Read raw transcripts and workspace files
    const transcripts = await this.sandbox.readSessionTranscripts()
    const workspaceFiles = await this.sandbox.readAllWorkspaceFiles()

    this.workspaceFiles = workspaceFiles;
    this.rawTranscript = transcripts.main;

    // Parse blocks eagerly using sandbox adapter
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
      ...this.subagents.map(subagent => this.persistenceAdapter.saveTranscript(this.sessionId, subagent.rawTranscript ?? "")),
    ]);

    // Save all the workspace files
    await Promise.all(this.workspaceFiles.map(file => this.persistenceAdapter.saveWorkspaceFile(this.sessionId, file)));

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
      await this.syncSessionStateToStorage();
      await this.sandbox?.terminate();
      // stop the file watchers and periodic syncs
      if (this.syncInterval) clearInterval(this.syncInterval);
      if (this.sandboxHeartbeat) clearInterval(this.sandboxHeartbeat);

    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to destroy AgentSession');
      throw error;
    }
  }

  /**
   * Get full session state (returns SessionData)
   */
  getState(): RuntimeSessionData {
    return {
      sessionId: this.sessionId,
      agentProfileReference: this.agentProfile.id,
      status: this.status,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
      blocks: this.blocks,
      workspaceFiles: this.workspaceFiles,
      rawTranscript: this.rawTranscript,
      subagents: this.subagents,
      type: this.architecture,
    }
  }

  /**
   * Get minimal session list data (for displaying in session lists)
   */
  getListData(): SessionListData {
    return {
      sessionId: this.sessionId,
      type: this.architecture,
      agentProfileReference: this.agentProfile.id,
      status: this.status,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
    }
  }



  private async startWorkspaceFileWatcher(): Promise<void> {
    if (!this.sandbox) return;
    (async () => {
      try {
        for await (const file of this.sandbox!.streamWorkspaceFileChanges()) {
          // Update or add file
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


  private async startSessionTranscriptWatcher(): Promise<void> {
    if (!this.sandbox) return;

    (async () => {
      try {
        for await (const transcriptContent of this.sandbox!.streamSessionTranscriptChanges(this.sessionId)) {
          this.rawTranscript = transcriptContent;

          // Parse blocks eagerly via sandbox
          const parsed = await this.sandbox!.parseSessionTranscripts();
          this.blocks = parsed.blocks;
          // Note: subagents are updated separately via their own watcher
        }
      } catch (error) {
        logger.error({ error, sessionId: this.sessionId }, 'Session transcript watcher failed');
      }
    })();
  }

  /**
   * Start periodic sync background job
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      await this.syncSessionStateToStorage();
    }, 1000 * 60 * 1); // 1 minutes
  }


  private startHealthMonitoring(): void {
    if (this.sandboxHeartbeat) {
      logger.warn({ sessionId: this.sessionId }, 'Health monitoring already running');
      return;
    }

    logger.info({ sessionId: this.sessionId }, 'Starting sandbox health monitoring');

    this.sandboxHeartbeat = setInterval(async () => {
      const exitCode = await this.sandbox?.heartbeat();
      if (exitCode !== null) {
        logger.error({ sessionId: this.sessionId, exitCode }, 'Sandbox heartbeat failed');
        await this.reloadSandbox();
      }
    }, 1000 * 30); // 30 seconds

  }

}

