/**
 * Block Converter - Convert Claude SDK messages to ConversationBlocks
 *
 * Transforms SDK messages (from JSONL transcripts or streaming) into
 * architecture-agnostic ConversationBlock structures.
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  ConversationBlock,
  UserMessageBlock,
  ToolUseBlock,
  ToolResultBlock,
  SubagentBlock,
} from '../../../types/session/blocks.js';
import { logger } from '../../../config/logger.js';
import { StreamEvent } from '../../../types/session/streamEvents.js';




export function convertMessagesToBlocks(messages: SDKMessage[]): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];

  for (const msg of messages) {
    // Convert the message to blocks
    // Note: convertUserMessage now handles tool results internally
    const convertedBlocks = sdkMessageToBlocks(msg);
    blocks.push(...convertedBlocks);
  }

  return blocks;
}
   


export function parseStreamEvent(event: SDKMessage): StreamEvent[] {
  // Handle system error messages from SDK executor
  if ((event as any).type === 'system' && (event as any).subtype === 'error') {
    throw new Error((event as any).error?.message || 'Unknown SDK error');
  }

  // Determine which conversation this belongs to
  const conversationId: 'main' | string =
    event.type === 'stream_event' && event.parent_tool_use_id
      ? event.parent_tool_use_id
      : 'main';

  // Handle streaming events (SDKPartialAssistantMessage)
  if (event.type === 'stream_event') {
    const streamEvent = parseRawStreamEvent(event.event, conversationId);
    return streamEvent ? [streamEvent] : [];
  }

  // Handle result messages (final metadata)
  if (event.type === 'result' && event.subtype === 'success') {
    const metadataEvent: StreamEvent = {
      type: 'metadata_update',
      conversationId,
      metadata: {
        usage: {
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
          cacheReadTokens: event.usage.cache_read_input_tokens,
          cacheWriteTokens: event.usage.cache_creation_input_tokens,
          totalTokens: event.usage.input_tokens + event.usage.output_tokens,
        },
        costUSD: event.total_cost_usd,
      },
    };

    // Also emit result as a system block
    const blocks = sdkMessageToBlocks(event);
    const blockEvents: StreamEvent[] = blocks.map((block) => ({
      type: 'block_complete' as const,
      blockId: block.id,
      block,
      conversationId,
    }));

    return [metadataEvent, ...blockEvents];
  }

  // Handle tool progress messages
  if (event.type === 'tool_progress') {
    return [{
      type: 'block_update',
      blockId: event.tool_use_id,
      conversationId: event.parent_tool_use_id || 'main',
      updates: {
        status: 'running',
      } as any,
    }];
  }

  // For other message types (user, assistant, system, auth_status, etc.)
  // Convert to blocks and emit block_complete events
  const blocks = sdkMessageToBlocks(event);
  return blocks.map((block) => ({
    type: 'block_complete' as const,
    blockId: block.id,
    block,
    conversationId,
  }));
}


/**
 * Convert an SDK message to a ConversationBlock
 *
 * @param msg - SDK message from transcript or stream
 * @returns ConversationBlock or null if message doesn't map to a block
 */
export function sdkMessageToBlocks(msg: SDKMessage): ConversationBlock[] {
  try {
    switch (msg.type) {
      case 'user':
        return convertUserMessage(msg);

      case 'assistant':
        return convertAssistantMessage(msg);

      case 'system':
        return convertSystemMessage(msg);

      case 'result':
        return convertResultMessage(msg);

      case 'tool_progress':
        // Tool progress is handled via block updates, not new blocks
        return [];

      case 'auth_status':
        return convertAuthStatus(msg);

      case 'stream_event':
        // Streaming events are handled by parseStreamEvent, not here
        // This is for parsing stored transcripts
        return [];

      default:
        logger.warn({ msgType: (msg as any).type }, 'Unknown SDK message type');
        return [];
    }
  } catch (error) {
    logger.error({ error, msg }, 'Failed to convert SDK message to block');
    return [];
  }
}

