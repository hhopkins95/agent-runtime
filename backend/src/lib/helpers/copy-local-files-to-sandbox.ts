import fs from "fs"
import path from "path"
import {logger } from "../../config/logger"
import { SandboxPrimitive, WriteFilesResult } from "../sandbox/base";

/**
 * Recursively copy local files from a local directory into a sandbox
 */
export async function copyLocalFilesToSandbox(
    {
        localDirPath,
        targetSandboxDirPath,
        sandbox,
        /**
         * Paths to ignore -- generally, application files will have been copied into the sandbox image directly so they are ignored by default here
         */
        ignorePatterns = ['node_modules', 'package.json', 'requirements.txt', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
    } : {
        localDirPath : string,
        targetSandboxDirPath : string,
        sandbox : SandboxPrimitive,
        ignorePatterns? : string[]
    }
): Promise<WriteFilesResult> {

  if (!fs.existsSync(localDirPath)) {
    logger.warn({ localDirPath }, 'Local directory not found, skipping file copy');
    throw new Error(`Local directory not found: ${localDirPath}`);
  }

  const filesToWrite: { path: string; content: string }[] = [];

  /**
   * Recursively process directory and collect files to write
   */
  function processDirectory(dir: string, relativePath: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativeFilePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      // Skip if matches ignore pattern
      if (ignorePatterns.some(pattern => entry.name === pattern)) {
        continue;
      }

      if (entry.isDirectory()) {
        processDirectory(fullPath, relativeFilePath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const targetPath = `${targetSandboxDirPath}/${relativeFilePath}`;
        filesToWrite.push({ path: targetPath, content });
        logger.debug({ file: relativeFilePath, size: content.length }, 'Added file to copy list');
      }
    }
  }

  processDirectory(localDirPath);

  // Bulk write all files to sandbox
  const result = await sandbox.writeFiles(filesToWrite);

  logger.info({
    success: result.success.length,
    failed: result.failed.length
  }, 'Copied local files to sandbox');

  return result;
}

