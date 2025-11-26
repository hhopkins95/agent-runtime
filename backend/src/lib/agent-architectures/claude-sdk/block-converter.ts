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
        return [convertUserMessage(msg)];

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
 * Convert SDK user message to UserMessageBlock
 */
function convertUserMessage(msg: Extract<SDKMessage, { type: 'user' }>): UserMessageBlock {
  // Extract text content from APIUserMessage
  const content = extractUserMessageContent(msg.message);

  return {
    type: 'user_message',
    id: msg.uuid || generateId(),
    timestamp: new Date().toISOString(),
    content,
  };
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
