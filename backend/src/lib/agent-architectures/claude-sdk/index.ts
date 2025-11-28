import { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { basename } from "path";
import { AgentArchitectureAdapter } from "../base.js";
import { AgentProfile } from "../../../types/agent-profiles.js";
import { StreamEvent } from "../../../types/session/streamEvents.js";
import { SandboxPrimitive } from "../../sandbox/base.js";
import { ConversationBlock } from "../../../types/session/blocks.js";
import { parseClaudeTranscriptFile } from "./claude-transcript-parser.js";
import { sdkMessageToBlocks, extractToolResultBlocks, parseStreamEvent, convertMessagesToBlocks } from "./block-converter.js";
import { logger } from "../../../config/logger.js";
import { streamJSONL } from "../../helpers/stream.js";



export class ClaudeSDKAdapter implements AgentArchitectureAdapter<SDKMessage> {
    // private needsSessionCreation : boolean 


    public constructor(
        private readonly sandbox: SandboxPrimitive,
        private readonly sessionId: string
    ) { }

    
    public getPaths() : {
        AGENT_STORAGE_DIR : string, 
        WORKSPACE_DIR : string, 
        AGENT_PROFILE_DIR : string,
        AGENT_MD_FILE : string,
    } {
        return {
            AGENT_STORAGE_DIR : `/root/.claude/projects/-workspace`,
            WORKSPACE_DIR : `/workspace`,
            AGENT_PROFILE_DIR : `/workspace/.claude`,
            AGENT_MD_FILE : `/workspace/CLAUDE.md`,
        }
    }

    public identifySessionTranscriptFile(args: {fileName: string, content: string}): {isMain: true} | {subagentId: string} | null {
        // Claude SDK transcript files:
        // - Main session: {sessionId}.jsonl
        // - Subagents: agent-{uuid}.jsonl

        // Only handle .jsonl files
        if (!args.fileName.endsWith('.jsonl')) {
            return null;
        }

        // Check if it's a subagent file
        if (args.fileName.startsWith('agent-')) {
            const subagentId = args.fileName.replace('.jsonl', '');
            return { subagentId };
        }

        // Otherwise, it's a main transcript file
        return { isMain: true };
    }

    public async setupAgentProfile(args: {agentProfile: AgentProfile}): Promise<void> {
        const paths = this.getPaths();
        const profile = args.agentProfile;

        try {
            logger.info({ profileId: profile.id }, 'Setting up agent profile');

            // Collect all files to write in a single batch
            const filesToWrite: { path: string; content: string }[] = [];

            // 1. CLAUDE.md file (main agent instructions)
            if (profile.agentMDFile) {
                filesToWrite.push({
                    path: paths.AGENT_MD_FILE,
                    content: profile.agentMDFile
                });
            }

            // 2. Subagent definitions
            if (profile.subagents && profile.subagents.length > 0) {
                const agentsDir = `${paths.AGENT_PROFILE_DIR}/agents`;
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

            // 3. Custom commands
            if (profile.commands && profile.commands.length > 0) {
                const commandsDir = `${paths.AGENT_PROFILE_DIR}/commands`;
                for (const command of profile.commands) {
                    filesToWrite.push({
                        path: `${commandsDir}/${command.name}.md`,
                        content: command.prompt
                    });
                }
            }

            // 4. Skills
            if (profile.skills && profile.skills.length > 0) {
                const skillsDir = `${paths.AGENT_PROFILE_DIR}/skills`;
                for (const skill of profile.skills) {
                    const skillDir = `${skillsDir}/${skill.name}`;

                    // Main skill markdown file
                    const skillContent = [
                        `# ${skill.name}`,
                        '',
                        skill.description || '',
                        '',
                        skill.skillMd,
                    ].join('\n');

                    filesToWrite.push({
                        path: `${skillDir}/skill.md`,
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

            // Write all files in a single batch operation
            // Note: defaultWorkspaceFiles are handled separately by setupWorkspaceFiles()
            if (filesToWrite.length > 0) {
                logger.debug({ fileCount: filesToWrite.length }, 'Writing agent profile files in batch');
                const result = await this.sandbox.writeFiles(filesToWrite);

                if (result.failed.length > 0) {
                    logger.warn({
                        failed: result.failed,
                        succeeded: result.success.length
                    }, 'Some agent profile files failed to write');
                }

                logger.debug({
                    succeeded: result.success.length,
                    failed: result.failed.length
                }, 'Batch file write complete');
            }

            logger.info({ profileId: profile.id }, 'Agent profile setup complete');
        } catch (error) {
            logger.error({ error, profileId: profile.id }, 'Failed to setup agent profile');
            throw error;
        }
    }

    public async setupSessionTranscripts(args: {sessionId: string, mainTranscript: string, subagents: {id: string, transcript: string}[]}): Promise<void> {
        const paths = this.getPaths();

        // Ensure the transcript directory exists (Claude creates it lazily, but we need it for the watcher)
        await this.sandbox.exec(['mkdir', '-p', paths.AGENT_STORAGE_DIR]);

        // Collect all transcript files to write in a single batch
        const filesToWrite: { path: string; content: string }[] = [];

        // Main transcript
        if (args.mainTranscript) {
            filesToWrite.push({
                path: `${paths.AGENT_STORAGE_DIR}/${args.sessionId}.jsonl`,
                content: args.mainTranscript
            });
        }

        // Subagent transcripts
        for (const subagent of args.subagents) {
            filesToWrite.push({
                path: `${paths.AGENT_STORAGE_DIR}/${subagent.id}.jsonl`,
                content: subagent.transcript
            });
        }

        // Write all transcripts in a single batch operation
        if (filesToWrite.length > 0) {
            const result = await this.sandbox.writeFiles(filesToWrite);

            if (result.failed.length > 0) {
                logger.warn({
                    failed: result.failed,
                    succeeded: result.success.length
                }, 'Some transcript files failed to write');
            }
        }
    }

    public async readSessionTranscripts(_args: {}): Promise<{main: string | null, subagents: {id: string, transcript: string}[]}> {
        const paths = this.getPaths();
        const mainTranscriptPath = `${paths.AGENT_STORAGE_DIR}/${this.sessionId}.jsonl`;

        try {
            // Read main transcript
            const mainContent = await this.sandbox.readFile(mainTranscriptPath);

            if (!mainContent) {
                return {
                    main: null,
                    subagents: [],
                };
            }

            // List all files in storage directory (pattern to find agent-*.jsonl)
            const files = await this.sandbox.listFiles(paths.AGENT_STORAGE_DIR, 'agent-*.jsonl');

            // Read all subagent transcripts
            const subagents: {id: string, transcript: string}[] = [];
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

                subagents.push({ id: subagentId, transcript });
            }

            return {
                main: mainContent,
                subagents,
            };
        } catch (error) {
            logger.error({ error, sessionId: this.sessionId }, 'Error reading session transcripts');
            // If main transcript doesn't exist yet, return empty
            return {
                main: '',
                subagents: [],
            };
        }
    }

    public async* executeQuery(args: {query: string}): AsyncGenerator<StreamEvent> {
        try {
            let time = Date.now();



            // Build command arguments
            const command = ['tsx', '/app/execute-claude-sdk-query.ts', args.query, '--session-id', this.sessionId];

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

            logger.info({ sessionId: this.sessionId, messageCount }, 'Claude SDK query completed');
        } catch (error) {
            logger.error({ error, sessionId: this.sessionId }, 'Error during SDK execution');
            throw error;
        }
    }

    public static parseTranscripts(rawTranscript: string, subagents: {id: string, transcript: string}[]): {blocks: ConversationBlock[], subagents: {id: string, blocks: ConversationBlock[]}[]} {
        // Parse main transcript
        const mainMessages = rawTranscript ? parseClaudeTranscriptFile(rawTranscript) : [];
        const mainBlocks = convertMessagesToBlocks(mainMessages);

        // Parse subagent transcripts
        const subagentBlocks = subagents.map((subagent) => {
            const messages = subagent.transcript ? parseClaudeTranscriptFile(subagent.transcript) : [];
            const blocks = convertMessagesToBlocks(messages);
            return {
                id: subagent.id,
                blocks,
            };
        });

        // Filter out placeholder subagent files (Claude Code creates shell files with only 1 block
        // when the CLI starts, before any real work is done)
        const filteredSubagents = subagentBlocks.filter((subagent) => subagent.blocks.length > 1);

        return {
            blocks: mainBlocks,
            subagents: filteredSubagents,
        };
    }

    public parseTranscripts(rawTranscript: string, subagents: {id: string, transcript: string}[]): {blocks: ConversationBlock[], subagents: {id: string, blocks: ConversationBlock[]}[]} {
        return ClaudeSDKAdapter.parseTranscripts(rawTranscript, subagents);
    }

   
}
