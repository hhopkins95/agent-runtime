import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  external: [
    // External dependencies that should not be bundled
    '@anthropic-ai/claude-agent-sdk',
    '@hono/node-server',
    '@google/gemini-cli-core',
    'chokidar',
    'commander',
    'dotenv',
    'hono',
    'modal',
    'pino',
    'pino-pretty',
    'socket.io',
    'zod',
  ],
});
