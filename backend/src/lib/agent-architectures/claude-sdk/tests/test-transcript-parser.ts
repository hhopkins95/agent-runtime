/**
 * Test script for Claude SDK transcript parser
 *
 * Reads example JSONL transcripts and parses them to ConversationBlocks
 * to verify the parser works correctly.
 *
 * Run with: npx tsx backend/src/lib/agent-architectures/claude-sdk/tests/test-transcript-parser.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeSDKAdapter } from '../index.js';
import type { ConversationBlock } from '../../../../types/session/blocks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXAMPLE_TRANSCRIPTS_DIR = path.join(__dirname, '..', 'example-transcripts');
const OUTPUT_DIR = path.join(__dirname, 'output');

function countBlocksByType(blocks: ConversationBlock[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    counts[block.type] = (counts[block.type] || 0) + 1;
  }
  return counts;
}

async function main() {
  console.log('=== Claude SDK Transcript Parser Test ===\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Read all .jsonl files from example-transcripts
  const files = fs.readdirSync(EXAMPLE_TRANSCRIPTS_DIR)
    .filter(f => f.endsWith('.jsonl'));

  console.log(`Found ${files.length} transcript files:\n`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log();

  // Separate main transcript from subagent transcripts
  let mainTranscript = '';
  let mainFileName = '';
  const subagents: { id: string; transcript: string }[] = [];

  for (const file of files) {
    const filePath = path.join(EXAMPLE_TRANSCRIPTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    if (file.startsWith('agent-')) {
      // Subagent transcript
      const id = file.replace('.jsonl', '');
      subagents.push({ id, transcript: content });
    } else {
      // Main transcript
      mainTranscript = content;
      mainFileName = file;
    }
  }

  console.log(`Main transcript: ${mainFileName}`);
  console.log(`Subagent transcripts: ${subagents.length}`);
  subagents.forEach(s => console.log(`  - ${s.id}`));
  console.log();

  // Parse transcripts using the static method
  console.log('Parsing transcripts...\n');

  let result: ReturnType<typeof ClaudeSDKAdapter.parseTranscripts>;
  let parseError: Error | null = null;

  try {
    result = ClaudeSDKAdapter.parseTranscripts(mainTranscript, subagents);
  } catch (error) {
    parseError = error as Error;
    console.error('ERROR: Failed to parse transcripts:', parseError.message);
    result = { blocks: [], subagents: [] };
  }

  // Calculate statistics
  const mainBlocksByType = countBlocksByType(result.blocks);
  const allSubagentBlocks = result.subagents.flatMap(s => s.blocks);
  const subagentBlocksByType = countBlocksByType(allSubagentBlocks);

  const stats = {
    mainBlockCount: result.blocks.length,
    subagentCount: result.subagents.length,
    totalSubagentBlocks: allSubagentBlocks.length,
    mainBlocksByType,
    subagentBlocksByType,
    parseError: parseError?.message || null,
  };

  // Log summary
  console.log('=== Results ===\n');
  console.log(`Main transcript blocks: ${stats.mainBlockCount}`);
  console.log('  By type:');
  for (const [type, count] of Object.entries(mainBlocksByType)) {
    console.log(`    ${type}: ${count}`);
  }

  console.log(`\nSubagent transcripts: ${stats.subagentCount}`);
  for (const subagent of result.subagents) {
    console.log(`  ${subagent.id}: ${subagent.blocks.length} blocks`);
  }

  if (stats.totalSubagentBlocks > 0) {
    console.log('\n  All subagent blocks by type:');
    for (const [type, count] of Object.entries(subagentBlocksByType)) {
      console.log(`    ${type}: ${count}`);
    }
  }

  if (parseError) {
    console.log(`\nParse error: ${parseError.message}`);
  } else {
    console.log('\nNo parsing errors detected.');
  }

  // Write output
  const output = {
    blocks: result.blocks,
    subagents: result.subagents,
    stats,
  };

  const outputPath = path.join(OUTPUT_DIR, 'parsed-blocks.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput written to: ${outputPath}`);
}

main().catch(console.error);
