/**
 * Configuration constants for the frontend application
 */

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export const API_KEY = "example-api-key"; // In production, use environment variable

/**
 * Supported agent architectures for session creation
 */
export const SUPPORTED_ARCHITECTURES = [
  { value: 'claude-agent-sdk' as const, label: 'Claude Agent SDK' },
  { value: 'opencode' as const, label: 'OpenCode' },
] as const;

export type SupportedArchitecture = typeof SUPPORTED_ARCHITECTURES[number]['value'];

/**
 * Model options for Claude Agent SDK
 */
export const CLAUDE_MODEL_OPTIONS = [
  { value: 'haiku', label: 'Claude Haiku' },
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'opus', label: 'Claude Opus' },
] as const;

/**
 * Model options for OpenCode Zen
 * See: https://opencode.ai/docs/zen/
 */
export const OPENCODE_MODEL_OPTIONS = [
  // Free models
  { value: 'opencode/big-pickle', label: 'Big Pickle (Free)' },
  { value: 'opencode/grok-code', label: 'Grok Code Fast 1 (Free)' },
  { value: 'opencode/gpt-5-nano', label: 'GPT 5 Nano (Free)' },
  // Anthropic
  { value: 'opencode/claude-opus-4-5', label: 'Claude Opus 4.5' },
  { value: 'opencode/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'opencode/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'opencode/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'opencode/claude-3-5-haiku', label: 'Claude Haiku 3.5' },
  // OpenAI
  { value: 'opencode/gpt-5.1-codex', label: 'GPT 5.1 Codex' },
  { value: 'opencode/gpt-5-codex', label: 'GPT 5 Codex' },
  // Google
  { value: 'opencode/gemini-3-pro', label: 'Gemini 3 Pro' },
  // Other
  { value: 'opencode/kimi-k2', label: 'Kimi K2' },
  { value: 'opencode/qwen3-coder', label: 'Qwen3 Coder 480B' },
  { value: 'opencode/glm-4.6', label: 'GLM 4.6' },
] as const;

/**
 * Get model options for a given architecture
 */
export function getModelOptionsForArchitecture(arch: SupportedArchitecture) {
  return arch === 'claude-agent-sdk' ? CLAUDE_MODEL_OPTIONS : OPENCODE_MODEL_OPTIONS;
}
