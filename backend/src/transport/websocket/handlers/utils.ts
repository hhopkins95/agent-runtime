/**
 * WebSocket Handler Utilities
 *
 * Shared utilities for WebSocket event handlers
 */

/**
 * Extract error message from unknown error object
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Internal server error';
}
