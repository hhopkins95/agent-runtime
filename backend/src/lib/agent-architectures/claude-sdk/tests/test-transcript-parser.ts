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
import { ClaudeSDKAdapter, CombinedClaudeTranscript } from '../index.js';
import type { ConversationBlock } from '../../../../types/session/blocks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXAMPLE_TRANSCRIPTS_DIR = path.join(__dirname, '..', 'example-transcripts');

const EXAMPLE_MAIN_TRANSCRIPT = fs.readFileSync(path.join(EXAMPLE_TRANSCRIPTS_DIR, 'c06ae941-1674-4e9c-b2a1-ab54bb020454.jsonl'), 'utf-8');
const EXAMPLE_SUBAGENT_TRANSCRIPT = fs.readFileSync(path.join(EXAMPLE_TRANSCRIPTS_DIR, 'agent-40dad41d.jsonl'), 'utf-8');

const OUTPUT_DIR = path.join(__dirname, 'output');


const exampleCombined : CombinedClaudeTranscript = {
  main : EXAMPLE_MAIN_TRANSCRIPT,
  subagents : [
    {
      id : '40dad41d', 
      transcript : EXAMPLE_SUBAGENT_TRANSCRIPT,
    }
  ]
}




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

  let result : ReturnType<typeof ClaudeSDKAdapter.parseTranscript>;

  try {
    result = ClaudeSDKAdapter.parseTranscript(JSON.stringify(exampleCombined));
  } catch (error) {
    console.error('ERROR: Failed to parse transcripts:', error);
    throw error 
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
