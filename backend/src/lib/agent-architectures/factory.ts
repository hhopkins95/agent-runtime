import { ClaudeSDKAdapter } from "./claude-sdk";
import { GeminiCLIAdapter } from "./gemini-cli";
import { OpenCodeAdapter } from "./opencode";
import { AGENT_ARCHITECTURE_TYPE } from "../../types/session/index";
import { AgentArchitectureAdapter } from "./base";
import { SandboxPrimitive } from "../sandbox/base";
import { ConversationBlock } from "../../types/session/blocks";

export const getAgentArchitectureAdapter = (architecture : AGENT_ARCHITECTURE_TYPE, sandbox : SandboxPrimitive, sessionId : string) : AgentArchitectureAdapter<any> => {
    switch (architecture) {
        case "claude-agent-sdk":
            return new ClaudeSDKAdapter(sandbox, sessionId) 
        case "gemini-cli":
            return new GeminiCLIAdapter(sandbox, sessionId);
        case "opencode":
            return new OpenCodeAdapter(sandbox, sessionId);
    }
}

/**
 * Parse transcripts using the appropriate architecture's static parser
 * This allows parsing without a sandbox instance (e.g., on session load)
 */
export const parseTranscripts = (
    architecture: AGENT_ARCHITECTURE_TYPE,
    rawTranscript: string,
    subagents: { id: string; transcript: string }[]
): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } => {
    switch (architecture) {
        case "claude-agent-sdk":
            return ClaudeSDKAdapter.parseTranscripts(rawTranscript, subagents);
        case "gemini-cli":
            throw new Error("Gemini CLI parsing is not supported yet");
        case "opencode":
            return OpenCodeAdapter.parseTranscripts(rawTranscript, subagents);
    }
}

export const createSessionId = (architecture: AGENT_ARCHITECTURE_TYPE) => {
    switch (architecture) {
        case "claude-agent-sdk":
            return ClaudeSDKAdapter.createSessionId();
        case "gemini-cli":
            throw new Error("Gemini CLI session id creation is not supported yet");
        case "opencode":
            return OpenCodeAdapter.createSessionId();
    }
}