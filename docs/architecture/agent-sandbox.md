# AgentSandbox Architecture

**Version:** 2.0
**Last Updated:** 2025-01-17
**Status:** Implementation Ready
**Related:** [Design Doc](../DESIGN.md), [Event Bus Pattern](./event-bus-pattern.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Motivation](#motivation)
3. [Architecture](#architecture)
4. [Design Principles](#design-principles)
5. [Component Details](#component-details)
6. [Health Monitoring](#health-monitoring)
7. [File Watcher](#file-watcher)
8. [API Reference](#api-reference)
9. [Implementation Plan](#implementation-plan)

---

## Overview

`AgentSandbox` is a unified wrapper around Modal's Sandbox that consolidates all sandbox-related operations into a single cohesive interface. It replaces the previous architecture where `AgentSession`, `SessionFileManager`, and `AgentSDKService` all directly called Modal Sandbox APIs.

### Key Changes

| Before | After |
|--------|-------|
| 3 classes calling Modal Sandbox | 1 AgentSandbox wrapper |
| Scattered sandbox knowledge | Centralized in AgentSandbox |
| AgentSession creates sandbox | AgentSandbox factory pattern |
| No health monitoring | Built-in sandbox health checks |
| Manual file watcher setup | Typed event stream API |
| Duplicated file operations | Single implementation |

---

## Motivation

### Problems with Previous Architecture

**1. Scattered Sandbox Logic**
```typescript
// Before: Sandbox operations scattered across 3 classes

// In AgentSession
const result = await this.sandbox.exec(['find', '/root/.claude/projects/...']);

// In SessionFileManager
const file = await sandbox.open(path, 'w');
await file.write(content);
await file.close();

// In AgentSDKService
const process = await sandbox.exec(['npx', 'tsx', '/app/execute-sdk-query.ts']);
```

**2. Leaky Abstraction**
- AgentSession knows about sandbox file paths (`/root/.claude/projects`)
- AgentSession knows about command-line tools (`find`, `npx`, `tsx`)
- AgentSession parses command output (JSONL, file listings)

**3. No Sandbox Recovery**
- If sandbox crashes or times out, session is lost
- No health monitoring or automatic recovery
- Sessions become orphaned on sandbox failure

**4. Code Duplication**
- File read/write patterns repeated
- Process execution boilerplate duplicated
- Error handling inconsistent

### Goals

✅ **Single Responsibility**: AgentSandbox owns all sandbox operations
✅ **Abstraction**: Hide Modal-specific details from domain logic
✅ **Resilience**: Built-in health monitoring and recovery
✅ **Type Safety**: Typed event streams, not raw JSONL parsing
✅ **Testability**: Easy to mock for testing

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   AgentSession                           │
│              (Orchestration Layer)                       │
│                                                           │
│  Responsibilities:                                        │
│  • Session lifecycle management                          │
│  • Message flow coordination                             │
│  • Event emission (via EventBus)                         │
│  • In-memory state (transcripts, files)                  │
│  • Sandbox health monitoring                             │
│  • Sandbox recovery on failure                           │
│                                                           │
│  Does NOT know about:                                    │
│  ❌ Sandbox file paths                                   │
│  ❌ Command-line tools                                   │
│  ❌ Modal Sandbox API                                    │
└──────────────────────┬──────────────────────────────────┘
                       │ owns
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   AgentSandbox                           │
│              (Infrastructure Layer)                      │
│                                                           │
│  Responsibilities:                                        │
│  • Wrap Modal Sandbox instance                           │
│  • File operations (read/write/list)                     │
│  • Process execution (exec, streaming)                   │
│  • SDK query execution                                   │
│  • File watcher event streaming                          │
│  • File system setup/restoration                         │
│  • Health check primitives                               │
│                                                           │
│  Knows about:                                            │
│  ✅ Modal Sandbox API                                    │
│  ✅ Sandbox file paths                                   │
│  ✅ Command-line tools                                   │
│  ✅ JSONL parsing                                        │
└──────────────────────┬──────────────────────────────────┘
                       │ wraps
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Modal Sandbox                           │
│                 (3rd Party API)                          │
│                                                           │
│  • exec()                                                │
│  • open() / read() / write()                             │
│  • terminate()                                           │
│  • poll()                                                │
└─────────────────────────────────────────────────────────┘
```

### Responsibility Split

#### AgentSandbox (Infrastructure)

**"How do I interact with the sandbox?"**

- File operations: `readFile()`, `writeFile()`, `createDirectory()`, `listFiles()`
- Process execution: `exec()`, `executeSDKQuery()`
- File system setup: `setupNewSession()`, `setupResumeSession()`, `readAllFiles()`
- Event streaming: `streamFileEvents()` (async generator)
- Health checks: `poll()`, `isRunning()`
- Lifecycle: Factory pattern (`AgentSandbox.create()`), `terminate()`

**Knowledge:**
- Sandbox file paths (`/workspace`, `/root/.claude/projects`)
- Command-line tools (`npx`, `find`, `ls`, `mkdir`)
- JSONL parsing for SDK messages
- File watcher protocol

#### AgentSession (Orchestration)

**"What do I do with this session?"**

- Session lifecycle: Create, destroy, idle timeout
- Message coordination: Send user messages, stream responses
- Event emission: Emit domain events via EventBus
- State management: In-memory transcripts, files, metadata
- Sync scheduling: Periodic sync to persistence
- **Health monitoring**: Monitor sandbox health, trigger recovery
- **Recovery logic**: Recreate sandbox and restore state on failure

**Knowledge:**
- Business logic (when to sync, what to emit)
- Session state structure
- Event types
- Sandbox health policy (when to recover)

---

## Design Principles

### 1. Factory Pattern for Initialization

**Problem:** AgentSession shouldn't know about Modal SDK

**Solution:** AgentSandbox owns sandbox creation

```typescript
// Before: Session knows about Modal SDK
const modalSandbox = await createModalSandbox(modalContext, {...});
this.sandbox = new AgentSandbox(modalSandbox);

// After: Clean abstraction
this.sandbox = await AgentSandbox.create(modalContext, {
  workdir: '/workspace',
  timeout: 900,
  sandboxConfig: this.adapters.sandboxConfig,
});
```

**Benefits:**
- AgentSession doesn't import Modal SDK types
- AgentSandbox encapsulates full initialization
- Easier to mock for testing
- Clear API boundary

### 2. Event Streams Over Raw Process Handling

**Problem:** AgentSession manually parses JSONL from processes

**Solution:** AgentSandbox provides typed event streams

```typescript
// Before: Manual process management + parsing
this.watcherProcess = await this.sandbox.exec(['npx', 'tsx', '/app/file-watcher.ts']);
const reader = this.watcherProcess.stdout.getReader();
// ... complex JSONL parsing logic

// After: Typed event stream
for await (const event of this.sandbox.streamFileEvents()) {
  await this.handleFileChangeEvent(event); // Typed!
}
```

**Benefits:**
- Infrastructure (process + parsing) separated from domain logic
- Type-safe events
- Easier to test
- Clear separation of concerns

### 3. Health Monitoring at Orchestration Layer

**Problem:** No way to detect or recover from sandbox failures

**Solution:** AgentSession monitors health using `sandbox.poll()`

```typescript
class AgentSession {
  private async startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      const exitCode = await this.sandbox.poll();
      if (exitCode !== null) {
        // Sandbox died! Attempt recovery
        await this.recoverSandbox();
      }
    }, 30000);
  }

  private async recoverSandbox() {
    // 1. Create new sandbox
    // 2. Restore session state
    // 3. Resume operations
  }
}
```

**Benefits:**
- Automatic failure detection
- Graceful recovery with state restoration
- Sessions survive sandbox crashes
- Better user experience

---

## Component Details

### AgentSandbox Class

#### Factory Method

```typescript
class AgentSandbox {
  private constructor(private sandbox: Sandbox) {
    logger.info({ sandboxId: this.getSandboxId() }, 'AgentSandbox initialized');
  }

  /**
   * Create and initialize a new AgentSandbox
   *
   * @param modalContext - Modal client context
   * @param options - Sandbox configuration
   * @returns Initialized AgentSandbox instance
   */
  static async create(
    modalContext: ModalContext,
    options: {
      workdir: string;
      timeout: number;
      sandboxConfig: SandboxConfigProvider;
    }
  ): Promise<AgentSandbox> {
    const modalSandbox = await createModalSandbox(modalContext, {
      workdir: options.workdir,
      timeout: options.timeout,
    });

    return new AgentSandbox(modalSandbox);
  }
}
```

#### Infrastructure Primitives

```typescript
class AgentSandbox {
  /**
   * Execute a command in the sandbox
   * Returns the same process type as Modal's sandbox.exec()
   */
  async exec(command: string[]) {
    return await this.sandbox.exec(command);
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(path: string): Promise<string> {
    const file = await this.sandbox.open(path, 'r');
    try {
      const content = await file.read();
      return new TextDecoder().decode(content);
    } finally {
      await file.close();
    }
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(path: string, content: string): Promise<void> {
    const file = await this.sandbox.open(path, 'w');
    try {
      await file.write(new TextEncoder().encode(content));
    } finally {
      await file.close();
    }
  }

  /**
   * Create a directory in the sandbox
   */
  async createDirectory(path: string): Promise<void> {
    const mkdirResult = await this.sandbox.exec(['mkdir', '-p', path]);
    const exitCode = await mkdirResult.wait();

    if (exitCode !== 0) {
      const stderr = await mkdirResult.stderr.readText();
      throw new Error(`Failed to create directory ${path}: ${stderr}`);
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    const command = pattern
      ? ['find', directory, '-name', pattern]
      : ['ls', '-1', directory];

    const result = await this.sandbox.exec(command);
    const exitCode = await result.wait();

    if (exitCode !== 0) {
      return []; // Directory doesn't exist or is empty
    }

    const stdout = await result.stdout.readText();
    return stdout.trim().split('\n').filter(Boolean);
  }
}
```

#### SDK Operations

```typescript
class AgentSandbox {
  /**
   * Execute a Claude SDK query and stream messages
   *
   * @param prompt - User's message
   * @param sdkSessionId - SDK session ID (undefined for first message)
   * @returns AsyncGenerator of SDK messages
   */
  async *executeSDKQuery(
    prompt: string,
    sdkSessionId?: string
  ): AsyncGenerator<SDKMessage> {
    const args = ['npx', 'tsx', '/app/execute-sdk-query.ts', prompt];
    if (sdkSessionId) {
      args.push('--resume', sdkSessionId);
    }

    const process = await this.sandbox.exec(args);
    const reader = process.stdout.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg: SDKMessage = JSON.parse(line);

            // Check for SDK errors
            if (msg.type === 'result' && msg.subtype !== 'success') {
              throw new SDKExecutionError(`SDK execution failed: ${msg.subtype}`);
            }

            yield msg;
          } catch (parseError) {
            if (parseError instanceof SDKExecutionError) throw parseError;
            logger.warn({ line }, 'Non-JSONL SDK output');
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const exitCode = await process.wait();
    if (exitCode !== 0) {
      throw new SDKExecutionError(`SDK process failed with exit code ${exitCode}`);
    }
  }

  /**
   * Discover SDK session ID after first message
   *
   * @returns The discovered SDK session ID, or undefined if not found
   */
  async discoverSdkSessionId(): Promise<string | undefined> {
    const projectPath = '/root/.claude/projects/workspace';
    const files = await this.listFiles(projectPath, '*.jsonl');

    if (files.length === 0) {
      return undefined;
    }

    // Extract session ID from filename (remove .jsonl extension)
    const sessionId = files[0].replace('.jsonl', '');
    logger.info({ sessionId, projectPath }, 'Discovered SDK session ID');

    return sessionId;
  }
}
```

#### File System Setup

```typescript
class AgentSandbox {
  /**
   * Set up filesystem for a new session
   */
  async setupNewSession(config: SessionFileConfig): Promise<void> {
    const { sessionId, metadata } = config;
    const agentType = (metadata?.agentType as string) || 'default';

    logger.info({ sessionId, agentType }, 'Setting up new session filesystem...');

    // 1. Setup Claude internal directories
    await this.setupClaudeInternals(config);

    // 2. Setup agent configuration
    await this.setupAgentConfig(config);

    // 3. Setup working directory
    await this.setupWorkingDirectory(config);

    logger.info({ sessionId }, 'Session filesystem setup complete');
  }

  /**
   * Set up filesystem for resuming a session
   */
  async setupResumeSession(
    config: SessionFileConfig,
    sessionFiles: SessionFile[] = []
  ): Promise<void> {
    const { sessionId } = config;

    logger.info({ sessionId, fileCount: sessionFiles.length }, 'Setting up resume session...');

    // 1. Setup Claude internal directories and restore transcripts
    await this.setupClaudeInternals(config);
    await this.restoreSessionState(config, sessionFiles);

    // 2. Setup agent configuration
    await this.setupAgentConfig(config);

    // 3. Restore working directory files
    await this.restoreWorkingDirectoryFiles(sessionFiles);

    logger.info({ sessionId }, 'Resume session setup complete');
  }

  /**
   * Read all files from sandbox for sync
   */
  async readAllFiles(
    sessionId: string,
    projectName: string = 'workspace'
  ): Promise<{
    transcripts: Array<{ path: string; content: string }>;
    files: Array<{ path: string; content: string }>;
  }> {
    const transcripts = [];
    const files = [];

    // Read transcript files
    const projectPath = `/root/.claude/projects/${projectName}`;
    const transcriptFilenames = await this.listFiles(projectPath, '*.jsonl');

    for (const filename of transcriptFilenames) {
      const path = `${projectPath}/${filename}`;
      const content = await this.readFile(path);
      transcripts.push({ path, content });
    }

    // Read workspace files (excluding .claude/)
    const workspaceFiles = await this.listFiles('/workspace');
    for (const path of workspaceFiles) {
      if (!path.includes('/.claude/')) {
        const content = await this.readFile(path);
        const relativePath = path.replace('/workspace/', '');
        files.push({ path: relativePath, content });
      }
    }

    return { transcripts, files };
  }
}
```

---

## Health Monitoring

### Modal `poll()` API

Modal's Sandbox provides a `poll()` method for health checks:

```typescript
interface Sandbox {
  /**
   * Check if the Sandbox has finished running.
   * Returns null if the Sandbox is still running, else returns the exit code.
   */
  poll(): Promise<number | null>;
}
```

### AgentSandbox Health Methods

```typescript
class AgentSandbox {
  /**
   * Poll sandbox health
   * @returns null if running, exit code if terminated
   */
  async poll(): Promise<number | null> {
    return await this.sandbox.poll();
  }

  /**
   * Check if sandbox is healthy (running)
   */
  async isRunning(): Promise<boolean> {
    const exitCode = await this.poll();
    return exitCode === null;
  }
}
```

### AgentSession Health Monitoring

```typescript
class AgentSession {
  private healthCheckInterval?: NodeJS.Timeout;

  /**
   * Start monitoring sandbox health
   * Checks every 30 seconds if sandbox is still alive
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const exitCode = await this.sandbox.poll();

        if (exitCode !== null) {
          logger.error(
            { sessionId: this.sessionId, exitCode },
            'Sandbox terminated unexpectedly'
          );

          this.emitSandboxStatus('unhealthy');
          await this.handleSandboxFailure(exitCode);
        }
      } catch (error) {
        logger.error({ error, sessionId: this.sessionId }, 'Health check failed');
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Handle sandbox failure - attempt recovery or destroy session
   */
  private async handleSandboxFailure(exitCode: number): Promise<void> {
    logger.warn(
      { sessionId: this.sessionId, exitCode },
      'Attempting sandbox recovery...'
    );

    try {
      await this.recoverSandbox();
      logger.info({ sessionId: this.sessionId }, 'Sandbox recovered successfully');
    } catch (error) {
      logger.error(
        { error, sessionId: this.sessionId },
        'Sandbox recovery failed - destroying session'
      );

      // Recovery failed - destroy session
      this.metadata.status = 'failed';
      this.emitSessionStatus('inactive');
      await this.destroy();
    }
  }

  /**
   * Recreate sandbox and restore session state
   */
  private async recoverSandbox(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Recreating sandbox...');

    // 1. Create new sandbox
    this.sandbox = await AgentSandbox.create(this.modalContext, {
      workdir: '/workspace',
      timeout: 900,
      sandboxConfig: this.adapters.sandboxConfig,
    });
    this.sandboxId = this.sandbox.getSandboxId();

    // 2. Restore session state from persistence
    await this.restoreSessionStateToSandbox();

    // 3. Restart file watcher
    await this.startFileWatcher();

    // 4. Emit healthy status
    this.emitSandboxStatus('healthy');

    logger.info(
      { sessionId: this.sessionId, newSandboxId: this.sandboxId },
      'Sandbox recovered successfully'
    );
  }

  /**
   * Restore session state to sandbox (transcripts + files)
   */
  private async restoreSessionStateToSandbox(): Promise<void> {
    // Fetch transcripts and files from storage
    const transcriptMetadata = await this.adapters.persistence.listTranscripts(this.sessionId);
    const sessionFiles = await this.adapters.persistence.listFiles(this.sessionId);

    const transcriptFiles = [];
    for (const transcript of transcriptMetadata) {
      const content = await this.adapters.persistence.downloadTranscript(transcript.url);
      const filename = transcript.subagentId
        ? `${transcript.subagentId}.jsonl`
        : `${this.sessionId}.jsonl`;

      transcriptFiles.push({
        path: `~/.claude/projects/workspace/${filename}`,
        content,
      });
    }

    // Restore to sandbox
    await this.sandbox.setupResumeSession(
      {
        sessionId: this.sessionId,
        metadata: this.metadata.metadata,
      },
      [...transcriptFiles, ...sessionFiles]
    );
  }
}
```

**Health Check Flow:**

```
┌──────────────┐     Every 30s     ┌──────────────┐
│ AgentSession │ ───────────────→ │ sandbox.poll()│
│              │                    │              │
│ Health Check │ ←─────────────── │ null (alive) │
└──────┬───────┘                    │ or exit code │
       │                             └──────────────┘
       │ if exitCode !== null
       ▼
┌──────────────────┐
│ handleFailure()  │
│                  │
│ 1. Log error     │
│ 2. Emit unhealthy│
│ 3. Try recovery  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ recoverSandbox() │
│                  │
│ 1. Create new    │
│ 2. Restore state │
│ 3. Resume ops    │
└──────┬───────────┘
       │
       ├─ Success → emit healthy
       └─ Failure → destroy session
```

---

## File Watcher

### Event Stream API

The file watcher runs as a background process in the sandbox and emits file change events. Instead of AgentSession managing the process and parsing JSONL, AgentSandbox provides a typed event stream.

```typescript
/**
 * File change event from watcher
 */
interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted' | 'ready' | 'error' | 'shutdown';
  path?: string;
  timestamp: number;
  error?: string;
  [key: string]: any;
}

class AgentSandbox {
  /**
   * Stream file change events from sandbox file watcher
   *
   * Starts the file watcher process and yields typed events.
   * Infrastructure (process management + JSONL parsing) is handled here.
   *
   * @returns AsyncGenerator of file change events
   *
   * @example
   * for await (const event of sandbox.streamFileEvents()) {
   *   if (event.type === 'modified') {
   *     console.log(`File changed: ${event.path}`);
   *   }
   * }
   */
  async *streamFileEvents(): AsyncGenerator<FileChangeEvent> {
    logger.info({ sandboxId: this.getSandboxId() }, 'Starting file watcher...');

    // Start file watcher process
    const process = await this.sandbox.exec(['npx', 'tsx', '/app/file-watcher.ts']);
    const reader = process.stdout.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          logger.warn({ sandboxId: this.getSandboxId() }, 'File watcher process ended');
          break;
        }

        // Accumulate in buffer
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        // Parse and yield events
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event: FileChangeEvent = JSON.parse(line);
            yield event;
          } catch (error) {
            logger.warn({ line, error }, 'Failed to parse file watcher event');
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

### AgentSession Usage

```typescript
class AgentSession {
  private watcherTask?: Promise<void>;

  /**
   * Start file watcher and process events
   */
  private async startFileWatcher(): Promise<void> {
    if (!this.sandbox) {
      logger.warn({ sessionId: this.sessionId }, 'Cannot start watcher: no sandbox');
      return;
    }

    logger.info({ sessionId: this.sessionId }, 'Starting file watcher...');

    // Start consuming events in background
    this.watcherTask = (async () => {
      try {
        for await (const event of this.sandbox.streamFileEvents()) {
          await this.handleFileChangeEvent(event);
        }
      } catch (error) {
        logger.error({ error, sessionId: this.sessionId }, 'File watcher crashed');
        // TODO: Restart watcher on crash?
      }
    })();

    logger.info({ sessionId: this.sessionId }, 'File watcher started');
  }

  /**
   * Stop file watcher
   */
  private async stopFileWatcher(): Promise<void> {
    if (this.watcherTask) {
      // Watcher will stop when sandbox terminates
      this.watcherTask = undefined;
      logger.info({ sessionId: this.sessionId }, 'File watcher stopped');
    }
  }

  /**
   * Handle file change event from watcher
   */
  private async handleFileChangeEvent(event: FileChangeEvent): Promise<void> {
    if (event.type === 'ready' || event.type === 'shutdown') {
      logger.info({ sessionId: this.sessionId, type: event.type }, 'Watcher status');
      return;
    }

    if (event.type === 'error') {
      logger.error({ sessionId: this.sessionId, error: event.error }, 'Watcher error');
      return;
    }

    if (!event.path) return;

    logger.debug({ sessionId: this.sessionId, event }, 'File change detected');

    // Determine if transcript or workspace file
    if (event.path.includes('.jsonl') && event.path.includes('/.claude/projects/')) {
      await this.handleTranscriptChange(event.type, event.path);
    } else if (event.path.startsWith('/workspace/')) {
      await this.handleWorkspaceFileChange(event.type, event.path);
    }
  }
}
```

**Benefits:**
- ✅ Infrastructure in AgentSandbox (process + parsing)
- ✅ Business logic in AgentSession (event handling)
- ✅ Type-safe events
- ✅ Easier to test
- ✅ Clear separation

---

## API Reference

### AgentSandbox

#### Factory

```typescript
static async create(
  modalContext: ModalContext,
  options: {
    workdir: string;
    timeout: number;
    sandboxConfig: SandboxConfigProvider;
  }
): Promise<AgentSandbox>
```

#### Infrastructure Primitives

```typescript
getSandboxId(): string
isHealthy(): boolean
async terminate(): Promise<void>
async exec(command: string[]): Promise<ModalProcess>
async readFile(path: string): Promise<string>
async writeFile(path: string, content: string): Promise<void>
async createDirectory(path: string): Promise<void>
async listFiles(directory: string, pattern?: string): Promise<string[]>
```

#### Health Monitoring

```typescript
async poll(): Promise<number | null>
async isRunning(): Promise<boolean>
```

#### SDK Operations

```typescript
async *executeSDKQuery(
  prompt: string,
  sdkSessionId?: string
): AsyncGenerator<SDKMessage>

async discoverSdkSessionId(): Promise<string | undefined>
```

#### File System Setup

```typescript
async setupNewSession(config: SessionFileConfig): Promise<void>
async setupResumeSession(
  config: SessionFileConfig,
  sessionFiles: SessionFile[]
): Promise<void>
async readAllFiles(
  sessionId: string,
  projectName?: string
): Promise<{ transcripts: ..., files: ... }>
```

#### Event Streaming

```typescript
async *streamFileEvents(): AsyncGenerator<FileChangeEvent>
```

### AgentSession Health Methods

```typescript
private startHealthMonitoring(): void
private stopHealthMonitoring(): void
private async handleSandboxFailure(exitCode: number): Promise<void>
private async recoverSandbox(): Promise<void>
private async restoreSessionStateToSandbox(): Promise<void>
```

---

## Implementation Plan

### Phase 1: Create AgentSandbox Class

**Time: 2-3 hours**

1. Create `src/adapters/modal/agent-sandbox.ts`
2. Implement factory pattern (`static create()`)
3. Implement infrastructure primitives
4. Move SDK execution from AgentSDKService
5. Move file system setup from SessionFileManager
6. Implement `streamFileEvents()` async generator
7. Add health check methods (`poll()`, `isRunning()`)

### Phase 2: Update AgentSession

**Time: 2-3 hours**

1. Update AgentSession to use `AgentSandbox.create()`
2. Replace all `fileManager.*` calls with `sandbox.*`
3. Replace all `sdkService.*` calls with `sandbox.*`
4. Replace direct `sandbox.exec()` calls with `sandbox` methods
5. Update file watcher to use `streamFileEvents()`
6. Add health monitoring (`startHealthMonitoring()`)
7. Add recovery logic (`recoverSandbox()`)

### Phase 3: Cleanup

**Time: 30 minutes**

1. Delete `src/services/file-manager.ts`
2. Delete `src/services/agent-sdk.ts`
3. Update type exports
4. Remove obsolete imports

### Phase 4: Testing

**Time: 1-2 hours**

1. Unit tests for AgentSandbox
2. Integration tests for health monitoring
3. Test sandbox recovery flow
4. Test file watcher event stream
5. Verify no regressions

**Total Time: 6-9 hours**

---

## Summary

The AgentSandbox refactoring consolidates all sandbox operations into a single, well-defined wrapper. This improves:

✅ **Separation of Concerns**: Infrastructure vs orchestration
✅ **Testability**: Easy to mock sandbox
✅ **Resilience**: Automatic health monitoring and recovery
✅ **Type Safety**: Typed event streams
✅ **Maintainability**: Single source of truth for sandbox operations

By implementing this architecture, sessions become resilient to sandbox failures and the codebase becomes cleaner and more maintainable.