/**
 * Convert multiple SDK messages to ConversationBlocks
 *
 * @param messages - Array of SDK messages
 * @returns Array of ConversationBlocks
 */
export function sdkMessagesToBlocks(messages: SDKMessage[]): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];


  for (const msg of messages) {
    const converted = sdkMessageToBlocks(msg);
    blocks.push(...converted);
  }

  return blocks;
}

/**
 * Convert SDK user message to blocks
 *
 * Handles two cases:
 * 1. Real user messages (content is string) → UserMessageBlock
 * 2. Tool results (content is array with tool_result blocks) → ToolResultBlock or SubagentBlock
 */
function convertUserMessage(msg: Extract<SDKMessage, { type: 'user' }>): ConversationBlock[] {
  const content = msg.message.content;

  // Tool result messages have content as array with tool_result blocks
  if (Array.isArray(content) && content.some((b: any) => b.type === 'tool_result')) {
    const blocks: ConversationBlock[] = [];

    for (const block of content) {
      if ((block as any).type === 'tool_result') {
        const toolResultBlock = block as any;
        const toolUseResult = (msg as any).toolUseResult;

        if (toolUseResult?.agentId) {
          // Task tool result → SubagentBlock
          blocks.push({
            type: 'subagent',
            id: generateId(),
            timestamp: new Date().toISOString(),
            subagentId: `agent-${toolUseResult.agentId}`,
            name: toolUseResult.subagent_type,
            input: toolUseResult.prompt || '',
            status: toolUseResult.status === 'completed' ? 'success' : 'error',
            output: extractTextFromToolResultContent(toolUseResult.content),
            durationMs: toolUseResult.totalDurationMs,
            toolUseId: toolResultBlock.tool_use_id,
          });
        } else {
          // Regular tool result → ToolResultBlock
          blocks.push({
            type: 'tool_result',
            id: generateId(),
            timestamp: new Date().toISOString(),
            toolUseId: toolResultBlock.tool_use_id,
            output: toolResultBlock.content,
            isError: toolResultBlock.is_error || false,
          });
        }
      }
    }

    return blocks;
  }

  // Real user message (content is string)
  return [{
    type: 'user_message',
    id: msg.uuid || generateId(),
    timestamp: new Date().toISOString(),
    content: extractUserMessageContent(msg.message),
  }];
}

/**
 * Extract text content from tool result content array
 */
function extractTextFromToolResultContent(content: any): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }
  return undefined;
}

/**
 * Extract content from SDK APIUserMessage
 */
