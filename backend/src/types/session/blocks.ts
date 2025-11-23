/**
 * Conversation Block Types
 *
 * Atomic units of conversation state. Each discrete event in a session
 * is represented as a separate block, allowing for granular state updates
 * and flexible syncing.
 *
 * These types are architecture-agnostic and can be built from either
 * Claude SDK or Gemini CLI message formats.
 */

// ============================================================================
// Content Types
// ============================================================================

/**
 * Text content - simple string message
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content - base64 or URL
 */
export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    data: string;
    mediaType?: string;
  };
}

/**
 * Multimodal content - mix of text, images, etc.
 */
export type ContentPart = TextContent | ImageContent;

export type MessageContent = string | ContentPart[];

// ============================================================================
// Tool Execution Types
// ============================================================================

/**
 * Status of a tool execution
 */
export type ToolExecutionStatus =
  | 'pending'    // Tool use created, not yet executed
  | 'running'    // Tool is currently executing
  | 'success'    // Tool completed successfully
  | 'error';     // Tool execution failed

/**
 * Tool execution input/output
 */
export interface ToolIO {
  input: Record<string, unknown>;
  output?: unknown;
}

// ============================================================================
// Base Block Interface
// ============================================================================

/**
 * Common fields for all conversation blocks
 */
export interface BaseBlock {
  /**
   * Unique identifier for this block
   */
  id: string;

  /**
   * ISO timestamp when this block was created
   */
  timestamp: string;
}

// ============================================================================
// Block Type Definitions
// ============================================================================

/**
 * User message block
 * Represents user input to the agent
 */
export interface UserMessageBlock extends BaseBlock {
  type: 'user_message';
  content: MessageContent;
}

/**
 * Assistant text response block
 * Represents text output from the agent
 */
export interface AssistantTextBlock extends BaseBlock {
  type: 'assistant_text';
  content: string;

  /**
   * Model that generated this text (e.g., "claude-sonnet-4-5")
   */
  model?: string;
}

/**
 * Tool use block
 * Represents the agent deciding to use a tool
 */
export interface ToolUseBlock extends BaseBlock {
  type: 'tool_use';

  /**
   * Name of the tool (e.g., "Read", "Bash", "Edit")
   */
  toolName: string;

  /**
   * Unique ID for this specific tool invocation
   * Used to match with corresponding ToolResultBlock
   */
  toolUseId: string;

  /**
   * Tool input parameters
   */
  input: Record<string, unknown>;

  /**
   * Current execution status
   */
  status: ToolExecutionStatus;

  /**
   * Display name for the tool (if different from toolName)
   */
  displayName?: string;

  /**
   * Human-readable description of what this tool does
   */
  description?: string;
}

/**
 * Tool result block
 * Represents the result of a tool execution
 */
export interface ToolResultBlock extends BaseBlock {
  type: 'tool_result';

  /**
   * Links back to the ToolUseBlock via toolUseId
   */
  toolUseId: string;

  /**
   * Tool execution output
   */
  output: unknown;

  /**
   * Whether the tool execution failed
   */
  isError: boolean;

  /**
   * How long the tool took to execute (milliseconds)
   */
  durationMs?: number;

  /**
   * Display formatting hint for UI
   */
  renderOutputAsMarkdown?: boolean;
}

/**
 * Thinking block
 * Represents agent's internal reasoning/thought process
 */
export interface ThinkingBlock extends BaseBlock {
  type: 'thinking';

  /**
   * The thinking content (extended thinking tokens)
   */
  content: string;

  /**
   * Optional summary of the thought (for Gemini ThoughtSummary)
   */
  summary?: string;
}

/**
 * System block
 * Represents system-level events and messages
 */
export interface SystemBlock extends BaseBlock {
  type: 'system';

  /**
   * Category of system message
   */
  subtype:
    | 'session_start'    // Session initialized
    | 'session_end'      // Session completed/terminated
    | 'error'            // Error occurred
    | 'status'           // Status update (e.g., "compacting")
    | 'hook_response'    // Hook execution result
    | 'auth_status';     // Authentication status update

  /**
   * Human-readable message
   */
  message: string;

  /**
   * Additional structured metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Subagent execution status
 */
export type SubagentStatus =
  | 'pending'    // Subagent task created, not yet started
  | 'running'    // Subagent is currently executing
  | 'success'    // Subagent completed successfully
  | 'error';     // Subagent execution failed

/**
 * Subagent block
 * Represents a subagent invocation in the main conversation.
 * Acts as a reference/link to the subagent's own conversation thread.
 *
 * Only applicable for Claude SDK (Gemini doesn't have subagents)
 */
export interface SubagentBlock extends BaseBlock {
  type: 'subagent';

  /**
   * Unique identifier for this subagent
   * Used to reference the subagent's conversation thread
   */
  subagentId: string;

  /**
   * Name/type of the subagent (e.g., "code-reviewer", "test-runner")
   */
  name?: string;

  /**
   * The input/prompt given to the subagent
   */
  input: string;

  /**
   * Current execution status
   */
  status: SubagentStatus;

  /**
   * Final output from the subagent (once completed)
   */
  output?: string;

  /**
   * How long the subagent took to complete (milliseconds)
   */
  durationMs?: number;

  /**
   * The tool_use_id of the Task tool that spawned this subagent
   * Useful for linking back to the original tool use in Claude SDK
   */
  toolUseId?: string;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * All possible conversation block types
 */
export type ConversationBlock =
  | UserMessageBlock
  | AssistantTextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | SystemBlock
  | SubagentBlock;

// ============================================================================
// Type Guards
// ============================================================================

export function isUserMessageBlock(block: ConversationBlock): block is UserMessageBlock {
  return block.type === 'user_message';
}

export function isAssistantTextBlock(block: ConversationBlock): block is AssistantTextBlock {
  return block.type === 'assistant_text';
}

export function isToolUseBlock(block: ConversationBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

export function isToolResultBlock(block: ConversationBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

export function isThinkingBlock(block: ConversationBlock): block is ThinkingBlock {
  return block.type === 'thinking';
}

export function isSystemBlock(block: ConversationBlock): block is SystemBlock {
  return block.type === 'system';
}

export function isSubagentBlock(block: ConversationBlock): block is SubagentBlock {
  return block.type === 'subagent';
}
