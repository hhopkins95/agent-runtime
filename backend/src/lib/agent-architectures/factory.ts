import { ClaudeSDKAdapter } from "./claude-sdk";
import { OpenCodeAdapter } from "./opencode";
import { AGENT_ARCHITECTURE_TYPE } from "../../types/session/index";
import { AgentArchitectureAdapter } from "./base";
import { SandboxPrimitive } from "../sandbox/base";
import { ConversationBlock } from "../../types/session/blocks";

export const getAgentArchitectureAdapter = (architecture : AGENT_ARCHITECTURE_TYPE, sandbox : SandboxPrimitive, sessionId : string) : AgentArchitectureAdapter<any> => {
    switch (architecture) {
        case "claude-agent-sdk":
            return new ClaudeSDKAdapter(sandbox, sessionId)
        case "opencode":
            return new OpenCodeAdapter(sandbox, sessionId);
    }
}

/**
 * Parse transcripts using the appropriate architecture's static parser.
 * This allows parsing without a sandbox instance (e.g., on session load).
 *
 * For Claude SDK: expects combined JSON format { main: string, subagents: [...] }
 * For OpenCode: expects native JSON format
 */
export const parseTranscripts = (
    architecture: AGENT_ARCHITECTURE_TYPE,
    rawTranscript: string
): { blocks: ConversationBlock[]; subagents: { id: string; blocks: ConversationBlock[] }[] } => {
    if (!rawTranscript) {
        return { blocks: [], subagents: [] };
    }

    switch (architecture) {
        case "claude-agent-sdk":
            return ClaudeSDKAdapter.parseTranscript(rawTranscript);
        case "opencode":
            return OpenCodeAdapter.parseTranscript(rawTranscript);
    }
}

export const createSessionId = (architecture: AGENT_ARCHITECTURE_TYPE) => {
    switch (architecture) {
        case "claude-agent-sdk":
            return ClaudeSDKAdapter.createSessionId();
        case "opencode":
            return OpenCodeAdapter.createSessionId();
    }
}