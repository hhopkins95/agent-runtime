import { ClaudeSDKAdapter } from "./claude-sdk";
import { GeminiCLIAdapter } from "./gemini-cli";
import { OpenCodeAdapter } from "./opencode";
import { AGENT_ARCHITECTURE_TYPE } from "../../types/session/index";
import { SandboxPrimitive } from "../sandbox/base";

export const getAgentArchitectureAdapter = (architecture : AGENT_ARCHITECTURE_TYPE, sandbox : SandboxPrimitive, sessionId : string) => {
    switch (architecture) {
        case "claude-agent-sdk":
            return new ClaudeSDKAdapter(sandbox, sessionId);
        case "gemini-cli":
            return new GeminiCLIAdapter(sandbox, sessionId);
        case "opencode":
            return new OpenCodeAdapter(sandbox, sessionId);
    }
}


export const getArchitectureParser = (architecture : AGENT_ARCHITECTURE_TYPE) => {
    switch (architecture) {
        case "claude-agent-sdk":
            return ClaudeSDKAdapter.parseTranscripts;
        case "gemini-cli":
            throw new Error("Gemini CLI is not supported yet");
        case "opencode":
            return OpenCodeAdapter.parseTranscripts;
    }
}