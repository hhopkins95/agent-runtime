import {FileDiff, UserMessage, AssistantMessage, Part} from "@opencode-ai/sdk"
import { ConversationBlock } from "../../../types/session/blocks";


/**
 * Exported session type when running `opencode export <sessionId>`
 */
interface OpenCodeSessionTranscript {
    info: {
        id: string
        projectID: string
        directory: string
        parentID?: string
        title: string
        version: string
        time: {
            created: number
            updated: number
            compacting?: number
        }
        summary?: {
            additions: number
            deletions: number
            files: number
            diffs?: FileDiff[]
        }
        share?: { url: string }
        revert?: { messageID: string, partID?: string, snapshot?: string, diff?: string }
    }
    messages: Array<{
        info: UserMessage | AssistantMessage
        parts: Part[]  // TextPart | ToolPart | FilePart | ReasoningPart | etc.
    }>
}

export function parseOpenCodeTranscriptFile(content: string): {blocks: ConversationBlock[], subagents: {id: string, blocks: ConversationBlock[]}[]} {
    let transcript = JSON.parse(content) as OpenCodeSessionTranscript;

    throw new Error("Not implemented");
}