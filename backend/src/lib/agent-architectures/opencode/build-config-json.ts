import path from "path";
import type { AgentProfile } from "../../../types";
import { normalizeString } from "../../util/normalize-string";

type OpencodeMcpServerConfig = {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
  enabled: boolean;
};

type OpencodeMcpJson = {
  mcp: Record<string, OpencodeMcpServerConfig>;
};

export const buildOpencodeConfigJson = (agentProfile: AgentProfile, baseMcpDir: string): OpencodeMcpJson => {
  const mcp: Record<string, OpencodeMcpServerConfig> = {};

  if (agentProfile.bundledMCPs) {
    for (const localmcp of agentProfile.bundledMCPs) {
      const serverProjectPath = path.join(baseMcpDir, normalizeString(localmcp.name));

      // Parse startCommand into parts and resolve relative paths
      const parts = localmcp.startCommand.split(/\s+/);
      const command = parts.map((part, index) => {
        // First part is the executable, keep as-is
        if (index === 0) return part;
        // For args: resolve relative file paths to absolute
        if (!part.startsWith("-") && !part.startsWith("/") && !part.includes("=")) {
          return path.join(serverProjectPath, part);
        }
        return part;
      });

      mcp[localmcp.name] = {
        type: "local",
        command,
        enabled: true,
      };
    }
  }

  return { mcp };
};
