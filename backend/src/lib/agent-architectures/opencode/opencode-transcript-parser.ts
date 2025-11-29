import { FileDiff, UserMessage, AssistantMessage, Part } from "@opencode-ai/sdk"
import { logger } from '../../../config/logger.js';
import type {
  ConversationBlock,
  SubagentBlock,
  ToolExecutionStatus,
} from "../../../types/session/blocks.js";


/**
 * Exported session type when running `opencode export <sessionId>`
 */
export interface OpenCodeSessionTranscript {
  info: {
    id: string
    projectID: string
    directory: string
    parentID?: string
    title: string
    version: string
    time: {
      created: number
      updated: number
      compacting?: number
    }
    summary?: {
      additions: number
      deletions: number
      files: number
      diffs?: FileDiff[]
    }
    share?: { url: string }
    revert?: { messageID: string, partID?: string, snapshot?: string, diff?: string }
  }
  messages: Array<{
    info: UserMessage | AssistantMessage
    parts: Part[]
  }>
}

/**
 * Result of parsing an OpenCode transcript
 */
export interface ParsedTranscript {
  blocks: ConversationBlock[];
  subagents: { id: string; blocks: ConversationBlock[] }[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique block ID
 */
function generateId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Map OpenCode tool status to ToolExecutionStatus
 */
function mapToolStatus(status: string): ToolExecutionStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

/**
 * Convert Unix timestamp (ms) to ISO string
 */
function toISOTimestamp(unixMs: number): string {
  return new Date(unixMs).toISOString();
}

/**
 * Get the start time from a part, falling back to current time
 */
function getPartTimestamp(part: Part): string {
  if ('time' in part && part.time && 'start' in part.time) {
    return toISOTimestamp(part.time.start);
  }
  return new Date().toISOString();
}

// ============================================================================
// Part Converters
// ============================================================================

/**
 * Convert a text part to AssistantTextBlock
 */
function convertTextPart(part: Part & { type: 'text' }, model?: string): ConversationBlock {
  return {
    type: 'assistant_text',
    id: part.id,
    timestamp: getPartTimestamp(part),
    content: part.text,
    model,
  };
}

/**
 * Convert a reasoning part to ThinkingBlock
 */
function convertReasoningPart(part: Part & { type: 'reasoning' }): ConversationBlock {
  return {
    type: 'thinking',
    id: part.id,
    timestamp: getPartTimestamp(part),
    content: part.text,
  };
}

/**
 * Convert a tool part to ToolUseBlock + ToolResultBlock
 */
function convertToolPart(part: Part & { type: 'tool' }): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  const state = part.state as any; // State can be pending, running, completed, or error

  // Create ToolUseBlock
  blocks.push({
    type: 'tool_use',
    id: part.id,
    timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
    toolName: part.tool,
    toolUseId: part.callID,
    input: state.input || {},
    status: mapToolStatus(state.status),
    displayName: state.title,
  });

  // Create ToolResultBlock if completed or error
  if (state.status === 'completed' || state.status === 'error') {
    blocks.push({
      type: 'tool_result',
      id: generateId(),
      timestamp: state.time?.end ? toISOTimestamp(state.time.end) : new Date().toISOString(),
      toolUseId: part.callID,
      output: state.status === 'error' ? state.error : state.output,
      isError: state.status === 'error',
      durationMs: state.time?.end && state.time?.start
        ? state.time.end - state.time.start
        : undefined,
    });
  }

  return blocks;
}

/**
 * Convert step-start part to SystemBlock
 */
function convertStepStartPart(part: Part & { type: 'step-start' }): ConversationBlock {
  return {
    type: 'system',
    id: part.id,
    timestamp: new Date().toISOString(),
    subtype: 'status',
    message: 'Step started',
    metadata: {
      snapshot: (part as any).snapshot,
    },
  };
}

/**
 * Convert step-finish part to SystemBlock with token/cost metadata
 */
function convertStepFinishPart(part: Part & { type: 'step-finish' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'system',
    id: part.id,
    timestamp: new Date().toISOString(),
    subtype: 'status',
    message: `Step finished: ${p.reason}`,
    metadata: {
      reason: p.reason,
      snapshot: p.snapshot,
      cost: p.cost,
      tokens: p.tokens,
    },
  };
}

/**
 * Convert retry part to SystemBlock (error)
 */
function convertRetryPart(part: Part & { type: 'retry' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'system',
    id: part.id,
    timestamp: p.time?.created ? toISOTimestamp(p.time.created) : new Date().toISOString(),
    subtype: 'error',
    message: `Retry attempt ${p.attempt}: ${p.error?.message || 'Unknown error'}`,
    metadata: {
      attempt: p.attempt,
      error: p.error,
    },
  };
}

/**
 * Convert agent part to SubagentBlock
 */
function convertAgentPart(part: Part & { type: 'agent' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'subagent',
    id: part.id,
    timestamp: new Date().toISOString(),
    subagentId: p.name || generateId(),
    name: p.name,
    input: p.source?.value || '',
    status: 'success',
  };
}

/**
 * Convert subtask part to SubagentBlock
 */
function convertSubtaskPart(part: Part & { type: 'subtask' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'subagent',
    id: part.id,
    timestamp: new Date().toISOString(),
    subagentId: generateId(),
    name: p.agent,
    input: p.prompt,
    status: 'pending',
  };
}

/**
 * Extract subagent from task tool part
 * Returns the SubagentBlock and recursively parsed subagent blocks
 */
function extractSubagentFromTaskTool(
  part: Part & { type: 'tool' },
  model?: string
): { subagentBlock: SubagentBlock; subagentBlocks: ConversationBlock[] } | null {
  const state = part.state as any;

  // Check if this is a task tool with subagent metadata
  if (part.tool !== 'task' || !state.metadata?.sessionId) {
    return null;
  }

  const sessionId = state.metadata.sessionId;
  const subagentBlocks: ConversationBlock[] = [];

  // Parse the summary parts if available (contains subagent's conversation)
  if (state.metadata.summary && Array.isArray(state.metadata.summary)) {
    for (const summaryPart of state.metadata.summary) {
      const converted = convertPartToBlocks(summaryPart, model);
      subagentBlocks.push(...converted);
    }
  }

  // Create the SubagentBlock for the main conversation
  const subagentBlock: SubagentBlock = {
    type: 'subagent',
    id: part.id,
    timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
    subagentId: sessionId,
    name: state.input?.subagent_type,
    input: state.input?.prompt || state.input?.description || '',
    status: mapToolStatus(state.status) as any,
    output: typeof state.output === 'string' ? state.output : undefined,
    durationMs: state.time?.end && state.time?.start
      ? state.time.end - state.time.start
      : undefined,
    toolUseId: part.callID,
  };

  return { subagentBlock, subagentBlocks };
}

/**
 * Convert a single part to ConversationBlocks
 */
function convertPartToBlocks(part: Part, model?: string): ConversationBlock[] {
  try {
    switch (part.type) {
      case 'text':
        return [convertTextPart(part as any, model)];

      case 'reasoning':
        return [convertReasoningPart(part as any)];

      case 'tool':
        // Don't convert task tools here - they're handled separately for subagent extraction
        if ((part as any).tool === 'task') {
          return [];
        }
        return convertToolPart(part as any);

      case 'step-start':
        return [convertStepStartPart(part as any)];

      case 'step-finish':
        return [convertStepFinishPart(part as any)];

      case 'retry':
        return [convertRetryPart(part as any)];

      case 'agent':
        return [convertAgentPart(part as any)];

      case 'subtask':
        return [convertSubtaskPart(part as any)];

      // Skip these part types - not displayed in conversation
      case 'file':
      case 'snapshot':
      case 'patch':
      case 'compaction':
        return [];

      default:
        logger.debug({ partType: (part as any).type }, 'Unknown OpenCode part type, skipping');
        return [];
    }
  } catch (error) {
    logger.error({ error, part }, 'Failed to convert OpenCode part to block');
    return [];
  }
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an OpenCode exported transcript file into ConversationBlocks
 *
 * @param content - JSON string content of the exported transcript
 * @returns Parsed blocks and extracted subagent conversations
 */
export function parseOpenCodeTranscriptFile(content: string): ParsedTranscript {
  const transcript = JSON.parse(content) as OpenCodeSessionTranscript;
  const blocks: ConversationBlock[] = [];
  const subagentsMap = new Map<string, ConversationBlock[]>();

  for (const message of transcript.messages) {
    const { info, parts } = message;

    if (info.role === 'user') {
      // User message: extract text parts into a single UserMessageBlock
      const textParts = parts.filter(p => p.type === 'text') as Array<Part & { type: 'text' }>;
      const content = textParts.map(p => p.text).join('\n');

      if (content) {
        blocks.push({
          type: 'user_message',
          id: info.id,
          timestamp: toISOTimestamp(info.time.created),
          content,
        });
      }
    } else if (info.role === 'assistant') {
      const assistantInfo = info as AssistantMessage;
      const model = assistantInfo.modelID;

      // Process each part
      for (const part of parts) {
        // Special handling for task tools (subagent extraction)
        if (part.type === 'tool' && (part as any).tool === 'task') {
          const extracted = extractSubagentFromTaskTool(part as any, model);
          if (extracted) {
            // Add SubagentBlock to main conversation
            blocks.push(extracted.subagentBlock);

            // Store subagent blocks
            if (extracted.subagentBlocks.length > 0) {
              subagentsMap.set(extracted.subagentBlock.subagentId, extracted.subagentBlocks);
            }
          } else {
            // If not a proper subagent, convert as regular tool
            blocks.push(...convertToolPart(part as any));
          }
        } else {
          // Regular part conversion
          blocks.push(...convertPartToBlocks(part, model));
        }
      }
    }
  }

  // Convert subagents map to array
  const subagents = Array.from(subagentsMap.entries()).map(([id, blocks]) => ({
    id,
    blocks,
  }));

  return { blocks, subagents };
}