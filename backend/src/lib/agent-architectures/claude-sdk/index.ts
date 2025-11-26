import { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { AgentArchitectureAdapter } from "../base.js";
import { AgentProfile } from "../../../types/agent-profiles.js";
import { StreamEvent } from "../../../types/session/streamEvents.js";
import { SandboxPrimitive } from "../../sandbox/base.js";
import { ConversationBlock } from "../../../types/session/blocks.js";
import { parseClaudeTranscriptFile } from "./claude-transcript-parser.js";
import { sdkMessageToBlocks, extractToolResultBlocks, parseStreamEvent } from "./block-converter.js";
import { logger } from "../../../config/logger.js";
import { streamJSONL } from "../../helpers/stream.js";



export class ClaudeSDKAdapter implements AgentArchitectureAdapter<SDKMessage> {

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

            // Create .claude directory structure
            await this.sandbox.createDirectory(paths.AGENT_PROFILE_DIR);

            // 1. Write CLAUDE.md file (main agent instructions)
            if (profile.agentMDFile) {
                await this.sandbox.writeFile(paths.AGENT_MD_FILE, profile.agentMDFile);
                logger.debug('Wrote CLAUDE.md file');
            }

            // 2. Write subagent definitions
            if (profile.subagents && profile.subagents.length > 0) {
                const agentsDir = `${paths.AGENT_PROFILE_DIR}/agents`;
                await this.sandbox.createDirectory(agentsDir);

                for (const subagent of profile.subagents) {
                    // Create subagent markdown file: .claude/agents/{name}.md
                    const subagentContent = [
                        `# ${subagent.name}`,
                        '',
                        subagent.description || '',
                        '',
                        subagent.prompt,
                    ].join('\n');

                    await this.sandbox.writeFile(
                        `${agentsDir}/${subagent.name}.md`,
                        subagentContent
                    );
                }

                logger.debug({ count: profile.subagents.length }, 'Wrote subagent definitions');
            }

            // 3. Write custom commands
            if (profile.commands && profile.commands.length > 0) {
                const commandsDir = `${paths.AGENT_PROFILE_DIR}/commands`;
                await this.sandbox.createDirectory(commandsDir);

                for (const command of profile.commands) {
                    await this.sandbox.writeFile(
                        `${commandsDir}/${command.name}.md`,
                        command.prompt
                    );
                }

                logger.debug({ count: profile.commands.length }, 'Wrote command definitions');
            }

            // 4. Write skills
            if (profile.skills && profile.skills.length > 0) {
                const skillsDir = `${paths.AGENT_PROFILE_DIR}/skills`;
                await this.sandbox.createDirectory(skillsDir);

                for (const skill of profile.skills) {
                    // Create skill directory: .claude/skills/{skillName}/
                    const skillDir = `${skillsDir}/${skill.name}`;
                    await this.sandbox.createDirectory(skillDir);

                    // Write main skill markdown file
                    const skillContent = [
                        `# ${skill.name}`,
                        '',
                        skill.description || '',
                        '',
                        skill.skillMd,
                    ].join('\n');

                    await this.sandbox.writeFile(
                        `${skillDir}/skill.md`,
                        skillContent
                    );

                    // Write supporting files
                    if (skill.supportingFiles && skill.supportingFiles.length > 0) {
                        for (const file of skill.supportingFiles) {
                            const filePath = `${skillDir}/${file.relativePath}`;
                            // Ensure parent directory exists
                            const lastSlash = filePath.lastIndexOf('/');
                            if (lastSlash > 0) {
                                const parentDir = filePath.substring(0, lastSlash);
                                await this.sandbox.createDirectory(parentDir);
                            }
                            await this.sandbox.writeFile(filePath, file.content);
                        }
                    }
                }

                logger.debug({ count: profile.skills.length }, 'Wrote skill definitions');
            }

            // 5. Write default workspace files
            if (profile.defaultWorkspaceFiles && profile.defaultWorkspaceFiles.length > 0) {
                for (const file of profile.defaultWorkspaceFiles) {
                    const fullPath = `${paths.WORKSPACE_DIR}/${file.path}`;
                    // Ensure parent directory exists
                    const lastSlash = fullPath.lastIndexOf('/');
                    if (lastSlash > 0) {
                        const parentDir = fullPath.substring(0, lastSlash);
                        await this.sandbox.createDirectory(parentDir);
                    }
                    await this.sandbox.writeFile(fullPath, file.content);
                }

                logger.debug({ count: profile.defaultWorkspaceFiles.length }, 'Wrote default workspace files');
            }

            logger.info({ profileId: profile.id }, 'Agent profile setup complete');
        } catch (error) {
            logger.error({ error, profileId: profile.id }, 'Failed to setup agent profile');
            throw error;
        }
    }

    public async setupSessionTranscripts(args: {sessionId: string, mainTranscript: string, subagents: {id: string, transcript: string}[]}): Promise<void> {
        const paths = this.getPaths();

        // Ensure the storage directory exists
        await this.sandbox.createDirectory(paths.AGENT_STORAGE_DIR);


        if (args.mainTranscript) {
        // Write main transcript
        const mainTranscriptPath = `${paths.AGENT_STORAGE_DIR}/${args.sessionId}.jsonl`;
        await this.sandbox.writeFile(mainTranscriptPath, args.mainTranscript);
        }

        // Write subagent transcripts
        for (const subagent of args.subagents) {
            const subagentPath = `${paths.AGENT_STORAGE_DIR}/${subagent.id}.jsonl`;
            await this.sandbox.writeFile(subagentPath, subagent.transcript);
        }
    }

    public async readSessionTranscripts(_args: {}): Promise<{main: string, subagents: {id: string, transcript: string}[]}> {
        const paths = this.getPaths();
        const mainTranscriptPath = `${paths.AGENT_STORAGE_DIR}/${this.sessionId}.jsonl`;

        try {
            // Read main transcript
            const mainContent = await this.sandbox.readFile(mainTranscriptPath);

            // List all files in storage directory (pattern to find agent-*.jsonl)
            const files = await this.sandbox.listFiles(paths.AGENT_STORAGE_DIR, 'agent-*.jsonl');

            // Read all subagent transcripts
            const subagents: {id: string, transcript: string}[] = [];
            for (const file of files) {
                const subagentId = file.replace('.jsonl', '');
                const filePath = `${paths.AGENT_STORAGE_DIR}/${file}`;
                const content = await this.sandbox.readFile(filePath);
                subagents.push({ id: subagentId, transcript: content });
            }

            return {
                main: mainContent,
                subagents,
            };
        } catch (error) {
            // If main transcript doesn't exist yet, return empty
            return {
                main: '',
                subagents: [],
            };
        }
    }

    public async* executeQuery(args: {query: string}): AsyncGenerator<StreamEvent> {
        try {
            logger.info({ sessionId: this.sessionId, queryLength: args.query.length }, 'Starting Claude SDK query execution');

            // Determine if we need to create a new session or resume
            const { main: existingTranscript } = await this.readSessionTranscripts({});
            const needsSessionCreation = !existingTranscript;

            // Build command arguments
            const command = ['tsx', '/app/execute-claude-sdk-query.ts', args.query];

            if (needsSessionCreation) {
                command.push('--session-id', this.sessionId);
                logger.debug({ sessionId: this.sessionId }, 'Creating new session with specific ID');
            } else {
                command.push('--resume', this.sessionId);
                logger.debug({ sessionId: this.sessionId }, 'Resuming existing session');
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

                logger.info(`SDK MESSAGE TYPE: ${sdkMsg?.type}`);

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

            logger.info({ sessionId: this.sessionId, messageCount }, 'Claude SDK query completed');
        } catch (error) {
            logger.error({ error, sessionId: this.sessionId }, 'Error during SDK execution');
            throw error;
        }
    }

    public parseTranscripts(rawTranscript: string, subagents: {id: string, transcript: string}[]): {blocks: ConversationBlock[], subagents: {id: string, blocks: ConversationBlock[]}[]} {
        // Parse main transcript
        const mainMessages = rawTranscript ? parseClaudeTranscriptFile(rawTranscript) : [];
        const mainBlocks = this.convertMessagesToBlocks(mainMessages);

        // Parse subagent transcripts
        const subagentBlocks = subagents.map((subagent) => {
            const messages = subagent.transcript ? parseClaudeTranscriptFile(subagent.transcript) : [];
            const blocks = this.convertMessagesToBlocks(messages);
            return {
                id: subagent.id,
                blocks,
            };
        });

        return {
            blocks: mainBlocks,
            subagents: subagentBlocks,
        };
    }

    /**
     * Convert SDK messages to ConversationBlocks with special handling for tool results
     */
    private convertMessagesToBlocks(messages: SDKMessage[]): ConversationBlock[] {
        const blocks: ConversationBlock[] = [];

        for (const msg of messages) {
            // First check if this is a user message with tool results
            if (msg.type === 'user' && msg.isSynthetic) {
                const toolResults = extractToolResultBlocks(msg);
                blocks.push(...toolResults);
            }

            // Convert the message to blocks
            const convertedBlocks = sdkMessageToBlocks(msg);
            blocks.push(...convertedBlocks);
        }

        return blocks;
    }
   
}
