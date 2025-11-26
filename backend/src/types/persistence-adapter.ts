import { AgentProfile, AgentProfileListData } from "./agent-profiles";
import { PersistedSessionData, PersistedSessionListData, WorkspaceFile } from "./session";

/**
 * Combined persistence adapter for sessions and storage
 *
 * Combines session persistence and file/transcript storage into a single interface
 * since they typically use the same backend (database + storage).
 *
 * Applications implement this interface to integrate with their persistence layer.
 *
 * @example
 * ```typescript
 * class ConvexPersistenceAdapter implements PersistenceAdapter {
 *   constructor(private convexUrl: string, private apiKey: string) {
 *     this.convex = new ConvexHttpClient(convexUrl);
 *   }
 *
 *   // Session methods
 *   async fetchAllSessions() {
 *     return await this.convex.query('sessions:fetchAll');
 *   }
 *
 *   // Storage methods
 *   async uploadTranscript(sessionId, content) {
 *     return await this.convex.mutation('storage:uploadTranscript', { sessionId, content });
 *   }
 *   // ... other methods
 * }
 * ```
 */
export interface PersistenceAdapter {
  // ========================================
  // Session Operations
  // ========================================

  /**
   * Fetch all sessions for initialization
   * Called once when SessionManager starts
   *
   * @returns All sessions in the database (without runtime state)
   */
  listAllSessions(): Promise<PersistedSessionListData[]>;

  /**
   * Retrieve the full session data for a given session id.
   * Does not include the message history, but includes the raw transcript.
   * The AgentSession class will handle parsing the transcript into the message history.
   *
   * @param sessionId - Unique session identifier
   * @returns Session data or null if not found
   */
  loadSession(sessionId: string): Promise<PersistedSessionData | null>;

  /**
   * Save a new session to persistence
   * Called when creating a new session
   *
   * @param session - Session data to persist (without runtime state)
   */
  createSessionRecord(
    session: PersistedSessionListData
  ): Promise<void>;

  /**
   * Updates session data.
   *
   * @param sessionId - Session to update
   * @param updates - Partial session data to merge
   */
  updateSessionRecord(
    sessionId: string,
    updates: Partial<PersistedSessionListData>
  ): Promise<void>;


  // ========================================
  // Storage Operations
  // ========================================

  /**
   * Upload a transcript file and return storage URL
   * Transcripts are JSONL format, potentially large
   *
   * @param sessionId - Session id
   * @param rawTranscript - Raw transcript to save. Whatever is saved by the agent application (either claude or gemini)
   * @param subagentId - Optional subagent identifier
   * @returns void
   */
  saveTranscript(
    sessionId: string,
    rawTranscript: string,
    subagentId?: string,
  ): Promise<void>;

  /**
   * Upsert a workspace file (non-transcript)
   * For workspace files modified by the agent
   *
   * @param sessionId - Owner session
   * @param path - Relative path in workspace
   * @param content - File contents
   */
  saveWorkspaceFile(
    sessionId: string,
    file: WorkspaceFile
  ): Promise<void>;

  /**
   * Delete a workspace file
   *
   * @param sessionId - Session id
   * @param path - Path of the file to delete
   */
  deleteSessionFile(
    sessionId: string,
    path: string
  ): Promise<void>;



  // ========================================
  // Agent Profile Operations
  // ========================================

  /**
   * List all possible agent profiles that can be used
   */
  listAgentProfiles(): Promise<AgentProfileListData[]>;

  /**
   * 
   * Retrieve the full agent profile data for a given agent profile id.
   *
   * @param agentProfileId - Unique agent profile identifier
   * @returns Agent profile data or null if not found
   */
  loadAgentProfile(agentProfileId: string): Promise<AgentProfile | null>;
}

