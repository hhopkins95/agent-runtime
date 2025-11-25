/**
 * SessionManager - Container orchestrating all agent sessions
 *
 * Refactored Responsibilities:
 * - Fetch all sessions from persistence (active + inactive)
 * - Create new AgentSession instances
 * - Load existing AgentSession from persistence
 * - Destroy AgentSession instances
 * - Emit domain events to EventBus
 * - Idle timeout monitoring (background job)
 *
 * REFACTORED: Now uses injected adapters instead of direct Convex calls
 */

import { logger } from '../config/logger.js';
import type { ModalContext } from '../lib/sandbox/modal/client.js';
import type { EventBus } from './event-bus.js';
import { AgentSession } from './agent-session.js';
import type { SessionListData, AGENT_ARCHITECTURE_TYPE } from '../types/session/index.js';
import type {
  PersistenceAdapter,
} from '../types/persistence-adapter.js';

/**
 * SessionManager configuration
 */
interface SessionManagerConfig {
  idleTimeoutMs: number;
  syncIntervalMs: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every 1 minute

/**
 * SessionManager - Container for all agent sessions
 *
 * Uses dependency injection pattern for all external dependencies
 */
export class SessionManager {
  // Active sessions (in-memory, with live sandboxes)
  private activeSessions: Map<string, AgentSession> = new Map();

  // Dependencies
  private readonly modalContext: ModalContext;
  private readonly eventBus: EventBus;
  private readonly adapters: {
    persistence: PersistenceAdapter;
  };
  private readonly config: SessionManagerConfig;

  // Background jobs
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    modalContext: ModalContext,
    eventBus: EventBus,
    adapters: {
      persistence: PersistenceAdapter;
    },
    config: {
      idleTimeoutMs?: number;
      syncIntervalMs?: number;
    } = {}
  ) {
    this.modalContext = modalContext;
    this.eventBus = eventBus;
    this.adapters = adapters;
    this.config = {
      idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      syncIntervalMs: config.syncIntervalMs ?? 30000,
    };
    logger.info('SessionManager initialized with injected adapters');
  }

  // ==========================================================================
  // Session CRUD Operations
  // ==========================================================================

  /**
   * Get all sessions (active from memory + inactive from persistence)
   * This is the source for sessions:list event
   */
  async getAllSessions(): Promise<SessionListData[]> {
    try {
      // Get all sessions from persistence adapter (includes both active and inactive)
      const sessions = await this.adapters.persistence.listAllSessions();

      logger.debug({ sessionCount: sessions.length }, 'Fetched all sessions from persistence');

      return sessions;
    } catch (error) {
      logger.error({ error }, 'Failed to get all sessions from persistence');
      // Fallback to active sessions only
      return this.getActiveSessionsMetadata();
    }
  }

  /**
   * Create a new session
   */
  async createSession(request: {
    agentProfileRef: string,
    architecture: AGENT_ARCHITECTURE_TYPE
  }): Promise<AgentSession> {
    try {
      logger.info({ request }, 'Creating new session...');

      // Create and initialize new AgentSession using static factory
      const session = await AgentSession.create(
        {
          agentProfileRef: request.agentProfileRef,
          architecture: request.architecture
        },
        this.modalContext,
        this.eventBus,
        this.adapters.persistence
      );

      // Add to active sessions
      this.activeSessions.set(session.sessionId, session);

      // Persist session record
      await this.adapters.persistence.createSessionRecord(session.getListData());

      logger.info(
        { sessionId: session.sessionId, activeCount: this.activeSessions.size },
        'Session created successfully'
      );

      // Emit domain events
      this.eventBus.emit('session:created', {
        sessionId: session.sessionId,
        metadata: session.getListData(),
      });

      this.eventBus.emit('sessions:changed');

      return session;
    } catch (error) {
      logger.error({ error, request }, 'Failed to create session');
      throw error;
    }
  }

