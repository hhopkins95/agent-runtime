import type {
  PersistenceAdapter,
  SessionListData,
  SavedSessionData,
  WorkspaceFile,
  AgentProfile,
  AgentProfileListData,
} from "@hhopkins/agent-runtime/types";

/**
 * In-memory implementation of PersistenceAdapter for development/demo purposes.
 * All data is lost when the server restarts.
 *
 * This is a minimal implementation to demonstrate the adapter pattern.
 * For production use, implement with a real database (PostgreSQL, MongoDB, Convex, etc.)
 */
export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private sessions = new Map<string, SessionListData>();
  private transcripts = new Map<string, string>();
  private subagentTranscripts = new Map<string, Map<string, string>>();
  private workspaceFiles = new Map<string, Map<string, WorkspaceFile>>();
  private agentProfiles = new Map<string, AgentProfile>();

  constructor(profiles: AgentProfile[] = []) {
    // Initialize with provided agent profiles
    profiles.forEach((profile) => {
      this.agentProfiles.set(profile.id, profile);
    });
  }

  // ========================================
  // Session Operations
  // ========================================

  async listAllSessions(): Promise<SessionListData[]> {
    return Array.from(this.sessions.values());
  }

  async loadSession(sessionId: string): Promise<SavedSessionData | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const rawTranscript = this.transcripts.get(sessionId);
    const subagentTranscriptMap = this.subagentTranscripts.get(sessionId);
    const workspaceFileMap = this.workspaceFiles.get(sessionId);

    const subagents = subagentTranscriptMap
      ? Array.from(subagentTranscriptMap.entries()).map(([id, rawTranscript]) => ({
          id,
          rawTranscript,
        }))
      : [];

    const workspaceFiles = workspaceFileMap
      ? Array.from(workspaceFileMap.values())
      : [];

    return {
      ...session,
      rawTranscript,
      subagents,
      workspaceFiles,
    };
  }

  async createSessionRecord(session: SessionListData): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async updateSessionRecord(
    sessionId: string,
    updates: Partial<SessionListData>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, ...updates });
    }
  }

  // ========================================
  // Storage Operations
  // ========================================

  async saveTranscript(
    sessionId: string,
    rawTranscript: string,
    subagentId?: string
  ): Promise<void> {
    if (subagentId) {
      // Save subagent transcript
      if (!this.subagentTranscripts.has(sessionId)) {
        this.subagentTranscripts.set(sessionId, new Map());
      }
      this.subagentTranscripts.get(sessionId)!.set(subagentId, rawTranscript);
    } else {
      // Save main transcript
      this.transcripts.set(sessionId, rawTranscript);
    }
  }

  async saveWorkspaceFile(
    sessionId: string,
    file: WorkspaceFile
  ): Promise<void> {
    if (!this.workspaceFiles.has(sessionId)) {
      this.workspaceFiles.set(sessionId, new Map());
    }
    this.workspaceFiles.get(sessionId)!.set(file.path, file);
  }

  async deleteSessionFile(sessionId: string, path: string): Promise<void> {
    const sessionFiles = this.workspaceFiles.get(sessionId);
    if (sessionFiles) {
      sessionFiles.delete(path);
    }
  }

  // ========================================
  // Agent Profile Operations
  // ========================================

  async listAgentProfiles(): Promise<AgentProfileListData[]> {
    return Array.from(this.agentProfiles.values()).map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
  }

  async loadAgentProfile(agentProfileId: string): Promise<AgentProfile | null> {
    return this.agentProfiles.get(agentProfileId) || null;
  }
}
