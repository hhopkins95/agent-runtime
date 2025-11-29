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
