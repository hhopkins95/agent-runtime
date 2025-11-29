/**
 * Test script for OpenCode transcript parser
 *
 * Reads example JSON transcripts and parses them to ConversationBlocks
 * to verify the parser works correctly.
 *
 * Run with: npx tsx backend/src/lib/agent-architectures/opencode/tests/test-transcript-parser.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseOpenCodeTranscriptFile, type ParsedTranscript } from '../opencode-transcript-parser.js';
import type { ConversationBlock } from '../../../../types/session/blocks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');
const OUTPUT_DIR = path.join(__dirname, 'output');

function countBlocksByType(blocks: ConversationBlock[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    counts[block.type] = (counts[block.type] || 0) + 1;
  }
  return counts;
}

function countBlocksBySubtype(blocks: ConversationBlock[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    if (block.type === 'system') {
      const key = `system:${block.subtype}`;
      counts[key] = (counts[key] || 0) + 1;
    } else if (block.type === 'tool_use') {
      const key = `tool_use:${block.toolName}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

async function main() {
  console.log('=== OpenCode Transcript Parser Test ===\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Read all .json files from examples directory
  const files = fs.readdirSync(EXAMPLES_DIR)
    .filter(f => f.endsWith('.json'));

  console.log(`Found ${files.length} transcript files:\n`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log();

  // Process each transcript file
  for (const file of files) {
    console.log(`\n--- Processing: ${file} ---\n`);

    const filePath = path.join(EXAMPLES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    let result: ParsedTranscript;
    let parseError: Error | null = null;

    try {
      result = parseOpenCodeTranscriptFile(content);
    } catch (error) {
      parseError = error as Error;
      console.error('ERROR: Failed to parse transcript:', parseError.message);
      result = { blocks: [], subagents: [] };
    }

    // Calculate statistics
    const mainBlocksByType = countBlocksByType(result.blocks);
    const mainBlocksBySubtype = countBlocksBySubtype(result.blocks);
    const allSubagentBlocks = result.subagents.flatMap(s => s.blocks);
    const subagentBlocksByType = countBlocksByType(allSubagentBlocks);

    const stats = {
      mainBlockCount: result.blocks.length,
      subagentCount: result.subagents.length,
      totalSubagentBlocks: allSubagentBlocks.length,
      mainBlocksByType,
      mainBlocksBySubtype,
      subagentBlocksByType,
      parseError: parseError?.message || null,
    };

    // Log summary
    console.log('=== Results ===\n');
    console.log(`Main transcript blocks: ${stats.mainBlockCount}`);
    console.log('  By type:');
    for (const [type, count] of Object.entries(mainBlocksByType).sort()) {
      console.log(`    ${type}: ${count}`);
    }

    if (Object.keys(mainBlocksBySubtype).length > 0) {
      console.log('\n  Detailed breakdown:');
      for (const [key, count] of Object.entries(mainBlocksBySubtype).sort()) {
        console.log(`    ${key}: ${count}`);
      }
    }

    console.log(`\nSubagent transcripts: ${stats.subagentCount}`);
    for (const subagent of result.subagents) {
      const subagentTypes = countBlocksByType(subagent.blocks);
      console.log(`  ${subagent.id}: ${subagent.blocks.length} blocks`);
      for (const [type, count] of Object.entries(subagentTypes).sort()) {
        console.log(`    ${type}: ${count}`);
      }
    }

    if (stats.totalSubagentBlocks > 0) {
      console.log('\n  All subagent blocks by type:');
      for (const [type, count] of Object.entries(subagentBlocksByType).sort()) {
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
      sourceFile: file,
      blocks: result.blocks,
      subagents: result.subagents,
      stats,
    };

    const outputFileName = file.replace('.json', '-parsed.json');
    const outputPath = path.join(OUTPUT_DIR, outputFileName);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nOutput written to: ${outputPath}`);

    // Print first few blocks as sample
    console.log('\n=== Sample Blocks (first 5) ===\n');
    const sampleBlocks = result.blocks.slice(0, 5);
    for (const block of sampleBlocks) {
      console.log(`[${block.type}] id=${block.id}`);
      if (block.type === 'user_message') {
        const content = typeof block.content === 'string'
          ? block.content.substring(0, 100)
          : JSON.stringify(block.content).substring(0, 100);
        console.log(`  content: "${content}${content.length >= 100 ? '...' : ''}"`);
      } else if (block.type === 'assistant_text') {
        console.log(`  content: "${block.content.substring(0, 100)}${block.content.length >= 100 ? '...' : ''}"`);
        if (block.model) console.log(`  model: ${block.model}`);
      } else if (block.type === 'thinking') {
        console.log(`  content: "${block.content.substring(0, 100)}${block.content.length >= 100 ? '...' : ''}"`);
      } else if (block.type === 'tool_use') {
        console.log(`  tool: ${block.toolName}`);
        console.log(`  status: ${block.status}`);
        console.log(`  input: ${JSON.stringify(block.input).substring(0, 100)}...`);
      } else if (block.type === 'tool_result') {
        const output = typeof block.output === 'string'
          ? block.output.substring(0, 100)
          : JSON.stringify(block.output).substring(0, 100);
        console.log(`  output: "${output}${output.length >= 100 ? '...' : ''}"`);
        console.log(`  isError: ${block.isError}`);
      } else if (block.type === 'subagent') {
        console.log(`  subagentId: ${block.subagentId}`);
        console.log(`  name: ${block.name}`);
        console.log(`  status: ${block.status}`);
        console.log(`  input: "${block.input.substring(0, 100)}${block.input.length >= 100 ? '...' : ''}"`);
      } else if (block.type === 'system') {
        console.log(`  subtype: ${block.subtype}`);
        console.log(`  message: ${block.message}`);
      }
      console.log();
    }
  }
}

main().catch(console.error);
