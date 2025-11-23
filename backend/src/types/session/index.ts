import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { MessageRecord as GeminiMessageRecord } from "@google/gemini-cli-core"
import { ConversationBlock } from "./blocks";



export type AGENT_ARCHITECTURE_TYPE = "claude-agent-sdk" | "gemini-cli"
export type SessionStatus = "pending" | "active" | "inactive" | "completed" | "failed" | 'building-sandbox'



/**
 * A file in the workspace during the session
 */
export type WorkspaceFile = {
    path: string,
    content: string
}

/**
 * Minimal session data meant to be used to show all possible sessions before their full data are loaded.
 */
export interface SessionListData {
    /**
     * The id that comes from the agent app (ie Claude Agent SDK, Gemini CLI, etc...) -- not the id from external app that is using this server
     */
    sessionId: string,
    type: AGENT_ARCHITECTURE_TYPE,
    agentProfileReference: string, // The id / name of the agent profile this session is using
    name?: string,
    status: SessionStatus,
    lastActivity?: number,
    createdAt?: number,
    metadata?: Record<string, unknown>,
}

/**
 * The format for session data that is saved / loaded via the persistence adapter layer
 */
export interface SavedSessionData extends SessionListData {
    /**
     * Stringified raw transcript blob from the agent application. Either the jsonl file for claude-agent-sdk or the json file for gemini-cli.
     */
    rawTranscript?: string,
    /**
     * Stringified raw transcript blob for each subagent. Either the jsonl file for claude-agent-sdk or the json file for gemini-cli.
     */
    subagents?: {
        id: string,
        rawTranscript?: string,
    }[],

    /**
     * The workspace files used / created during the session.
     */
    workspaceFiles: WorkspaceFile[]
}


export interface RuntimeSessionData extends SavedSessionData {
    blocks : ConversationBlock[], 
    subagents : {
        id : string, 
        rawTranscript?: string,
        blocks : ConversationBlock[], 
    }[]
}

