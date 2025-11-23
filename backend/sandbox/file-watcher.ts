#!/usr/bin/env tsx
/**
 * File Watcher - Production
 *
 * Watches for file changes in a directory and emits events via stdout as JSONL.
 * Uses chokidar for efficient file system watching with debouncing.
 *
 * Usage:
 *   tsx file-watcher.ts --root <path>
 *
 * Arguments:
 *   --root <path>    - Root directory to watch recursively
 *
 * Event format (JSONL - one JSON object per line):
 * {
 *   path: string,              // relative to root
 *   type: 'created' | 'updated' | 'deleted',
 *   content: string | null,    // file content or null (binary/deleted/>1MB)
 *   timestamp: number
 * }
 *
 * Additional event types: 'ready', 'error'
 */

import chokidar from 'chokidar';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

// Configure commander program
const program = new Command()
  .name('file-watcher')
  .description('Watches a directory for file changes and emits events as JSONL')
  .requiredOption('-r, --root <path>', 'Root directory to watch recursively')
  .parse();

// Extract parsed arguments
const options = program.opts();
const rootPath = path.resolve(options.root);

// Validate root path exists
if (!existsSync(rootPath)) {
  console.error(`Error: Root path does not exist: ${rootPath}`);
  process.exit(1);
}

// Debounce map to prevent event spam
const pending = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 500; // 500ms
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Common binary file extensions
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.ttf', '.otf', '.woff', '.woff2',
  '.bin', '.dat', '.db', '.sqlite',
]);

/**
 * Check if file is likely binary based on extension
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Read file content with size and binary checks
 * Returns null for binary files, files >1MB, or read errors
 */
async function readFileContent(filePath: string): Promise<string | null> {
  try {
    // Check if binary
    if (isBinaryFile(filePath)) {
      return null;
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      return null;
    }

    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    // If read fails, return null
    return null;
  }
}

/**
 * Debounce file change events
 * Ensures rapid changes to the same file only emit one event
 */
async function debounceEvent(type: 'created' | 'updated' | 'deleted', absolutePath: string) {
  const key = `${type}:${absolutePath}`;

  // Clear existing timer if any
  if (pending.has(key)) {
    clearTimeout(pending.get(key)!);
  }

  // Set new timer
  pending.set(
    key,
    setTimeout(async () => {
      pending.delete(key);

      // Read file content (null for deleted files)
      const content = type === 'deleted' ? null : await readFileContent(absolutePath);

      // Make path relative to root
      const relativePath = path.relative(rootPath, absolutePath);

      // Emit event as JSONL
      const event = {
        path: relativePath,
        type,
        content,
        timestamp: Date.now(),
      };

      console.log(JSON.stringify(event));
    }, DEBOUNCE_DELAY)
  );
}

/**
 * Emit error event
 */
function emitError(error: Error) {
  const event = {
    type: 'error',
    message: error.message,
    stack: error.stack,
    timestamp: Date.now(),
  };

  console.error(JSON.stringify(event));
}

// Initialize chokidar watcher
const watcher = chokidar.watch(
  `${rootPath}/**/*`,
  {
    // Don't emit events for files that already exist when watcher starts
    ignoreInitial: true,

    // Wait for file write to finish before emitting event
    awaitWriteFinish: {
      stabilityThreshold: 500, // File must be stable for 500ms
      pollInterval: 100, // Poll every 100ms
    },

    // Ignore patterns
    ignored: [
      /(^|[\/\\])\../, // Ignore dotfiles
      '**/node_modules/**', // Ignore node_modules
      '**/.git/**', // Ignore git
      '**/dist/**', // Ignore build outputs
      '**/build/**', // Ignore build outputs
    ],

    // Performance options
    persistent: true, // Keep process alive
    usePolling: false, // Use native FS events (more efficient)
    depth: undefined, // Watch all subdirectories
  }
);

// Register event handlers
watcher
  .on('add', (filePath) => {
    debounceEvent('created', filePath);
  })
  .on('change', (filePath) => {
    debounceEvent('updated', filePath);
  })
  .on('unlink', (filePath) => {
    debounceEvent('deleted', filePath);
  })
  .on('error', (error) => {
    emitError(error as Error);
  })
  .on('ready', () => {
    // Emit ready event when watcher is fully initialized
    console.log(
      JSON.stringify({
        type: 'ready',
        timestamp: Date.now(),
        watched: rootPath,
      })
    );
  });

// Keep process alive
process.stdin.resume();

// Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
  console.log(
    JSON.stringify({
      type: 'shutdown',
      timestamp: Date.now(),
    })
  );

  watcher.close();
  process.exit(0);
});

// Log to stderr for debugging (won't interfere with stdout JSONL)
console.error('[FILE-WATCHER] Started');
console.error(`[FILE-WATCHER] Watching: ${rootPath}`);
console.error('[FILE-WATCHER] Debounce delay: 500ms');
console.error('[FILE-WATCHER] Max file size: 1MB');
console.error('[FILE-WATCHER] Binary files: content = null');
