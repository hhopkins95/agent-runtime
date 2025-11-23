import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  external: [
    // React is a peer dependency
    'react',
    // Workspace dependency (will be bundled by consumer)
    '@hhopkins/agent-runtime',
    // External dependencies
    'socket.io-client',
  ],
});
