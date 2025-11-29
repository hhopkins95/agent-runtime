"use client";

import { useState } from "react";
import { useWorkspaceFiles } from "@hhopkins/agent-runtime-react";

interface FileWorkspaceProps {
  sessionId: string;
}

/**
 * File workspace viewer component
 *
 * Demonstrates:
 * - useWorkspaceFiles hook for tracking agent-created files
 * - Real-time file updates
 * - File content viewing
 */
export function FileWorkspace({ sessionId }: FileWorkspaceProps) {
  const { files, isLoading } = useWorkspaceFiles(sessionId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const selectedFileData = files.find((f) => f.path === selectedFile);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-800">Workspace Files</h2>
        <div className="text-xs text-gray-500 mt-1">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* File List */}
        <div className="w-1/3 border-r overflow-y-auto">
          {isLoading && files.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-sm">Loading files...</p>
              </div>
            </div>
          )}

          {!isLoading && files.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-sm">No files yet</p>
              </div>
            </div>
          )}

          <div className="p-2 space-y-1">
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedFile === file.path
                    ? "bg-blue-100 text-blue-700"
                    : "bg-white hover:bg-gray-100 text-gray-700"
                }`}
              >
                <div className="text-sm font-medium truncate">{file.path}</div>
                <div className="text-xs text-gray-500">
                  {file.content?.length ?? 0} characters
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* File Content Viewer */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedFileData && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-sm">
                  {files.length === 0
                    ? "Agent-created files will appear here"
                    : "Select a file to view its contents"}
                </p>
              </div>
            </div>
          )}

          {selectedFileData && (
            <div>
              <div className="mb-4">
                <h3 className="font-semibold text-gray-800 mb-1">
                  {selectedFileData.path}
                </h3>
                <div className="text-xs text-gray-500">
                  {selectedFileData.content?.length ?? 0} characters
                </div>
              </div>

              <div className="bg-gray-50 border rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm">
                  <code>{selectedFileData.content ?? ''}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
