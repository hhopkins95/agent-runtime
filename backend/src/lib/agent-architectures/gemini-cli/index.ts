import { MessageRecord as GeminiMessageRecord } from "@google/gemini-cli-core";
import { AgentArchitectureAdapter } from "../base";
import { SandboxPrimitive } from "../../sandbox/base";
import { AgentProfile } from "../../../types/agent-profiles";
import { ConversationBlock } from "../../../types/session/blocks";
import { StreamEvent } from "../../../types/session/streamEvents";
import { Sandbox } from "modal";


export class GeminiCLIAdapter implements AgentArchitectureAdapter<GeminiMessageRecord> {

    public constructor(private readonly sandbox : SandboxPrimitive, sessionId : string) { }

    public getPaths(): {
        AGENT_STORAGE_DIR: string,
        WORKSPACE_DIR: string,
        AGENT_PROFILE_DIR: string,
        AGENT_MD_FILE: string,
    } {
        throw new Error("Not implemented");
    }

    public identifySessionTranscriptFile(args: {fileName: string, content: string}): {isMain: true} | {subagentId: string} | null{
        throw new Error("Not implemented");
    }

    public async setupAgentProfile(args: {agentProfile: AgentProfile}): Promise<void> {
        throw new Error("Not implemented");
    }

    public async setupSessionTranscripts(args: {sessionId: string, mainTranscript: string, subagents: {id: string, transcript: string}[]}): Promise<void> {
        throw new Error("Not implemented");
    }

    public executeQuery(args: {query: string}): AsyncGenerator<StreamEvent> {
        throw new Error("Not implemented");
    }

    public parseTranscripts(rawTranscript: string, subagents: {id: string, transcript: string}[]): {blocks: ConversationBlock[], subagents: {id: string, blocks: ConversationBlock[]}[]} {
        throw new Error("Not implemented");
    }

    public parseStreamEvent(event: GeminiMessageRecord): StreamEvent {
        throw new Error("Not implemented");
    }

    public readSessionTranscripts(args: {}): Promise<{main: string, subagents: {id: string, transcript: string}[]}> {
        throw new Error("Not implemented");
    }


//  private async* executeGeminiQuery(
//     prompt: string,
//   ): AsyncGenerator<GeminiMessageRecord> {
//     try {
//       logger.info({
//         sessionId: this.sessionId,
//         promptLength: prompt.length
//       }, 'Starting Gemini CLI query execution...');


//       if (this.needsSessionTranscriptCreation) { 
//         const fileName = new Date().toISOString().replace(/[:.]/g, '-') + '-' + "aaaaaaaa" + '.json';
//         // Need to manually create a session transcript file with the proper session id
//         await this.sandbox.writeFile(`${this.getSandboxPaths().AGENT_STORAGE_DIR}/${fileName}`, `
//           {
//             "sessionId": "${this.sessionId}",
//             "projectHash : "${GEMINI_PROJECT_HASH}",
//             "startTime": "${new Date().toISOString()}",
//             "lastUpdated": "${new Date().toISOString()}",
//             "messages": []
//           }
//         `);
//       }


//       // Build command arguments using Commander format
//       // Gemini always requires --resume flag with session ID
//       const args = [
//         'npx',
//         'tsx',
//         '/app/execute-gemini-query.ts',
//         prompt,
//         '--resume',
//         this.sessionId
//       ];

//       logger.debug({ args }, 'Executing Gemini CLI command');

//       // Execute Gemini CLI script in sandbox
//       const process = await this.sandbox.exec(args);

//       // Capture stderr in real-time (parallel to stdout processing)
//       const stderrLines: string[] = [];

//       // Start stderr reader in background using streamLines helper
//       const stderrPromise = (async () => {
//         for await (const line of this.streamLines(process.stderr)) {
//           stderrLines.push(line);
//           logger.warn({ sessionId: this.sessionId, stderr: line }, 'Gemini CLI stderr');
//         }
//       })();

//       // Stream JSONL messages using typed helper
//       let messageCount = 0;
//       for await (const msg of this.streamJSONL<GeminiMessageRecord>(process.stdout, 'gemini-cli')) {
//         messageCount++;
//         yield msg;
//       }

//       // Wait for both process and stderr reader to complete
//       const exitCode = await process.wait();
//       await stderrPromise; // Ensure all stderr is captured

//       if (exitCode !== 0) {
//         logger.error(
//           {
//             sessionId: this.sessionId,
//             exitCode,
//             command: args.join(' '),
//             stderrLineCount: stderrLines.length,
//             stderr: stderrLines.join('\n'),
//             messageCount,
//           },
//           'Gemini CLI process exited with error'
//         );

//         throw new Error(
//           `Gemini CLI process failed with exit code ${exitCode}\n` +
//           `Command: ${args.join(' ')}\n` +
//           `Stderr (${stderrLines.length} lines):\n${stderrLines.join('\n')}`
//         );
//       }

//       logger.info({ sessionId: this.sessionId, messageCount }, 'Gemini CLI query completed successfully');
//     } catch (error) {
//       logger.error({ error, sessionId: this.sessionId }, 'Unexpected error during Gemini CLI execution');
//       throw error;
//     }
//   }



}