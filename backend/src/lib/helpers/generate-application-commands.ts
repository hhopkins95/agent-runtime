import path from "path"
import fs from "fs"
import {logger} from "../../config/logger"

/**
 * Recursively build dockerfile commands to copy a local application into a sandbox directory.
 * 
 * Will only copy package.json files
 *
 * @returns Array of dockerfile commands
 */
export function buildSandboxImageCommands({
    localDirPath, 
    targetSandboxDirPath
} : { 
    localDirPath : string, 
    targetSandboxDirPath : string, 

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
    commands.push(`RUN npm install`);
  }

  // If requirement.txt, run pip install
  if (isRequirementTxt) {
    commands.push(`RUN pip install -r requirement.txt`);
  }
  
  return commands;
}

