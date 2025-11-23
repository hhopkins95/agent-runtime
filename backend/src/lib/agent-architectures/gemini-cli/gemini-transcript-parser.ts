import { MessageRecord as GeminiMessageRecord } from "@google/gemini-cli-core";

/**
 * Parse Gemini CLI transcript file content into array of message records
 *
 * @param content - Raw transcript file content
 * @returns Array of parsed Gemini message records
 */
export function parseGeminiTranscriptFile(content: string): GeminiMessageRecord[] {
  throw new Error('Not implemented');
}

/**
 * Extract subagent ID from filename
 *
 * @param filename - Transcript filename
 * @returns Subagent ID or null if main transcript
 */
export function extractSubagentId(filename: string): string | null {
  throw new Error('Not implemented');
}

/**
 * Detect subagent status from transcript messages
 *
 * @param messages - Subagent transcript messages
 * @returns Subagent status
 */
export function detectSubagentStatus(
  messages: GeminiMessageRecord[]
): 'active' | 'completed' | 'failed' {
  throw new Error('Not implemented');
}