  /**
   * Load existing session from persistence
   */
  async loadSession(sessionId: string): Promise<AgentSession> {
    try {
      // Check if already active
      if (this.activeSessions.has(sessionId)) {
        logger.warn({ sessionId }, 'Session already active, returning existing');
        return this.activeSessions.get(sessionId)!;
      }

      logger.info({ sessionId }, 'Loading session from persistence...');

      // Create AgentSession instance using static factory (loads from persistence internally)
      const session = await AgentSession.create(
        { sessionId },
        this.modalContext,
        this.eventBus,
        this.adapters.persistence
      );

      // Add to active sessions
      this.activeSessions.set(sessionId, session);

      logger.info(
        { sessionId, activeCount: this.activeSessions.size },
        'Session loaded successfully'
      );

      // Emit domain events
      this.eventBus.emit('session:loaded', { sessionId });
      this.eventBus.emit('sessions:changed');

      return session;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to load session');
      throw error;
    }
  }

  /**
   * Get active session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Check if session is active (has live sandbox)
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Destroy session and cleanup
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Session not found for destruction');
      return;
    }

    try {
      logger.info({ sessionId }, 'Destroying session...');

      // Destroy session (includes final sync)
      await session.destroy();

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      logger.info({ sessionId, activeCount: this.activeSessions.size }, 'Session destroyed');

      // Emit domain event
      this.eventBus.emit('sessions:changed');

      // Note: session:destroyed event is emitted by AgentSession.destroy()
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to destroy session');
      // Remove from map even if destruction failed
      this.activeSessions.delete(sessionId);
      throw error;
    }
  }

  // ==========================================================================
  // Session Queries
  // ==========================================================================

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): AgentSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get metadata for all active sessions
   */
  private getActiveSessionsMetadata(): SessionListData[] {
    return this.getActiveSessions().map((session) => session.getListData());
  }

  // ==========================================================================
  // Background Jobs
  // ==========================================================================

  /**
   * Start idle timeout cleanup job
   */
  startIdleTimeoutJob(): void {
    if (this.cleanupInterval) {
      logger.warn('Idle timeout job already running');
      return;
    }

    logger.info(
      { idleTimeoutMs: this.config.idleTimeoutMs, intervalMs: CLEANUP_INTERVAL_MS },
      'Starting idle timeout job'
    );

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop idle timeout job
   */
  stopIdleTimeoutJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      logger.info('Idle timeout job stopped');
    }
  }

  /**
   * Clean up idle sessions
   */
  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    const idleSessions: string[] = [];

    // Find idle sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      const metadata = session.getListData();
      const idleTime = now - (metadata.lastActivity || 0);

      if (idleTime > this.config.idleTimeoutMs) {
        idleSessions.push(sessionId);
      }
    }

    if (idleSessions.length === 0) {
      logger.debug('No idle sessions to clean up');
      return;
    }

    logger.info({ idleCount: idleSessions.length }, 'Cleaning up idle sessions...');

    // Destroy idle sessions
    for (const sessionId of idleSessions) {
      try {
        await this.destroySession(sessionId);
      } catch (error) {
        logger.error({ error, sessionId }, 'Failed to clean up idle session');
      }
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize SessionManager
   * Fetch all sessions from persistence
   */
  async initialize(): Promise<void> {
    logger.info('Initializing SessionManager...');
    try {
      const sessions = await this.getAllSessions();
      logger.info({ sessionCount: sessions.length }, 'SessionManager initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize SessionManager');
      throw error;
    }
  }

  /**
   * Start background jobs (idle timeout monitoring)
   */
  startBackgroundJobs(): void {
    this.startIdleTimeoutJob();
  }

  /**
   * Check if SessionManager is healthy
   */
  isHealthy(): boolean {
    // Simple health check - could be expanded
    return true;
  }

  /**
   * Graceful shutdown - destroy all sessions
   */
  async shutdown(): Promise<void> {
    logger.info({ activeCount: this.activeSessions.size }, 'Shutting down SessionManager...');

    // Stop background jobs
    this.stopIdleTimeoutJob();

    // Destroy all active sessions
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.destroySession(sessionId);
      } catch (error) {
        logger.error({ error, sessionId }, 'Failed to destroy session during shutdown');
      }
    }

    logger.info('SessionManager shutdown complete');
  }
}
