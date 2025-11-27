import Database from "better-sqlite3";
import type {
  PersistenceAdapter,
  PersistedSessionListData,
  PersistedSessionData,
  WorkspaceFile,
  AgentProfile,
  AgentProfileListData,
} from "@hhopkins/agent-runtime/types";
import * as fs from "fs";
import * as path from "path";

/**
 * SQLite implementation of PersistenceAdapter for persistent storage.
 * Data persists across server restarts in a local SQLite database file.
 *
 * Note: Session status is NOT persisted - it's derived from runtime state.
 */
export class SqlitePersistenceAdapter implements PersistenceAdapter {
  private db: Database.Database;

  constructor(dbPath: string, profiles: AgentProfile[] = []) {
    // Ensure the directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open/create the database
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent access
    this.db.pragma("journal_mode = WAL");

    // Initialize schema
    this.initSchema();

    // Seed agent profiles
    this.seedProfiles(profiles);
  }

  private initSchema(): void {
    this.db.exec(`
      -- Sessions table (no status column - status is derived from runtime state)
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        agent_profile_reference TEXT NOT NULL,
        name TEXT,
        last_activity INTEGER,
        created_at INTEGER,
        metadata TEXT
      );

      -- Transcripts table (separate for potentially large content)
      CREATE TABLE IF NOT EXISTS transcripts (
        session_id TEXT NOT NULL,
        subagent_id TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        PRIMARY KEY (session_id, subagent_id)
      );

      -- Workspace files table
      CREATE TABLE IF NOT EXISTS workspace_files (
        session_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        PRIMARY KEY (session_id, path)
      );

      -- Agent profiles table
      CREATE TABLE IF NOT EXISTS agent_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        data TEXT NOT NULL
      );
    `);

    // Migration: Remove status column if it exists (for existing databases)
    // SQLite doesn't support DROP COLUMN easily, so we'll just ignore the column
  }

  private seedProfiles(profiles: AgentProfile[]): void {
    const upsert = this.db.prepare(`
      INSERT INTO agent_profiles (id, name, description, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        data = excluded.data
    `);

    for (const profile of profiles) {
      upsert.run(
        profile.id,
        profile.name,
        profile.description ?? null,
        JSON.stringify(profile)
      );
    }
  }

  // ========================================
  // Session Operations
  // ========================================

