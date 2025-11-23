/**
 * Transcript Parser - Parse Claude SDK JSONL transcript files
 *
 * Claude SDK stores transcripts as JSONL (JSON Lines) files:
 * - Main session: {sessionId}.jsonl
 * - Subagents/tasks: agent-{uuid}.jsonl
 *
 * Each line is a JSON object representing an SDK message.
 */

import { logger } from '../../../config/logger.js';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Parse JSONL transcript file content into array of SDK messages
 *
 * @param content - Raw JSONL file content
 * @returns Array of parsed SDK messages
 */
export function parseClaudeTranscriptFile(content: string): SDKMessage[] {
  const lines = content.trim().split('\n').filter((line) => line.trim().length > 0);
  const messages: SDKMessage[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      const message = JSON.parse(line) as SDKMessage;
      messages.push(message);
    } catch (error) {
      logger.warn(
        { error, lineNumber: i + 1, line: line.substring(0, 100) },
        'Failed to parse transcript line (skipping)'
      );
      // Continue parsing other lines
    }
  }

  return messages;
}



/**
 * Extract subagent ID from filename
 *
 * Examples:
 * - "agent-abc123.jsonl" → "agent-abc123"
 * - "abc123.jsonl" → null (main transcript)
 *
 * @param filename - Transcript filename
 * @returns Subagent ID or null if main transcript
 */
export function extractSubagentId(filename: string): string | null {
  const basename = filename.replace('.jsonl', '');

  // Check if it starts with agent-
  if (basename.startsWith('agent-')) {
    return basename;
  }

  return null;
}

/**
 * Detect subagent status from transcript messages
 *
 * A subagent is considered:
 * - active: Has messages but no final result
 * - completed: Has a result message
 * - failed: Currently not detected from transcript (errors are handled separately)
 *
 * @param messages - Subagent transcript messages
 * @returns Subagent status
 */
export function detectSubagentStatus(
  messages: SDKMessage[]
): 'active' | 'completed' | 'failed' {
  if (messages.length === 0) {
    return 'active';
  }

  // Check last few messages for result
  const lastMessages = messages.slice(-5);

  for (const msg of lastMessages.reverse()) {
    if (msg.type === 'result') {
      return 'completed';
    }
  }

  return 'active';
}

