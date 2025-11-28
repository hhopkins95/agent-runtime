/**
 * OpenCode Storage Types
 *
 * Based on the OpenCode (sst/opencode) file-based JSON storage format.
 * OpenCode uses a hierarchical JSON file structure:
 * - storage/project/{projectID}.json
 * - storage/session/{projectID}/{sessionID}.json
 * - storage/message/{sessionID}/{messageID}.json
 * - storage/part/{messageID}/{partID}.json
 */

// =============================================================================
// ID Generation
// =============================================================================

/**
 * OpenCode ID prefixes
 */
export const ID_PREFIX = {
  project: 'prj',
  session: 'ses',
  message: 'msg',
  part: 'prt',
} as const;

// =============================================================================
// Project Types
// =============================================================================

export interface OpenCodeProject {
  id: string;
  worktree: string;
  vcsDir?: string;
  vcs?: 'git';
  time: {
    created: number;
    initialized?: number;
  };
}

// =============================================================================
// Session Types
// =============================================================================

export interface OpenCodeSession {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  title: string;
  version: string;
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
  share?: {
    secret: string;
    url: string;
  };
  time: {
    created: number;
    updated: number;
    compacting?: number;
  };
  revert?: {
    messageID: string;
    partID?: string;
    snapshot?: string;
    diff?: string;
  };
}

// =============================================================================
// Message Types
// =============================================================================

export interface OpenCodeMessageBase {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: {
    created: number;
    completed?: number;
  };
}

export interface OpenCodeUserMessage extends OpenCodeMessageBase {
  role: 'user';
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  summary?: {
    title?: string;
    body?: string;
    diffs?: Array<{ file: string; hash: string }>;
  };
  system?: string;
  tools?: Record<string, boolean>;
}

export interface OpenCodeAssistantMessage extends OpenCodeMessageBase {
  role: 'assistant';
  parentID?: string;
  modelID: string;
  providerID: string;
  mode?: string;
  path?: {
    cwd: string;
    root: string;
  };
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache?: {
      read: number;
      write: number;
    };
  };
  summary?: boolean;
  error?: OpenCodeError | null;
  finish?: string;
}

export type OpenCodeMessage = OpenCodeUserMessage | OpenCodeAssistantMessage;

// =============================================================================
// Part Types
// =============================================================================

export interface OpenCodePartBase {
  id: string;
  sessionID: string;
  messageID: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: {
    start?: number;
    end?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface OpenCodeTextPart extends OpenCodePartBase {
  type: 'text';
  text: string;
}

export interface OpenCodeReasoningPart extends OpenCodePartBase {
  type: 'reasoning';
  text: string;
}

export interface OpenCodeToolPart extends OpenCodePartBase {
  type: 'tool';
  callID: string;
  tool: string;
  state: {
    status: 'pending' | 'running' | 'completed' | 'error';
    input?: Record<string, unknown>;
    output?: unknown;
    title?: string;
    time?: {
      start?: number;
      end?: number;
      compacted?: boolean;
    };
  };
}

export interface OpenCodeFilePart extends OpenCodePartBase {
  type: 'file';
  mime: string;
  filename?: string;
  url: string;
  source?: {
    type: string;
    id: string;
  };
}

export interface OpenCodeSnapshotPart extends OpenCodePartBase {
  type: 'snapshot';
  snapshot: string;
}

export interface OpenCodePatchPart extends OpenCodePartBase {
  type: 'patch';
  hash: string;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
}

export interface OpenCodeAgentPart extends OpenCodePartBase {
  type: 'agent';
  name: string;
  source?: {
    sessionID: string;
  };
}

export interface OpenCodeCompactionPart extends OpenCodePartBase {
  type: 'compaction';
  auto: boolean;
}

export interface OpenCodeSubtaskPart extends OpenCodePartBase {
  type: 'subtask';
  prompt: string;
  description: string;
  agent: string;
}

export interface OpenCodeRetryPart extends Omit<OpenCodePartBase, 'time'> {
  type: 'retry';
  attempt: number;
  time: {
    created: number;
  };
  error: {
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
  };
}

export interface OpenCodeStepStartPart extends OpenCodePartBase {
  type: 'step-start';
  step: number;
  snapshot?: string;
}

export interface OpenCodeStepFinishPart extends OpenCodePartBase {
  type: 'step-finish';
  step: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
  };
  cost?: number;
}

export type OpenCodePart =
  | OpenCodeTextPart
  | OpenCodeReasoningPart
  | OpenCodeToolPart
  | OpenCodeFilePart
  | OpenCodeSnapshotPart
  | OpenCodePatchPart
  | OpenCodeAgentPart
  | OpenCodeCompactionPart
  | OpenCodeSubtaskPart
  | OpenCodeRetryPart
  | OpenCodeStepStartPart
  | OpenCodeStepFinishPart;

// =============================================================================
// Error Types
// =============================================================================

export interface OpenCodeError {
  message: string;
  statusCode?: number;
  isRetryable?: boolean;
}

// =============================================================================
// Intermediate Storage Format (for our persistence layer)
// =============================================================================

/**
 * Our intermediate format for storing OpenCode sessions.
 * This is what gets serialized to `rawTranscript` in PersistedSessionData.
 */
export interface OpenCodeSessionTranscript {
  version: 1;
  sessionId: string;
  projectId: string;

  session: OpenCodeSession;
  messages: OpenCodeMessageWithParts[];

  metadata: {
    createdAt: string;
    updatedAt: string;
    totalCost?: number;
    totalTokens?: {
      input: number;
      output: number;
    };
  };
}

/**
 * Message with its parts included (for our intermediate format)
 */
export interface OpenCodeMessageWithParts {
  message: OpenCodeMessage;
  parts: OpenCodePart[];
}
