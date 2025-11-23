/**
 * Stream Event Types
 *
 * Events emitted during real-time conversation streaming.
 * Supports both text deltas (character-by-character) and status updates
 * (metadata changes like tool execution status).
 *
 * These events allow UIs to:
 * - Show typing animations for assistant text
 * - Display thinking in real-time
 * - Update tool/subagent execution status
 * - Track progress of long-running operations
 */

import type { ConversationBlock } from './blocks.js';

// ============================================================================
// Stream Event Types
// ============================================================================

/**
 * Block Start Event
 *
 * Emitted when a new block begins. The block may be incomplete
 * (e.g., AssistantTextBlock with empty content that will be filled via deltas).
 *
 * Use cases:
 * - AssistantTextBlock starts (content: "")
 * - ThinkingBlock starts (content: "")
 * - ToolUseBlock created (may have partial input)
 */
export interface BlockStartEvent {
  type: 'block_start';

  /**
   * The block that's starting (may be partial/incomplete)
   */
  block: ConversationBlock;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string; // 'main' or subagentId
}

/**
 * Text Delta Event
 *
 * Emitted when text content is streaming in character-by-character.
 * Only applies to blocks with text content (AssistantText, Thinking).
 *
 * The UI should append this delta to the existing block content.
 */
export interface TextDeltaEvent {
  type: 'text_delta';

  /**
   * ID of the block being updated
   */
  blockId: string;

  /**
   * Text to append to the block's content
   */
  delta: string;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

/**
 * Block Update Event
 *
 * Emitted when a block's metadata/status changes (not text content).
 *
 * Use cases:
 * - ToolUseBlock status: pending ’ running ’ success
 * - SubagentBlock status: pending ’ running ’ success
 * - SubagentBlock output populated when complete
 * - Model information added to AssistantTextBlock
 */
export interface BlockUpdateEvent {
  type: 'block_update';

  /**
   * ID of the block being updated
   */
  blockId: string;

  /**
   * Partial updates to apply to the block
   * Only non-content fields should be updated here
   */
  updates: Partial<ConversationBlock>;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

/**
 * Block Complete Event
 *
 * Emitted when a block is finalized and complete.
 *
 * After this event:
 * - No more deltas will be sent for this block
 * - No more updates will be sent for this block
 * - The block is in its final state
 *
 * Use cases:
 * - AssistantTextBlock finished streaming
 * - ThinkingBlock finished streaming
 * - ToolResultBlock received (arrives complete)
 * - UserMessageBlock received (arrives complete)
 * - SystemBlock received (arrives complete)
 */
export interface BlockCompleteEvent {
  type: 'block_complete';

  /**
   * ID of the block that's now complete
   */
  blockId: string;

  /**
   * The complete, final block
   */
  block: ConversationBlock;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

/**
 * Metadata Update Event
 *
 * Emitted when session-level metadata changes.
 * Not related to a specific block.
 *
 * Use cases:
 * - Token usage updated
 * - Cost updated
 * - Model information
 */
export interface MetadataUpdateEvent {
  type: 'metadata_update';

  /**
   * Metadata updates
   */
  metadata: {
    /**
     * Token usage for the current response
     */
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      thinkingTokens?: number;
      totalTokens: number;
    };

    /**
     * Cost in USD
     */
    costUSD?: number;

    /**
     * Model being used
     */
    model?: string;

    /**
     * Other arbitrary metadata
     */
    [key: string]: unknown;
  };

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * All possible stream event types
 */
export type StreamEvent =
  | BlockStartEvent
  | TextDeltaEvent
  | BlockUpdateEvent
  | BlockCompleteEvent
  | MetadataUpdateEvent;

// ============================================================================
// Type Guards
// ============================================================================

export function isBlockStartEvent(event: StreamEvent): event is BlockStartEvent {
  return event.type === 'block_start';
}

export function isTextDeltaEvent(event: StreamEvent): event is TextDeltaEvent {
  return event.type === 'text_delta';
}

export function isBlockUpdateEvent(event: StreamEvent): event is BlockUpdateEvent {
  return event.type === 'block_update';
}

export function isBlockCompleteEvent(event: StreamEvent): event is BlockCompleteEvent {
  return event.type === 'block_complete';
}

export function isMetadataUpdateEvent(event: StreamEvent): event is MetadataUpdateEvent {
  return event.type === 'metadata_update';
}
