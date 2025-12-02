import { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { basename } from "path";
import { AgentArchitectureAdapter, WorkspaceFileEvent, TranscriptChangeEvent } from "../base.js";
import { AgentProfile } from "../../../types/agent-profiles.js";
import { WorkspaceFile } from "../../../types/session/index.js";
import { StreamEvent } from "../../../types/session/streamEvents.js";
import { SandboxPrimitive } from "../../sandbox/base.js";
import { ConversationBlock } from "../../../types/session/blocks.js";
import { parseClaudeTranscriptFile } from "./claude-transcript-parser.js";
import { parseStreamEvent, convertMessagesToBlocks } from "./block-converter.js";
import { logger } from "../../../config/logger.js";
import { streamJSONL } from "../../helpers/stream.js";
import { randomUUID } from "crypto";
import { buildMcpJson, McpServerConfig } from "./build-mcp-json.js";



export interface ClaudeSDKSessionOptions {
    model?: string,
}

/**
 * Combined transcript format for Claude SDK.
 * Wraps the main JSONL + all subagent JSONLs into a single JSON blob.
 * This is our abstraction layer - Claude natively uses separate files.
 */
export interface CombinedClaudeTranscript {
    main: string;  // raw JSONL
    subagents: { id: string; transcript: string }[];
}

export class ClaudeSDKAdapter implements AgentArchitectureAdapter<ClaudeSDKSessionOptions> {

    private getPaths() {
        const sandboxPaths = this.sandbox.getBasePaths()
        return {
            TRANSCRIPTS_DIR: sandboxPaths.HOME_DIR + "/.claude/projects/-workspace",
            PROJECT_CLAUDE_DIR: sandboxPaths.WORKSPACE_DIR + "/.claude",
            PROJECT_CLAUDE_MD: sandboxPaths.WORKSPACE_DIR + "/CLAUDE.md",
        }
    }


    private transcriptUpdateCallback? : (event : TranscriptChangeEvent) => void
    private profileTools?: string[]
    private mcpServers?: Record<string, McpServerConfig>

    public static createSessionId(): string { return randomUUID() }

    public constructor(
        private readonly sandbox: SandboxPrimitive,
        private readonly sessionId: string
    ) { }

    public async initializeSession(args: {
        sessionId: string,
        sessionTranscript: string | undefined,
        agentProfile: AgentProfile,
        workspaceFiles: WorkspaceFile[]
    }): Promise<void> {


        logger.info({ sessionId: args.sessionId, profileId: args.agentProfile.id }, 'Initializing session');

        // Store profile tools for later use in executeQuery
        this.profileTools = args.agentProfile.tools;

        // Store MCP config for later use in executeQuery
        if (args.agentProfile.bundledMCPs && args.agentProfile.bundledMCPs.length > 0) {
            const mcpServersPath = this.sandbox.getBasePaths().BUNDLED_MCP_DIR;
            const mcpJSON = buildMcpJson(args.agentProfile, mcpServersPath);
            this.mcpServers = mcpJSON.mcpServers;
        }

        // Ensure directories exist
        await this.sandbox.exec(['mkdir', '-p', this.getPaths().TRANSCRIPTS_DIR]);
        await this.sandbox.exec(['mkdir', '-p', this.getPaths().PROJECT_CLAUDE_DIR]);

        // Collect all files to write in batches
        const filesToWrite: { path: string; content: string }[] = [];

        // --- Transcript files ---
        if (args.sessionTranscript) {
            try {
                const combined: CombinedClaudeTranscript = JSON.parse(args.sessionTranscript);

                // Main transcript
                if (combined.main) {
                    filesToWrite.push({
                        path: `${this.getPaths().TRANSCRIPTS_DIR}/${args.sessionId}.jsonl`,
                        content: combined.main
                    });
                }

                // Subagent transcripts
                for (const subagent of combined.subagents) {
                    filesToWrite.push({
                        path: `${this.getPaths().TRANSCRIPTS_DIR}/agent-${subagent.id}.jsonl`,
                        content: subagent.transcript
                    });
                }
            } catch (error) {
                logger.warn({ error }, 'Failed to parse sessionTranscript as CombinedClaudeTranscript, treating as raw JSONL');
            }
        }

        // --- Agent profile files ---
        const profile = args.agentProfile;

        // CLAUDE.md file (main agent instructions)
        if (profile.agentMDFile) {
            filesToWrite.push({
                path: this.getPaths().PROJECT_CLAUDE_MD,
               content: profile.agentMDFile
            });
        }

        // Subagent definitions
        if (profile.subagents && profile.subagents.length > 0) {
            const agentsDir = `${this.getPaths().PROJECT_CLAUDE_DIR}/agents`;
            for (const subagent of profile.subagents) {
                const subagentContent = [
                    `# ${subagent.name}`,
                    '',
                    subagent.description || '',
                    '',
                    subagent.prompt,
                ].join('\n');

                filesToWrite.push({
                    path: `${agentsDir}/${subagent.name}.md`,
                    content: subagentContent
                });
            }
        }

        // Custom commands
        if (profile.commands && profile.commands.length > 0) {
            const commandsDir = `${this.getPaths().PROJECT_CLAUDE_DIR}/commands`;
            for (const command of profile.commands) {
                filesToWrite.push({
                    path: `${commandsDir}/${command.name}.md`,
                    content: command.prompt
                });
            }
        }

        // Skills
        if (profile.skills && profile.skills.length > 0) {
            const skillsDir = `${this.getPaths().PROJECT_CLAUDE_DIR}/skills`;
            for (const skill of profile.skills) {
                const skillDir = `${skillsDir}/${skill.name}`;

                // Main skill markdown file - requires YAML frontmatter for SDK discovery
                const skillContent = [
                    '---',
                    `name: ${skill.name}`,
                    `description: ${skill.description || ''}`,
                    '---',
                    '',
                    skill.skillMd,
                ].join('\n');

                filesToWrite.push({
                    path: `${skillDir}/SKILL.md`,
                    content: skillContent
                });

                // Supporting files
                if (skill.supportingFiles && skill.supportingFiles.length > 0) {
                    for (const file of skill.supportingFiles) {
                        filesToWrite.push({
                            path: `${skillDir}/${file.relativePath}`,
                            content: file.content
                        });
                    }
                }
            }
        }

        // MCP servers
        if (profile.bundledMCPs && profile.bundledMCPs.length > 0) {
            const mcpServersPath = this.sandbox.getBasePaths().BUNDLED_MCP_DIR
            const mcpJSON = buildMcpJson(profile, mcpServersPath)
            const mcpServersJSONPath = `${this.getPaths().PROJECT_CLAUDE_DIR}/.mcp.json`;

            filesToWrite.push({
                path: mcpServersJSONPath,
                content: JSON.stringify(mcpJSON, null, 2)
            });

        }

        // Write all files in parallel batches
        const writePromises: Promise<any>[] = [];

        if (filesToWrite.length > 0) {
            logger.debug({ fileCount: filesToWrite.length }, 'Writing transcript files');
            writePromises.push(
                this.sandbox.writeFiles(filesToWrite).then(result => {
                    if (result.failed.length > 0) {
                        logger.warn({ failed: result.failed }, 'Some transcript files failed to write');
                    }
                })
            );
        }

        await Promise.all(writePromises);

        logger.info({ sessionId: args.sessionId }, 'Session initialization complete');
    }

    public async readSessionTranscript(): Promise<string | null> {
        const storageDirPath = this.sandbox.getBasePaths().HOME_DIR + "/.claude/projects/-workspace"
        const mainTranscriptPath = `${storageDirPath}/${this.sessionId}.jsonl`;

        try {
            // Read main transcript
            const mainContent = await this.sandbox.readFile(mainTranscriptPath);

            if (!mainContent) {
                return null;
            }

            // List all files in storage directory (pattern to find agent-*.jsonl)
            const files = await this.sandbox.listFiles(storageDirPath, 'agent-*.jsonl');

            // Read all subagent transcripts
            const subagents: { id: string, transcript: string }[] = [];
            for (const file of files) {
                // Extract just the filename (listFiles with find returns full paths)
                const filename = basename(file);
                const subagentId = filename.replace('.jsonl', '');
                const content = await this.sandbox.readFile(file);
                const transcript = content ?? "";

                // Filter out placeholder subagent files at read level
                // Claude Code creates shell files with only 1 JSONL line when CLI starts
                const lines = transcript.trim().split('\n').filter(l => l.trim().length > 0);
                if (lines.length <= 1) {
                    logger.debug({ subagentId, lines: lines.length }, 'Skipping placeholder subagent transcript');
                    continue;
                }

                if (transcript.includes(this.sessionId)) {
                    // make sure the base session id is somewhere in the path -- ensures that this subagent is a subagent of the proper session
                    subagents.push({ id: subagentId, transcript });
                }
            }

            // Combine into our unified format
            const combined: CombinedClaudeTranscript = {
                main: mainContent,
                subagents,
            };

            return JSON.stringify(combined);
        } catch (error) {
            logger.error({ error, sessionId: this.sessionId }, 'Error reading session transcripts');
            // If main transcript doesn't exist yet, return null
            return null;
        }
    }

    public async* executeQuery(args: { query: string, options?: ClaudeSDKSessionOptions }): AsyncGenerator<StreamEvent> {
        try {
            // Build command arguments
            const command = [
                'tsx', '/app/execute-claude-sdk-query.ts',
                args.query,
                '--session-id', this.sessionId,
            ];

            // Pass tools if configured
            if (this.profileTools && this.profileTools.length > 0) {
                command.push('--tools', JSON.stringify(this.profileTools));
            }

            // Pass MCP servers if configured
            if (this.mcpServers && Object.keys(this.mcpServers).length > 0) {
                command.push('--mcp-servers', JSON.stringify(this.mcpServers));
            }

            logger.debug({ command }, 'Executing Claude SDK command');

            // Execute SDK script in sandbox
            const { stdout, stderr } = await this.sandbox.exec(command);

            // Capture stderr in background
            const stderrLines: string[] = [];
            const stderrPromise = (async () => {
                try {
                    for await (const line of streamJSONL<any>(stderr, 'claude-sdk-stderr', logger)) {
                        stderrLines.push(JSON.stringify(line));
                        logger.warn({ sessionId: this.sessionId, stderr: line }, 'Claude SDK stderr');
                    }
                } catch (error) {
                    // Stderr parsing errors are not critical
                    logger.debug({ error }, 'Error parsing stderr (non-critical)');
                }
            })();

            // Stream JSONL messages and convert to StreamEvents
            let messageCount = 0;
            for await (const sdkMsg of streamJSONL<SDKMessage>(stdout, 'claude-sdk', logger)) {
                messageCount++;

                // Check for SDK errors
                if (sdkMsg.type === 'result' && sdkMsg.subtype !== 'success') {
                    logger.error(
                        { sessionId: this.sessionId, subtype: sdkMsg.subtype, isError: sdkMsg.is_error },
                        'Claude SDK execution completed with errors'
                    );
                    throw new Error(`SDK execution failed: ${sdkMsg.subtype}`);
                }

                // Log successful completion
                if (sdkMsg.type === 'result' && sdkMsg.subtype === 'success') {
                    logger.info(
                        {
                            sessionId: this.sessionId,
                            cost: sdkMsg.total_cost_usd,
                            turns: sdkMsg.num_turns,
                        },
                        'Claude SDK execution completed successfully'
                    );
                }

                // Convert SDK message to StreamEvents and yield each one
                const streamEvents = parseStreamEvent(sdkMsg);
                for (const event of streamEvents) {
                    yield event;
                }
            }

            // Wait for stderr reader to complete
            await stderrPromise;

            // Check for failed execution with no output
            if (messageCount === 0 && stderrLines.length > 0) {
                throw new Error(`Claude SDK failed with no output. Stderr: ${stderrLines.join('\n')}`);
            }

            this.sendTranscriptToSession()

            logger.info({ sessionId: this.sessionId, messageCount }, 'Claude SDK query completed');
        } catch (error) {
            logger.error({ error, sessionId: this.sessionId }, 'Error during SDK execution');
            throw error;
        }
    }


    /**
     * Parse a combined transcript (JSON format) into blocks.
     * Static method for use without an adapter instance (e.g., on session load).
     */
    public static parseTranscript(combinedTranscript: string): { blocks: ConversationBlock[], subagents: { id: string, blocks: ConversationBlock[] }[] } {
        if (!combinedTranscript) {
            return { blocks: [], subagents: [] };
        }
        try {
            const combined: CombinedClaudeTranscript = JSON.parse(combinedTranscript);

            const mainBlocks = convertMessagesToBlocks(parseClaudeTranscriptFile(combined.main))
            const subagentBlocks = combined.subagents.map(raw => ({
                id: raw.id,
                blocks: convertMessagesToBlocks(parseClaudeTranscriptFile(raw.transcript))
            })).filter(subagent => subagent.blocks.length > 1) // Filter out the default random subagents that claude creates on startup

            return {
                blocks: mainBlocks,
                subagents: subagentBlocks
            }

        } catch (error) {
            // If parsing fails, try treating it as raw JSONL (backwards compatibility)
            logger.warn({ error }, 'Failed to parse as CombinedClaudeTranscript, falling back to raw JSONL');
            return {
                blocks: [],
                subagents: []
            }
        }
    }


    public async watchWorkspaceFiles(callback: (event: WorkspaceFileEvent) => void): Promise<void> {

        await this.sandbox.watch(this.sandbox.getBasePaths().WORKSPACE_DIR, (event) => {
            callback({
                type: event.type,
                path: event.path,
                content: event.content,
            });
        });
    }

    public async watchSessionTranscriptChanges(callback: (event: TranscriptChangeEvent) => void): Promise<void> {
        this.transcriptUpdateCallback = callback
        // Don't watch every update -- probably will be unneccesary updates. Just store callback and wait until session end on execute query
        // await this.sandbox.watch(paths.AGENT_STORAGE_DIR, async (event) => {
        //     // On any transcript change, read all transcripts and emit combined
        //     try {
        //         const combinedTranscript = await this.readSessionTranscript();
        //         if (combinedTranscript) {
        //             callback({ content: combinedTranscript });
        //         }
        //     } catch (error) {
        //         logger.error({ error }, 'Failed to read combined transcript on file change');
        //     }
        // });
    }

    private async sendTranscriptToSession() { 
        if (this.transcriptUpdateCallback) { 
            const transcript = await this.readSessionTranscript()
            if (!transcript) return 
            this.transcriptUpdateCallback({
                content : transcript
            })
        }
    }


}
