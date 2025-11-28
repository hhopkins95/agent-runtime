import { Sandbox } from "modal";
import { SandboxPrimitive, WriteFilesResult, WatchEvent, WatchEventType } from "../base";
import { AgentProfile } from "../../../types/agent-profiles";
import { ModalContext } from "./client";
import { createModalSandbox } from "./create-sandbox";
import { AGENT_ARCHITECTURE_TYPE } from "../../../types/session/index";

/**
 * Internal event format from file-watcher.ts
 */
interface FileWatcherEvent {
    path: string;
    type: WatchEventType | 'ready' | 'error';
    content: string | null;
    timestamp: number;
    message?: string;
    stack?: string;
    watched?: string;
}


export class ModalSandbox implements SandboxPrimitive {

    private readonly sandbox: Sandbox;


    static async create(agentProfile: AgentProfile, modalContext: ModalContext, agentArchitecture: AGENT_ARCHITECTURE_TYPE): Promise<ModalSandbox> {

        const sandbox = await createModalSandbox(modalContext, agentProfile);

        return new ModalSandbox(sandbox);

    }

    private constructor(sandbox: Sandbox) {
        this.sandbox = sandbox;
    }

    public getId(): string {
        return this.sandbox.sandboxId;
    }

    public getBasePaths(): { APP_DIR: string, WORKSPACE_DIR: string, HOME_DIR: string } {
        return {
            APP_DIR: "/app",
            WORKSPACE_DIR: "/workspace",
            HOME_DIR: "/root"
        };
    }

    /**
     * Check if sandbox is running
     */
    async isRunning(): Promise<boolean> {
        const exitCode = await this.sandbox.poll();
        return exitCode === null;
    }

    /**
     * Poll the sandbox to check if it's still running
     * @returns null if running, exit code (number) if exited
     */
    async poll(): Promise<number | null> {
        return await this.sandbox.poll();
    }

    /**
     * Terminate the sandbox
     */
    async terminate(): Promise<void> {
        await this.sandbox.terminate();
    }

    /**
     * Execute a command in the sandbox
     * Returns the same process type as Modal's sandbox.exec()
     */
    async exec(command: string[], workdir: string = '/app') {
        return await this.sandbox.exec(command, {
            workdir: workdir,
        });
    }

    /**
     * Read a file from the sandbox
     */
    async readFile(path: string): Promise<string | null> {
        const file = await this.sandbox.open(path, 'r');
        try {
            const content = await file.read();
            if (content.length === 0) {
                return null;
            }
            return new TextDecoder().decode(content) ?? null;
        } finally {
            await file.close();
        }   
    }

    /**
     * Write a file to the sandbox
     */
    async writeFile(path: string, content: string): Promise<void> {
        // make sure the directory exists
        const directory = path.split('/').slice(0, -1).join('/');
        await this.createDirectory(directory);


        const file = await this.sandbox.open(path, 'w');
        try {
            await file.write(new TextEncoder().encode(content));
        } finally {
            await file.close();
        }
    }

    /**
     * Write multiple files in a single operation (bulk write for efficiency).
     * Uses a sandbox script to write all files locally, avoiding multiple round-trips.
     */
    async writeFiles(files: { path: string; content: string }[]): Promise<WriteFilesResult> {
        if (files.length === 0) {
            return { success: [], failed: [] };
        }

        // Encode the files as base64 JSON to pass as argument
        const payload = JSON.stringify({ files });
        const base64Payload = Buffer.from(payload).toString('base64');

        const result = await this.sandbox.exec(['tsx', '/app/bulk-write-files.ts', base64Payload]);
        const exitCode = await result.wait();

        const stdout = await result.stdout.readText();
        const stderr = await result.stderr.readText();

        if (exitCode !== 0 && !stdout) {
            // Complete failure - script couldn't run
            return {
                success: [],
                failed: files.map(f => ({ path: f.path, error: stderr || 'Unknown error' }))
            };
        }

        try {
            const output: WriteFilesResult = JSON.parse(stdout);
            return output;
        } catch {
            // Couldn't parse output
            return {
                success: [],
                failed: files.map(f => ({ path: f.path, error: `Failed to parse script output: ${stdout}` }))
            };
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

        const lsResult = await this.sandbox.exec(command);
        const exitCode = await lsResult.wait();

        if (exitCode !== 0) {
            return []; // Directory might not exist or be empty
        }

        const stdout = await lsResult.stdout.readText();
        return stdout.trim().split('\n').filter(Boolean);
    }

    /**
     * Watch a directory for file changes.
     * Promise resolves when watcher is ready.
     * Callback is invoked for each file change event.
     * Cleanup is automatic on terminate().
     */
    async watch(path: string, callback: (event: WatchEvent) => void): Promise<void> {
        const watcherProcess = await this.sandbox.exec([
            'tsx', '/app/file-watcher.ts', '--root', path
        ]);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Watcher timeout - no ready event received for path: ${path}`));
            }, 30000);

            // Start consuming the stream in the background
            // Modal streams yield strings directly (not binary)
            (async () => {
                const reader = watcherProcess.stdout.getReader();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Modal streams yield strings directly
                        buffer += value;

                        // Process complete lines
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // Keep incomplete line in buffer

                        for (const line of lines) {
                            if (!line.trim()) continue;

                            try {
                                const event: FileWatcherEvent = JSON.parse(line);

                                if (event.type === 'ready') {
                                    clearTimeout(timeout);
                                    resolve();
                                    continue;
                                }

                                if (event.type === 'error') {
                                    console.error(`[watch] Error from watcher: ${event.message}`);
                                    continue;
                                }

                                // Convert to WatchEvent and invoke callback
                                const watchEvent: WatchEvent = {
                                    type: event.type as WatchEventType,
                                    path: event.path,
                                    content: event.content ?? undefined,
                                };
                                callback(watchEvent);
                            } catch (parseError) {
                                console.error(`[watch] Failed to parse event: ${line}`);
                            }
                        }
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    console.error(`[watch] Stream error:`, error);
                }
            })();
        });
    }

}