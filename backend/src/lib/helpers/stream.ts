// ==========================================================================
  // Stream Helpers
  // ==========================================================================

import { Logger } from "pino";

/**
 * Read all content from a ReadableStream as a string
 * Handles both string and Uint8Array chunks for cross-adapter compatibility
 */
export async function readStreamToString(
  stream: ReadableStream<string> | ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader();
  const chunks: (string | Uint8Array)[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Check if we have Uint8Array chunks (need to decode)
  if (chunks.length > 0 && chunks[0] instanceof Uint8Array) {
    const decoder = new TextDecoder();
    return chunks.map(chunk => decoder.decode(chunk as Uint8Array, { stream: true })).join('');
  }

  // String chunks - just concatenate
  return chunks.join('');
}

  /**
    * Base line-by-line stream reader
    * Reads a ReadableStream and yields individual lines
    * Handles all buffer management internally
    */
  export async function* streamLines(
    stream: ReadableStream<string>, 
    logger? : Logger
  ): AsyncGenerator<string> {
    const reader = stream.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Add chunk to buffer (value is already a string in text mode)
        buffer += value;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            yield trimmed;
          }
        }
      }

      // Process any remaining buffer when stream ends
      if (buffer.trim()) {
        yield buffer.trim();
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Generic JSONL stream parser
   * Builds on streamLines to parse each line as JSON and yield typed messages
   */
export async function* streamJSONL<T>(
    stream: ReadableStream<string>,
    context?: string, 
    logger? : Logger
  ): AsyncGenerator<T> {
    let lineCount = 0;

    for await (const line of streamLines(stream)) {
      try {
        const parsed: T = JSON.parse(line);
        lineCount++;
        yield parsed;
      } catch (parseError) {
        // Log non-JSONL output (npm warnings, debug messages, etc.)
        logger?.warn({ context, line }, 'Non-JSONL output');
      }
    }

    logger?.debug({ context, lineCount }, 'JSONL stream ended');
  }