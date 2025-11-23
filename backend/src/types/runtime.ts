/**
 * Runtime configuration types
 */

import type {
  PersistenceAdapter,
} from './persistence-adapter';

// ============================================================================
// Runtime Configuration
// ============================================================================

/**
 * Runtime configuration
 *
 * All required dependencies are injected at creation time using
 * dependency injection pattern.
 *
 * @example
 * const runtime = await createAgentRuntime({
 *   persistence: new ConvexPersistenceAdapter(...),
 *   profileLoader: new FileProfileLoader('./profiles'),
 *   sandboxConfig: new MyAppSandboxConfig(...),
 *   modal: {
 *     tokenId: process.env.MODAL_TOKEN_ID,
 *     tokenSecret: process.env.MODAL_TOKEN_SECRET,
 *     appName: 'my-app-agents',
 *   },
 * });
 */
export interface RuntimeConfig {
  // ========================================
  // Required Adapters (no defaults)
  // ========================================

  /**
   * Persistence adapter
   * Handles session CRUD operations and file/transcript storage
   * Combines session persistence and storage into single interface
   */
  persistence: PersistenceAdapter;

  // ========================================
  // Modal Configuration (required)
  // ========================================

  modal: {
    /**
     * Modal API token ID
     * Get from https://modal.com/settings
     */
    tokenId: string;

    /**
     * Modal API token secret
     * Get from https://modal.com/settings
     */
    tokenSecret: string;

    /**
     * Modal app name
     * Must be unique within your Modal account
     */
    appName: string;
  };

  // ========================================
  // Optional Configuration
  // ========================================

  /**
   * Idle session timeout in milliseconds
   * Sessions inactive for this duration will be terminated
   *
   * @default 900000 (15 minutes)
   */
  idleTimeoutMs?: number;

  /**
   * Periodic sync interval in milliseconds
   * How often to sync session state to persistence
   *
   * @default 30000 (30 seconds)
   */
  syncIntervalMs?: number;

  /**
   * WebSocket server port
   *
   * @default 3003
   */
  websocketPort?: number;

  /**
   * Log level
   *
   * @default 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

