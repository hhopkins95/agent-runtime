import path from "path";
import type { AgentProfile } from "../../../types";
import { normalizeString } from "../../util/normalize-string";

type OpencodeMcpServerConfig = {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
  enabled: boolean;
};

type OpencodeConfig = {
  permission: {
    bash: "allow" | "ask" | "deny";
    edit: "allow" | "ask" | "deny";
    external_directory: "allow" | "ask" | "deny";
  };
  plugin?: string[];
  mcp?: Record<string, OpencodeMcpServerConfig>;
};

export const buildConfigJson = (agentProfile: AgentProfile, baseMcpDir: string): OpencodeConfig => {
  // Build permissions (non-interactive mode for sandbox execution)
  const permission: OpencodeConfig["permission"] = {
    bash: "allow",
    edit: "allow",
    external_directory: "deny",
  };

  // Build plugins array (include opencode-skills if skills are defined)
  const plugins: string[] = [];
  if (agentProfile.skills && agentProfile.skills.length > 0) {
    plugins.push("opencode-skills");
  }

  // Build MCP server configuration
  let mcp: Record<string, OpencodeMcpServerConfig> | undefined;

  if (agentProfile.bundledMCPs && agentProfile.bundledMCPs.length > 0) {
    mcp = {};

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

  return {
    permission,
    ...(plugins.length > 0 && { plugin: plugins }),
    ...(mcp && { mcp }),
  };
};
