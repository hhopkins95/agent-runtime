/**
 * useWorkspaceFiles Hook
 *
 * Access files created or modified by the agent in the session workspace.
 * Provides real-time updates when files are created, modified, or deleted.
 */

import { useContext, useCallback } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { WorkspaceFile } from '../types';

export interface UseWorkspaceFilesResult {
  /**
   * Array of all workspace files
   */
  files: WorkspaceFile[];

  /**
   * Whether session is still loading
   */
  isLoading: boolean;

  /**
   * Get a specific file by path
   */
  getFile: (path: string) => WorkspaceFile | undefined;

  /**
   * Get files matching a path pattern
   */
  getFilesByPattern: (pattern: RegExp) => WorkspaceFile[];

  /**
   * Get files by extension
   */
  getFilesByExtension: (extension: string) => WorkspaceFile[];
}

/**
 * Hook to access workspace files for a session
 *
 * @param sessionId - Required session ID
 */
export function useWorkspaceFiles(sessionId: string): UseWorkspaceFilesResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error(
      'useWorkspaceFiles must be used within AgentServiceProvider'
    );
  }

  const { state } = context;
  const session = state.sessions.get(sessionId);

  const files = session?.files ?? [];
  const isLoading = session?.isLoading ?? true;

  const getFile = useCallback(
    (path: string) => {
      return files.find((file) => file.path === path);
    },
    [files]
  );

  const getFilesByPattern = useCallback(
    (pattern: RegExp) => {
      return files.filter((file) => pattern.test(file.path));
    },
    [files]
  );

  const getFilesByExtension = useCallback(
    (extension: string) => {
      const ext = extension.startsWith('.') ? extension : `.${extension}`;
      return files.filter((file) => file.path.endsWith(ext));
    },
    [files]
  );

  return {
    files,
    isLoading,
    getFile,
    getFilesByPattern,
    getFilesByExtension,
  };
}
