# Hot Reload Problem in Monorepo

## The Goal

When developing, changes to `backend/src/` should automatically restart the `example/backend` server so the developer sees the updated code.

## Current Architecture

```
agent-service/
├── backend/                    # @hhopkins/agent-runtime (library)
│   ├── src/                    # TypeScript source
│   └── dist/                   # Compiled JS (via tsc)
├── client/                     # @hhopkins/agent-runtime-react (library)
│   ├── src/
│   └── dist/
├── example/
│   ├── backend/                # @example/backend (app) - uses tsx watch
│   │   └── imports from @hhopkins/agent-runtime
│   └── frontend/               # @example/frontend (app) - uses next dev
│       └── imports from @hhopkins/agent-runtime-react
```

## The Import Resolution Chain

1. `example/backend` imports `@hhopkins/agent-runtime`
2. pnpm workspace symlinks: `node_modules/@hhopkins/agent-runtime` → `../../backend`
3. The package.json exports point to `./dist/index.js`
4. So the example backend loads compiled JS from `backend/dist/`

## What We Need

1. Developer changes `backend/src/foo.ts`
2. TypeScript compiles to `backend/dist/foo.js`
3. Example backend server detects the change and restarts
4. Server loads the fresh compiled code

## What We Tried

### Attempt 1: tsx watch --include

```json
// example/backend/package.json
"dev": "tsx watch --include \"../../backend/dist/**\" src/server.ts"
```

**Problem:** The `--include` flag with relative paths going up directories (`../..`) doesn't seem to work reliably. tsx's file watcher (chokidar) has known issues with paths outside the current working directory in monorepos (GitHub issue #221).

### Attempt 2: Turborepo

```json
// turbo.json
{
  "tasks": {
    "dev": {
      "dependsOn": ["^dev"],
      "cache": false
    }
  }
}
```

**Problem:** Turbo's `watch` mode can't have persistent tasks depend on other tasks. Even when we made library `dev` tasks non-persistent (`tsc` instead of `tsc --watch`), there were configuration issues with task dependencies.

## Root Cause Analysis

The fundamental issue is that **the example backend's file watcher doesn't know to watch the upstream package's dist folder**.

- `tsx watch` only watches files that are imported (the dependency graph)
- It sees `@hhopkins/agent-runtime` resolving to `backend/dist/index.js`
- But it doesn't watch for changes to that file because it's in `node_modules` (via symlink)
- tsx/chokidar ignores `node_modules` by default

## Potential Solutions to Explore

### Option A: nodemon with explicit watch paths

Use nodemon instead of tsx watch, configured to watch both the local src and the upstream dist:

```json
"dev": "nodemon --watch src --watch ../../backend/dist --ext js,ts --exec 'tsx src/server.ts'"
```

### Option B: Conditional exports (import source directly)

Make the backend package serve TypeScript source in development:

```json
// backend/package.json
"exports": {
  ".": {
    "development": "./src/index.ts",
    "default": "./dist/index.js"
  }
}
```

Then run tsx with `--conditions=development`. This bypasses the compilation step entirely during dev.

### Option C: Custom watch script

Create a script that uses chokidar directly to watch `backend/dist/**` and sends SIGHUP to the tsx process to trigger restart.

### Option D: Different monorepo tool

Tools like Nx have more sophisticated dependency tracking that might handle this better.

### Option E: Live reload via file touch

Have tsc's post-compile hook touch a file that tsx IS watching:

```json
// backend/package.json
"dev": "tsc --watch && touch ../example/backend/.rebuild-trigger"
```

Then have example/backend watch that trigger file.

## Current State

- `backend/dev`: `tsc` (one-shot compile)
- `client/dev`: `tsc` (one-shot compile)
- `example/backend/dev`: `tsx watch src/server.ts`
- `example/frontend/dev`: `next dev -p 3000`
- Root `dev`: `turbo watch dev`
- Turbo installed but having daemon/configuration issues

## Files Modified During Debugging

- `example/backend/package.json` - dev script
- `example/frontend/next.config.js` - webpack config (may need reverting)
- `backend/package.json` - dev script changed from `tsc --watch` to `tsc`
- `client/package.json` - dev script changed from `tsc --watch` to `tsc`
- `package.json` (root) - dev script, added turbo
- `turbo.json` - created
