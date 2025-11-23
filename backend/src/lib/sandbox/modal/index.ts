import { Sandbox } from "modal";
import { SandboxPrimitive } from "../base";
import { AgentProfile } from "../../../types/agent-profiles";
import { ModalContext } from "./client";
import { createModalSandbox } from "./create-sandbox";
import { AGENT_ARCHITECTURE_TYPE } from "../../../types/session/index";


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

        const lsResult = await this.sandbox.exec(command);
        const exitCode = await lsResult.wait();

        if (exitCode !== 0) {
            return []; // Directory might not exist or be empty
        }

        const stdout = await lsResult.stdout.readText();
        return stdout.trim().split('\n').filter(Boolean);
    }



}