import path from "path"
import fs from "fs"
import { logger } from "../../config/logger"

/**
 * Recursively build dockerfile commands to copy a local application into a sandbox directory.
 * 
 * Will only copy package.json files
 *
 * @returns Array of dockerfile commands
 */
export function generateSandboxAppInstallCommands({
  localDirPath,
  targetSandboxDirPath
}: {
  localDirPath: string,
  targetSandboxDirPath: string,

}): string[] {
  const commands: string[] = [];
  let isPackageJson = false;
  let isRequirementTxt = false;

  if (!fs.existsSync(localDirPath)) {
    logger.warn({ localDirPath }, 'Local directory not found, skipping file copy');
    return ['RUN mkdir -p /app'];
  }

  logger.debug(`Copying application files from ${localDirPath} to ${targetSandboxDirPath}`);


  // Create target sandbox directory
  commands.push(`RUN mkdir -p ${targetSandboxDirPath}`);


  // If package.json exists, add it to the sandbox
  const packageJsonPath = path.join(localDirPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    commands.push(`RUN cp ${packageJsonPath} ${targetSandboxDirPath}/package.json`);
    isPackageJson = true;
  }

  // If requirement.txt exists, add it to the sandbox
  const requirementTxtPath = path.join(localDirPath, 'requirement.txt');
  if (fs.existsSync(requirementTxtPath)) {
    commands.push(`RUN cp ${requirementTxtPath} ${targetSandboxDirPath}/requirement.txt`);
    isRequirementTxt = true;
  }

  // If package.json, run npm install 
  if (isPackageJson) {
    commands.push(`WORKDIR ${targetSandboxDirPath}`);
    commands.push(`RUN npm install`);
  }

  // If requirement.txt, run pip install
  if (isRequirementTxt) {
    commands.push(`WORKDIR ${targetSandboxDirPath}`);
    commands.push(`RUN pip install -r requirement.txt`);
  }

  return commands;
}



/**
 * Recursively copy files from a local directory to a sandbox directory.
 * Generates Dockerfile commands that preserve directory structure.
 *
 * @param localDirPath - Source directory on host
 * @param targetSandboxDirPath - Target directory in sandbox
 * @param ignorePaths - Additional paths to ignore (merged with defaults: node_modules, .git, .env, .DS_Store)
 * @returns Array of dockerfile commands
 */
export function generateCopyFileCommands({
  localDirPath,
  targetSandboxDirPath,
  ignorePaths = []
}: {
  localDirPath: string,
  targetSandboxDirPath: string,
  ignorePaths?: string[]
}): string[] {
  const commands: string[] = [];

  if (!fs.existsSync(localDirPath)) {
    logger.warn({ localDirPath }, 'Local directory not found, skipping file copy');
    return commands;
  }

  const DEFAULT_IGNORE_PATHS = ['node_modules', '.git', '.env', '.DS_Store', 'package.json', 'requirement.txt'];
  // Merge user ignore paths with defaults
  const allIgnorePaths = [...DEFAULT_IGNORE_PATHS, ...ignorePaths];

  function shouldIgnore(relativePath: string): boolean {
    // Exact path prefix match
    return allIgnorePaths.some(ignore =>
      relativePath === ignore || relativePath.startsWith(ignore + '/')
    );
  }

  function processDirectory(dir: string, relativePath: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativeFilePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      // Skip if matches ignore paths (exact prefix)
      if (shouldIgnore(relativeFilePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        commands.push(`RUN mkdir -p ${targetSandboxDirPath}/${relativeFilePath}`);
        processDirectory(fullPath, relativeFilePath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const base64Content = Buffer.from(content).toString('base64');
        commands.push(`RUN echo '${base64Content}' | base64 -d > ${targetSandboxDirPath}/${relativeFilePath}`);
      }
    }
  }

  // Create target directory
  commands.push(`RUN mkdir -p ${targetSandboxDirPath}`);

  // Process the source directory
  processDirectory(localDirPath);

  logger.debug({ localDirPath, targetSandboxDirPath, commandCount: commands.length }, 'Generated copy file commands');

  return commands;
}
