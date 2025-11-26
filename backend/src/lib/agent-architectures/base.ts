import { Sandbox } from "modal";
import { AgentProfile } from "../../types/agent-profiles";
import { ConversationBlock } from "../../types/session/blocks";
import { StreamEvent } from "../../types/session/streamEvents";

/**
 * Base interface that defines how a particular agent architecture manages session files / transformations
 * 
 * Generic Types : 
 * 
 * - NativeStreamEventType : The type of the native stream event emitted by the agent architecture. ie 'SDKMessage' 
 */
export interface AgentArchitectureAdapter<NativeStreamEventType = any> { 

    getPaths : () => {
        AGENT_STORAGE_DIR : string, 
        WORKSPACE_DIR : string, 
        AGENT_PROFILE_DIR : string,
        AGENT_MD_FILE : string,
    }

    identifySessionTranscriptFile : (args : {fileName : string, content : string}) => {isMain : true} | {subagentId : string} | null

    setupAgentProfile : (args : {agentProfile : AgentProfile}) => Promise<void>,

    setupSessionTranscripts : (args : {sessionId : string, mainTranscript : string, subagents : {id : string, transcript : string}[]}) => Promise<void>,

    readSessionTranscripts : (args : {}) => Promise<{main : string, subagents : {id : string, transcript : string}[]}>,

    executeQuery : (args : {query : string}) => AsyncGenerator<StreamEvent>,

    /**
     * Parses the raw transcript strings into a list of conversation blocks.
     * 
     * The transcripts are an array of both the main agent and subagent transcripts.
     * 
     * The adapter is responsible for determining which is which.
     * 
     * @param rawTranscripts  - Stringified raw transcript blob from the agent application. Either the jsonl file for claude-agent-sdk or the json file for gemini-cli.
     * @returns 
     */
    parseTranscripts : (rawTranscript : string, subagents : {id : string, transcript : string}[]) => {blocks : ConversationBlock[], subagents : {id : string, blocks : ConversationBlock[]}[]}, 


}