  async listAllSessions(): Promise<PersistedSessionListData[]> {
    const rows = this.db
      .prepare(
        `SELECT session_id, type, agent_profile_reference, name, last_activity, created_at, metadata
         FROM sessions`
      )
      .all() as any[];

    return rows.map((row) => ({
      sessionId: row.session_id,
      type: row.type,
      agentProfileReference: row.agent_profile_reference,
      name: row.name ?? undefined,
      lastActivity: row.last_activity ?? undefined,
      createdAt: row.created_at ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async loadSession(sessionId: string): Promise<PersistedSessionData | null> {
    // Get session
    const session = this.db
      .prepare(
        `SELECT session_id, type, agent_profile_reference, name, last_activity, created_at, metadata
         FROM sessions WHERE session_id = ?`
      )
      .get(sessionId) as any;

    if (!session) {
      return null;
    }

    // Get main transcript
    const mainTranscript = this.db
      .prepare(
        `SELECT content FROM transcripts WHERE session_id = ? AND subagent_id = ''`
      )
      .get(sessionId) as { content: string } | undefined;

    // Get subagent transcripts
    const subagentRows = this.db
      .prepare(
        `SELECT subagent_id, content FROM transcripts WHERE session_id = ? AND subagent_id != ''`
      )
      .all(sessionId) as { subagent_id: string; content: string }[];

    // Get workspace files
    const fileRows = this.db
      .prepare(`SELECT path, content FROM workspace_files WHERE session_id = ?`)
      .all(sessionId) as { path: string; content: string }[];

    return {
      sessionId: session.session_id,
      type: session.type,
      agentProfileReference: session.agent_profile_reference,
      name: session.name ?? undefined,
      lastActivity: session.last_activity ?? undefined,
      createdAt: session.created_at ?? undefined,
      metadata: session.metadata ? JSON.parse(session.metadata) : undefined,
      rawTranscript: mainTranscript?.content,
      subagents: subagentRows.map((row) => ({
        id: row.subagent_id,
        rawTranscript: row.content,
      })),
      workspaceFiles: fileRows.map((row) => ({
        path: row.path,
        content: row.content,
      })),
    };
  }

  async createSessionRecord(session: PersistedSessionListData): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (session_id, type, agent_profile_reference, name, last_activity, created_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.sessionId,
        session.type,
        session.agentProfileReference,
        session.name ?? null,
        session.lastActivity ?? null,
        session.createdAt ?? null,
        session.metadata ? JSON.stringify(session.metadata) : null
      );
  }

  async updateSessionRecord(
    sessionId: string,
    updates: Partial<PersistedSessionListData>
  ): Promise<void> {
    // Build dynamic UPDATE query based on provided fields
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.type !== undefined) {
      fields.push("type = ?");
      values.push(updates.type);
    }
    if (updates.agentProfileReference !== undefined) {
      fields.push("agent_profile_reference = ?");
      values.push(updates.agentProfileReference);
    }
    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.lastActivity !== undefined) {
      fields.push("last_activity = ?");
      values.push(updates.lastActivity);
    }
    if (updates.createdAt !== undefined) {
      fields.push("created_at = ?");
      values.push(updates.createdAt);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) {
      return;
    }

    values.push(sessionId);
    this.db
      .prepare(`UPDATE sessions SET ${fields.join(", ")} WHERE session_id = ?`)
      .run(...values);
  }

  // ========================================
  // Storage Operations
  // ========================================

  async saveTranscript(
    sessionId: string,
    rawTranscript: string,
    subagentId?: string
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO transcripts (session_id, subagent_id, content)
         VALUES (?, ?, ?)
         ON CONFLICT(session_id, subagent_id) DO UPDATE SET content = excluded.content`
      )
      .run(sessionId, subagentId ?? "", rawTranscript);
  }

  async saveWorkspaceFile(
    sessionId: string,
    file: WorkspaceFile
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO workspace_files (session_id, path, content)
         VALUES (?, ?, ?)
         ON CONFLICT(session_id, path) DO UPDATE SET content = excluded.content`
      )
      .run(sessionId, file.path, file.content);
  }

  async deleteSessionFile(sessionId: string, path: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM workspace_files WHERE session_id = ? AND path = ?`)
      .run(sessionId, path);
  }

  // ========================================
  // Agent Profile Operations
  // ========================================

  async listAgentProfiles(): Promise<AgentProfileListData[]> {
    const rows = this.db
      .prepare(`SELECT id, name, description FROM agent_profiles`)
      .all() as { id: string; name: string; description: string | null }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
    }));
  }

  async loadAgentProfile(agentProfileId: string): Promise<AgentProfile | null> {
    const row = this.db
      .prepare(`SELECT data FROM agent_profiles WHERE id = ?`)
      .get(agentProfileId) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.data) as AgentProfile;
  }

  // ========================================
  // App-Level Operations (not part of PersistenceAdapter interface)
  // ========================================

  /**
   * Permanently delete a session and all associated data.
   * This is an app-level operation, not part of the runtime's PersistenceAdapter interface.
   */
  deleteSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM workspace_files WHERE session_id = ?`).run(sessionId);
    this.db.prepare(`DELETE FROM transcripts WHERE session_id = ?`).run(sessionId);
    this.db.prepare(`DELETE FROM sessions WHERE session_id = ?`).run(sessionId);
  }

  /**
   * Get raw data from all tables for a session (for debugging).
   * Returns data exactly as stored in SQLite without any parsing/transformation.
   */
  getRawSessionData(sessionId: string): {
    session: Record<string, unknown> | null;
    transcripts: Record<string, unknown>[];
    workspaceFiles: Record<string, unknown>[];
  } {
    const session = this.db
      .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
      .get(sessionId) as Record<string, unknown> | undefined;

    const transcripts = this.db
      .prepare(`SELECT * FROM transcripts WHERE session_id = ?`)
      .all(sessionId) as Record<string, unknown>[];

    const workspaceFiles = this.db
      .prepare(`SELECT * FROM workspace_files WHERE session_id = ?`)
      .all(sessionId) as Record<string, unknown>[];

    return {
      session: session ?? null,
      transcripts,
      workspaceFiles,
    };
  }

  /**
   * Close the database connection.
   * Call this during graceful shutdown.
   */
  close(): void {
    this.db.close();
  }
}
