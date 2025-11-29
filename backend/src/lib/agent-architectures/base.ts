import { Sandbox } from "modal";
import { AgentProfile } from "../../types/agent-profiles";
import { ConversationBlock } from "../../types/session/blocks";
import { StreamEvent } from "../../types/session/streamEvents";

/**
 * Event emitted when a workspace file changes
 */
export interface WorkspaceFileEvent {
    type: 'add' | 'change' | 'unlink';
    path: string;
    content?: string;
}

/**
 * Event emitted when a transcript changes
 */
export type TranscriptChangeEvent =
    | { type: 'main'; content: string }
    | { type: 'subagent'; subagentId: string; content: string };

/**
 * Base interface that defines how a particular agent architecture manages session files / transformations
 * 
 * Generic Types : 
 * 
 * - NativeStreamEventType : The type of the native stream event emitted by the agent architecture. ie 'SDKMessage' 
 */
export interface AgentArchitectureAdapter<ArchitectureSessionOptions extends Record<string, any> = {}>{ 

    getPaths : () => {
        AGENT_STORAGE_DIR : string, 
        WORKSPACE_DIR : string, 
        AGENT_PROFILE_DIR : string,
        AGENT_MD_FILE : string,
    }

    identifySessionTranscriptFile : (args : {fileName : string, content : string}) => {isMain : true} | {subagentId : string} | null

    setupAgentProfile : (args : {agentProfile : AgentProfile}) => Promise<void>,

    setupSessionTranscripts : (args : {sessionId : string, mainTranscript : string, subagents : {id : string, transcript : string}[]}) => Promise<void>,

    readSessionTranscripts : (args : {}) => Promise<{main : string | null, subagents : {id : string, transcript : string}[]}>,

    executeQuery : (args : {query : string, options? : ArchitectureSessionOptions}) => AsyncGenerator<StreamEvent>,

    parseTranscripts : (rawTranscript : string, subagents : {id : string, transcript : string}[]) => {blocks : ConversationBlock[], subagents : {id : string, blocks : ConversationBlock[]}[]}

    watchWorkspaceFiles: (callback: (event: WorkspaceFileEvent) => void) => Promise<void>;

    watchSessionTranscriptChanges: (callback: (event: TranscriptChangeEvent) => void) => Promise<void>;

}


export interface AgentArchitectureStaticMethods {
    /**
     * Parse raw transcript / session json into our conversation blocks
     * 
     * @param rawTranscript 
     * @param subagents 
     * @returns 
     */
    parseTranscripts : (rawTranscript : string, subagents : {id : string, transcript : string}[]) => {blocks : ConversationBlock[], subagents : {id : string, blocks : ConversationBlock[]}[]}


    /**
     * Create a new session id with the proper formatting for this architecture
     * 
     * @returns A new session id
     */
    createSessionId : () => string
}



// export the actual session options 
import { ClaudeSDKSessionOptions } from "./claude-sdk/index";
import { OpenCodeSessionOptions } from "./opencode/index";
export type AgentArchitectureSessionOptions = ClaudeSDKSessionOptions | OpenCodeSessionOptions;
export type { ClaudeSDKSessionOptions, OpenCodeSessionOptions };