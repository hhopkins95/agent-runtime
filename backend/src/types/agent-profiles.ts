/**
 * Profiles for any given agent type. 
 * 
 * The profiles are determined by all of the configurable options / files that influence agent behaviour for the allowable agent tool runners (Claude Agent SDK, Gemini CLI, etc...)
 */


import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { WorkspaceFile } from "./session/index";

/**
 * Minimal agent profile data meant to be used to show all possible agent profiles before their full data are loaded.
 */
export interface AgentProfileListData { 
    id : string,
    name : string, 
    description? : string,
}


// ============= CLAUDE =================

type ClaudeSkill = {
    /**
     * Name of the skill
     */
    name : string, 
    /**
     * Description of the skill -- Provides context for when the agent should use this skill 
     */
    description : string, 
    /**
     * The main body that describes the skill's behaviour and capabilities
     */
    skillMd : string, 
    /** 
     * Supporting files / scripts for the skill. Include things like templates, examples, helper scripts, etc...
     */
    supportingFiles : {
        relativePath : string, 
        content : string
    }[], 


    /**
     * Extra NPM dependencies needed in the Sandbox to install for the skill. Added to the sandbox's package.json file before the sandbox is created.
     */
    npmDependencies? : string[], 
    /**
     * Extra Pip dependencies needed in the Sandbox to install for the skill. Added to the sandbox's requirements.txt file before the sandbox is created.
     */
    pipDependencies? : string[], 
}

type ClaudeSubagent = { 
    /**
     * Name of the subagent
     */
     name : string, 
     /**
      * Description of the subagent -- This provides context for when the main agent should use this subagent
      */
    description : string, 
    /**
     * The main body that describes the subagent's behaviour and capabilities
     */
    prompt : string, 
    /**
     * The model to use for the subagent -- 'sonnet' | 'opus' | 'haiku' | 'inherit'
     */
    model? : string, 
    /**
     * Allowed tools for the subagent
     */
    tools? : string[], 
}

type AgentCommand = { 
    name : string, 
    prompt : string
}

/**
 * Profile for an agent run using the Claude Agent SDK
 */
export interface AgentProfile extends AgentProfileListData { 
    systemPrompt? : string, 
    agentMDFile? : string,  // The CLAUDE.md file
    skills? : ClaudeSkill[], 
    subagents? : ClaudeSubagent[], 
    commands? : AgentCommand[], 
    tools? : string[], 
    mcp : McpServerConfig[], 
    /**
     * Npm dependencies needed to 
     */
    npmDependencies? : string[], 
    pipDependencies? : string[], 
    environmentVariables? : Record<string, string>, 
    defaultWorkspaceFiles? : WorkspaceFile[], 
}


