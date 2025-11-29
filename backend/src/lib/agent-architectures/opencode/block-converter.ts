import { Event} from "@opencode-ai/sdk"
import { logger } from '../../../config/logger.js';
import type {
  ConversationBlock,
  SubagentBlock,
  ToolResultBlock,
  ToolUseBlock
} from '../../../types/session/blocks.js';
import { StreamEvent } from '../../../types/session/streamEvents.js';





// Parse opencode stream events into ConversationBlocks