function extractUserMessageContent(message: any): string {
  // APIUserMessage.content can be string or ContentBlock[]
  if (typeof message.content === 'string') {
    return message.content;
  }

  // If array, concatenate text blocks
  if (Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Convert SDK assistant message to blocks (text, tool use, thinking)
 */
function convertAssistantMessage(msg: Extract<SDKMessage, { type: 'assistant' }>): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  const apiMessage = msg.message;

  // APIAssistantMessage.content is ContentBlock[]
  for (const contentBlock of apiMessage.content) {
    switch (contentBlock.type) {
      case 'text':
        blocks.push({
          type: 'assistant_text',
          id: contentBlock.id || generateId(),
          timestamp: new Date().toISOString(),
          content: contentBlock.text,
          model: apiMessage.model,
        });
        break;

      case 'tool_use':
        blocks.push({
          type: 'tool_use',
          id: contentBlock.id,
          timestamp: new Date().toISOString(),
          toolName: contentBlock.name,
          toolUseId: contentBlock.id,
          input: contentBlock.input as Record<string, unknown>,
          status: 'success', // In transcript, tool use is complete
        });
        break;

      case 'thinking':
        blocks.push({
          type: 'thinking',
          id: contentBlock.id || generateId(),
          timestamp: new Date().toISOString(),
          content: (contentBlock as any).thinking || '',
        });
        break;

      default:
        logger.warn({ blockType: contentBlock.type }, 'Unknown assistant content block type');
    }
  }

  // Check if this assistant message has tool results
  // Tool results come as separate user messages in the SDK, so we handle them separately

  return blocks;
}

/**
 * Convert SDK system message to SystemBlock or SubagentBlock
 */
function convertSystemMessage(
  msg: Extract<SDKMessage, { type: 'system' }>
): ConversationBlock[] {
  switch (msg.subtype) {
    case 'init':
      return [{
        type: 'system',
        id: msg.uuid,
        timestamp: new Date().toISOString(),
        subtype: 'session_start',
        message: `Session initialized with ${msg.model}`,
        metadata: {
          model: msg.model,
          tools: msg.tools,
          permissionMode: msg.permissionMode,
          agents: msg.agents,
          mcp_servers: msg.mcp_servers,
        },
      }];

    case 'status':
      return [{
        type: 'system',
        id: msg.uuid,
        timestamp: new Date().toISOString(),
        subtype: 'status',
        message: `Status: ${msg.status || 'ready'}`,
        metadata: { status: msg.status },
      }];

    case 'hook_response':
      return [{
        type: 'system',
        id: msg.uuid,
        timestamp: new Date().toISOString(),
        subtype: 'hook_response',
        message: `Hook ${msg.hook_name} (${msg.hook_event})`,
        metadata: {
          hook_name: msg.hook_name,
          hook_event: msg.hook_event,
          stdout: msg.stdout,
          stderr: msg.stderr,
          exit_code: msg.exit_code,
        },
      }];

    case 'compact_boundary':
      return [{
        type: 'system',
        id: msg.uuid,
        timestamp: new Date().toISOString(),
        subtype: 'status',
        message: `Compact boundary (${msg.compact_metadata.trigger})`,
        metadata: msg.compact_metadata,
      }];

    default:
      logger.warn({ subtype: (msg as any).subtype }, 'Unknown system message subtype');
      return [];
  }
}

/**
 * Convert SDK result message to SystemBlock
 */
function convertResultMessage(
  msg: Extract<SDKMessage, { type: 'result' }>
): ConversationBlock[] {
  const isSuccess = msg.subtype === 'success';

  return [{
    type: 'system',
    id: msg.uuid,
    timestamp: new Date().toISOString(),
    subtype: isSuccess ? 'session_end' : 'error',
    message: isSuccess
      ? `Session completed successfully (${msg.num_turns} turns, $${msg.total_cost_usd.toFixed(4)})`
      : `Session ended with error: ${msg.subtype}`,
    metadata: {
      duration_ms: msg.duration_ms,
      num_turns: msg.num_turns,
      total_cost_usd: msg.total_cost_usd,
      usage: msg.usage,
      modelUsage: msg.modelUsage,
      errors: 'errors' in msg ? msg.errors : undefined,
    },
  }];
}

/**
 * Convert SDK auth status to SystemBlock
 */
function convertAuthStatus(
  msg: Extract<SDKMessage, { type: 'auth_status' }>
): ConversationBlock[] {
  return [{
    type: 'system',
    id: msg.uuid,
    timestamp: new Date().toISOString(),
    subtype: 'auth_status',
    message: msg.isAuthenticating ? 'Authenticating...' : 'Authentication complete',
    metadata: {
      isAuthenticating: msg.isAuthenticating,
      output: msg.output,
      error: msg.error,
    },
  }];
}


/**
    * Parse Anthropic SDK RawMessageStreamEvent to StreamEvent
    */
function parseRawStreamEvent(rawEvent: any, conversationId: 'main' | string): StreamEvent | null {
  switch (rawEvent.type) {
    case 'content_block_start': {
      const block = rawEvent.content_block;
      // const index = rawEvent.index; // Not needed for block start

      // Create appropriate block based on content type
      if (block.type === 'text') {
        return {
          type: 'block_start',
          conversationId,
          block: {
            type: 'assistant_text',
            id: block.id,
            timestamp: new Date().toISOString(),
            content: block.text || '',
          },
        };
      } else if (block.type === 'tool_use') {
        return {
          type: 'block_start',
          conversationId,
          block: {
            type: 'tool_use',
            id: block.id,
            timestamp: new Date().toISOString(),
            toolName: block.name,
            toolUseId: block.id,
            input: block.input || {},
            status: 'pending',
          },
        };
      } else if (block.type === 'thinking') {
        return {
          type: 'block_start',
          conversationId,
          block: {
            type: 'thinking',
            id: block.id,
            timestamp: new Date().toISOString(),
            content: '',
          },
        };
      }
      return null;
    }

    case 'content_block_delta': {
      const delta = rawEvent.delta;
      // const index = rawEvent.index; // Not needed for delta

      if (delta.type === 'text_delta') {
        return {
          type: 'text_delta',
          blockId: '', // Will be set by the caller based on index
          conversationId,
          delta: delta.text,
        };
      } else if (delta.type === 'input_json_delta') {
        // Tool input is being streamed
        // We don't emit deltas for tool input, just wait for complete
        return null;
      } else if (delta.type === 'thinking_delta') {
        return {
          type: 'text_delta',
          blockId: '', // Will be set by the caller based on index
          conversationId,
          delta: (delta as any).thinking || '',
        };
      }
      return null;
    }

    case 'content_block_stop': {
      // const index = rawEvent.index; // Not needed for block stop
      // Block is complete - but we need the full block data
      // This is handled by tracking blocks in the session
      return null; // Will emit block_complete when we have full data
    }

    case 'message_start': {
      // Message starting - no action needed
      return null;
    }

    case 'message_delta': {
      // Message metadata update (usage, stop_reason, etc.)
      const usage = rawEvent.usage;
      if (usage) {
        return {
          type: 'metadata_update',
          conversationId,
          metadata: {
            usage: {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
            },
          },
        };
      }
      return null;
    }

    case 'message_stop': {
      // Message complete - final event
      return null;
    }

    default:
      return null;
  }
}


/**
 * Extract tool results from user messages
 *
 * In the SDK, tool results come back as synthetic user messages
 * with tool_result content blocks
 */
export function extractToolResultBlocks(msg: Extract<SDKMessage, { type: 'user' }>): ToolResultBlock[] {
  const blocks: ToolResultBlock[] = [];

  // Check if this is a synthetic message (tool results)
  if (!msg.isSynthetic) {
    return blocks;
  }

  // APIUserMessage content can contain tool_result blocks
  const content = msg.message.content;
  if (!Array.isArray(content)) {
    return blocks;
  }

  for (const block of content) {
    if (block.type === 'tool_result') {
      blocks.push({
        type: 'tool_result',
        id: generateId(),
        timestamp: new Date().toISOString(),
        toolUseId: block.tool_use_id,
        output: block.content,
        isError: block.is_error || false,
      });
    }
  }

  return blocks;
}

/**
 * Detect if a tool use spawned a subagent (Task tool)
 *
 * When the Task tool is used, it spawns a subagent. We need to create
 * a SubagentBlock to represent this in the main conversation.
 */
export function createSubagentBlockFromToolUse(
  toolUseBlock: ToolUseBlock,
  subagentId: string
): SubagentBlock {
  return {
    type: 'subagent',
    id: generateId(),
    timestamp: new Date().toISOString(),
    subagentId,
    name: toolUseBlock.input.subagent_type as string | undefined,
    input: toolUseBlock.input.prompt as string,
    status: 'pending',
    toolUseId: toolUseBlock.toolUseId,
  };
}

/**
 * Generate a unique ID for blocks that don't have UUIDs
 */
function generateId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
