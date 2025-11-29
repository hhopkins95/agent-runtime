import { Session as OpenCodeSessionTranscript} from "@opencode-ai/sdk"
import { ConversationBlock } from "../../../types/session/blocks";



export function parseOpenCodeTranscriptFile(content: string): {blocks: ConversationBlock[], subagents: {id: string, blocks: ConversationBlock[]}[]} {
    let transcript = JSON.parse(content) as OpenCodeSessionTranscript;

    throw new Error("Not implemented");
}