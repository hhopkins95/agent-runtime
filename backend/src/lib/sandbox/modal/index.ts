import { Sandbox } from "modal";
import { SandboxPrimitive, WriteFilesResult, WatchEvent, WatchEventType } from "../base";
import { AgentProfile } from "../../../types/agent-profiles";
import { ModalContext } from "./client";
import { createModalSandbox } from "./create-sandbox";
import { AGENT_ARCHITECTURE_TYPE } from "../../../types/session/index";
import { logger } from "../../../config/logger";


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
     * Promise resolves immediately when watcher process starts.
     * Callback is invoked for each file change event.
     * Cleanup is automatic on terminate().
     */
    async watch(watchPath: string, callback: (event: WatchEvent) => void): Promise<void> {
        // Use chokidar-cli with polling for container compatibility
        // Output format: "event:path" (e.g., "add:/workspace/file.txt")
        const watcherProcess = await this.sandbox.exec([
            'npx', 'chokidar-cli', `${watchPath}/**/*`, '--polling'
        ]);

        logger.info({ watchPath }, 'File watcher started');

        // Start consuming the stream in the background
        (async () => {
            const reader = watcherProcess.stdout.getReader();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += value;

                    // Process complete lines
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        // chokidar-cli format: "event:path"
                        const colonIndex = trimmed.indexOf(':');
                        if (colonIndex === -1) {
                            logger.warn({ line: trimmed }, 'Unexpected watcher output format');
                            continue;
                        }

                        const eventType = trimmed.slice(0, colonIndex) as WatchEventType;
                        const filePath = trimmed.slice(colonIndex + 1);

                        // Validate event type
                        if (!['add', 'change', 'unlink'].includes(eventType)) {
                            logger.debug({ eventType, filePath }, 'Skipping non-file event');
                            continue;
                        }

                        // Convert absolute path to relative path
                        let relativePath = filePath;
                        if (filePath.startsWith(watchPath)) {
                            relativePath = filePath.slice(watchPath.length);
                            if (relativePath.startsWith('/')) {
                                relativePath = relativePath.slice(1);
                            }
                        }

                        logger.info({ eventType, filePath, relativePath, watchPath }, 'File change detected');

                        // Read content for add/change events
                        let content: string | undefined;
                        if (eventType !== 'unlink') {
                            try {
                                content = await this.readFile(filePath) ?? undefined;
                            } catch (err) {
                                logger.warn({ filePath, error: err }, 'Failed to read file content');
                            }
                        }

                        const watchEvent: WatchEvent = {
                            type: eventType,
                            path: relativePath,
                            content,
                        };
                        callback(watchEvent);
                    }
                }
            } catch (error) {
                logger.error({ error, watchPath }, 'Watch stream error');
            }
        })();

        // Resolve immediately - chokidar-cli doesn't emit a ready event
    }

}