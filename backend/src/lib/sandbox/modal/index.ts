import { Sandbox } from "modal";
import * as tar from "tar-stream";
import { SandboxPrimitive, WriteFilesResult, WatchEvent, WatchEventType } from "../base";
import { AgentProfile } from "../../../types/agent-profiles";
import { ModalContext } from "./client";
import { createModalSandbox } from "./create-sandbox";
import { AGENT_ARCHITECTURE_TYPE } from "../../../types/session/index";
import { logger } from "../../../config/logger";
import { copyLocalFilesToSandbox } from "../../helpers/copy-local-files-to-sandbox";
import path from "path";


export class ModalSandbox implements SandboxPrimitive {

    private readonly sandbox: Sandbox;


    static async create(agentProfile: AgentProfile, modalContext: ModalContext, agentArchitecture: AGENT_ARCHITECTURE_TYPE): Promise<ModalSandbox> {

        const sandbox = await createModalSandbox(modalContext, agentProfile);

        const sandboxPrimitive = new ModalSandbox(sandbox);

        // copy the app dir to the sandbox
        await copyLocalFilesToSandbox({
            localDirPath: path.join(__dirname, "../../../../sandbox"),
            targetSandboxDirPath: sandboxPrimitive.getBasePaths().APP_DIR,
            sandbox: sandboxPrimitive,
        });

        return sandboxPrimitive;

    }

    private constructor(sandbox: Sandbox) {
        this.sandbox = sandbox;
    }

    public getId(): string {
        return this.sandbox.sandboxId;
        
    }

    public getBasePaths(): { APP_DIR: string, WORKSPACE_DIR: string, HOME_DIR: string , BUNDLED_MCP_DIR: string } {
        return {
            APP_DIR: "/app",
            WORKSPACE_DIR: "/workspace",
            HOME_DIR: "/root", 
            BUNDLED_MCP_DIR: "/mcps"
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
    async exec(command: string[], options?: { cwd?: string }) {
        return await this.sandbox.exec(command, {
            workdir: options?.cwd,
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
     * Creates a tar archive and extracts it via stdin to avoid multiple round-trips.
     */
    async writeFiles(files: { path: string; content: string | undefined }[]): Promise<WriteFilesResult> {
        if (files.length === 0) {
            return { success: [], failed: [] };
        }

        // Create tar archive in memory
        const pack = tar.pack();

        for (const file of files) {
            if (file.content !== undefined) {
                // Strip leading slash for tar (paths should be relative)
                const tarPath = file.path.replace(/^\//, '');
                pack.entry({ name: tarPath }, file.content);
            }
        }
        pack.finalize();

        // Collect tar data into a buffer
        const chunks: Uint8Array[] = [];
        for await (const chunk of pack) {
            chunks.push(chunk);
        }
        const tarData = Buffer.concat(chunks);

        // Extract via stdin to root
        const process = await this.sandbox.exec(['tar', '-xf', '-', '-C', '/']);
        await process.stdin.writeBytes(tarData);
        await process.stdin.close();

        const exitCode = await process.wait();

        if (exitCode !== 0) {
            const stderr = await process.stderr.readText();
            return {
                success: [],
                failed: files.map(f => ({ path: f.path, error: stderr || 'tar extraction failed' }))
            };
        }

        return {
            success: files.map(f => ({ path: f.path })),
            failed: []
        };
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
    async watch(watchPath: string, callback: (event: WatchEvent) => void, opts?: { ignorePatterns?: string[] }): Promise<void> {


        let args = ['npx', 'chokidar-cli', `${watchPath}/**/*`, '--polling'];
        if (opts?.ignorePatterns) {
            for (const pattern of opts.ignorePatterns) {
                args.push('-i', `"${pattern}"`);
            }
        }

        // Use chokidar-cli with polling for container compatibility
        // Output format: "event:path" (e.g., "add:/workspace/file.txt")
        const watcherProcess = await this.sandbox.exec(args);

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