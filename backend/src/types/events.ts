/**
 * WebSocket Event Schema for Agent Service
 *
 * Event naming convention: resource:scope:action
 *
 * Examples:
 * - sessions:list - Global sessions list update
 * - session:main:message - Main transcript message
 * - session:subagent:discovered - New subagent detected
 * - session:file:modified - File changed in workspace
 * - session:status - Session lifecycle status change
 */

import { SessionListItem, SessionRuntimeState, WorkspaceFile } from "./session/index";
import { ConversationBlock } from "./session/blocks";

// ============================================================================
// Server → Client Events
// ============================================================================

export interface ServerToClientEvents {
  // -------------------------------------------------------------------------
  // Global Events (broadcast to all clients)
  // -------------------------------------------------------------------------

  /**
   * Complete list of all sessions with runtime state
   * Sent when:
   * - Client first connects
   * - Session created/loaded/unloaded
   * - Session runtime state changes
   */
  'sessions:list': (sessions: SessionListItem[]) => void;

  // -------------------------------------------------------------------------
  // Block Streaming Events (session:block:*)
  // -------------------------------------------------------------------------

  /**
   * New block started in conversation (main or subagent)
   */
  'session:block:start': (data: {
    sessionId: string;
    conversationId: 'main' | string; // 'main' or subagentId
    block: ConversationBlock;
  }) => void;

  /**
   * Text delta for streaming block content
   */
  'session:block:delta': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    delta: string;
  }) => void;

  /**
   * Block metadata/status updated
   */
  'session:block:update': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    updates: Partial<ConversationBlock>;
  }) => void;

  /**
   * Block completed and finalized
   */
  'session:block:complete': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    block: ConversationBlock;
  }) => void;

  /**
   * Session metadata updated (tokens, cost, etc.)
   */
  'session:metadata:update': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    metadata: {
      usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        thinkingTokens?: number;
        totalTokens: number;
      };
      costUSD?: number;
      model?: string;
      [key: string]: unknown;
    };
  }) => void;

  // -------------------------------------------------------------------------
  // Subagent Events (session:subagent:*)
  // -------------------------------------------------------------------------

  /**
   * New subagent discovered
   * Sent when SDK spawns a new task/agent
   */
  'session:subagent:discovered': (data: {
    sessionId: string;
    subagent: {
      id: string;
      blocks: ConversationBlock[];
    };
  }) => void;

  /**
   * Subagent task completed
   */
  'session:subagent:completed': (data: {
    sessionId: string;
    subagentId: string;
    status: 'completed' | 'failed';
  }) => void;

  // -------------------------------------------------------------------------
  // File Events (session:file:*)
  // -------------------------------------------------------------------------

  /**
   * File created in workspace
   */
  'session:file:created': (data: {
    sessionId: string;
    file: WorkspaceFile;
  }) => void;

  /**
   * File modified in workspace
   */
  'session:file:modified': (data: {
    sessionId: string;
    file: WorkspaceFile;
  }) => void;

  /**
   * File deleted from workspace
   */
  'session:file:deleted': (data: {
    sessionId: string;
    path: string;
  }) => void;

  // -------------------------------------------------------------------------
  // Session Lifecycle Events
  // -------------------------------------------------------------------------

  /**
   * Session runtime status changed (unified event)
   * Covers: session loaded/unloaded, sandbox starting/ready/terminated
   */
  'session:status': (data: {
    sessionId: string;
    runtime: SessionRuntimeState;
  }) => void;

  // -------------------------------------------------------------------------
  // Error Events
  // -------------------------------------------------------------------------

  /**
   * Error occurred during session operation
   */
  'error': (error: {
    message: string;
    code?: string;
    sessionId?: string;
  }) => void;
}

// ============================================================================
// Client → Server Events
// ============================================================================

export interface ClientToServerEvents {
  /**
   * Join session room to receive updates
   */
  'session:join': (
    sessionId: string,
    callback: (response: {
      success: boolean;
      error?: string;
    }) => void
  ) => void;

  /**
   * Leave session room
   */
  'session:leave': (
    sessionId: string,
    callback: (response: {
      success: boolean;
    }) => void
  ) => void;
}

// ============================================================================
// Inter-Server Events (for future multi-server coordination)
// ============================================================================

export interface InterServerEvents {
  // Reserved for Redis adapter multi-server coordination
}

// ============================================================================
// Socket Data (custom socket metadata)
// ============================================================================

export interface SocketData {
  sessionId?: string;
  userId?: string;
  joinedAt?: number;
}
