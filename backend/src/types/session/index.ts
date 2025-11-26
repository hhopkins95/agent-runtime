import type { ConversationBlock } from "./blocks";

export type AGENT_ARCHITECTURE_TYPE = "claude-agent-sdk" | "gemini-cli"

/**
 * A file in the workspace during the session
 */
export type WorkspaceFile = {
    path: string,
    content: string
}

// =============================================================================
// Persistence Layer Types (stored in database, no runtime state)
// =============================================================================

/**
 * Minimal session data for persistence layer.
 * Used for listing sessions and basic session info.
 * Does NOT include status - that's derived from runtime state.
 */
export interface PersistedSessionListData {
    /**
     * The id that comes from the agent app (ie Claude Agent SDK, Gemini CLI, etc...) -- not the id from external app that is using this server
     */
    sessionId: string,
    type: AGENT_ARCHITECTURE_TYPE,
    agentProfileReference: string, // The id / name of the agent profile this session is using
    name?: string,
    lastActivity?: number,
    createdAt?: number,
    metadata?: Record<string, unknown>,
}

/**
 * Full session data for persistence layer.
 * Includes raw transcripts and workspace files.
 * Does NOT include parsed blocks - those are computed at runtime.
 */
export interface PersistedSessionData extends PersistedSessionListData {
    /**
     * Stringified raw transcript blob from the agent application. Either the jsonl file for claude-agent-sdk or the json file for gemini-cli.
     */
    rawTranscript?: string,
    /**
     * Stringified raw transcript blob for each subagent. Either the jsonl file for claude-agent-sdk or the json file for gemini-cli.
     */
    subagents?: {
        id: string,
        rawTranscript?: string,
    }[],

    /**
     * The workspace files used / created during the session.
     */
    workspaceFiles: WorkspaceFile[]
}

// =============================================================================
// Runtime Layer Types (derived state, never persisted)
// =============================================================================

/**
 * Sandbox status values
 */
export type SandboxStatus = 'starting' | 'ready' | 'unhealthy' | 'terminated';

/**
 * Runtime state for a session.
 * This is computed/derived state, never persisted.
 */
export interface SessionRuntimeState {
    /** Whether the session is currently loaded in memory */
    isLoaded: boolean;
    /** Sandbox state, null if no sandbox exists */
    sandbox: {
        sandboxId: string;
        status: SandboxStatus;
        restartCount: number;
        lastHealthCheck: number; // timestamp
    } | null;
}

// =============================================================================
// Client-Facing Types (persistence data + runtime state)
// =============================================================================

/**
 * Session data returned to clients in list views.
 * Combines persisted data with runtime state.
 */
export interface SessionListItem extends PersistedSessionListData {
    runtime: SessionRuntimeState;
}

/**
 * Full session data returned to clients.
 * Includes parsed blocks and subagent conversations.
 */
export interface RuntimeSessionData extends SessionListItem {
    blocks: ConversationBlock[],
    workspaceFiles: WorkspaceFile[],
    subagents: {
        id: string,
        blocks: ConversationBlock[],
    }[]
}

// =============================================================================
// Legacy Type Aliases (for backward compatibility during migration)
// =============================================================================

/**
 * @deprecated Use PersistedSessionListData instead
 */
export type SessionListData = PersistedSessionListData;

/**
 * @deprecated Use PersistedSessionData instead
 */
export type SavedSessionData = PersistedSessionData;

/**
 * @deprecated Status is now derived from runtime state (SessionRuntimeState)
 */
export type SessionStatus = "pending" | "active" | "inactive" | "completed" | "failed" | 'building-sandbox';
