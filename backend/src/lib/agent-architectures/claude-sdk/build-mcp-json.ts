import path from "path";
import type { AgentProfile } from "../../../types";
import { normalizeString } from "../../util/normalize-string";

export type McpServerConfig = {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type McpJson = {
  mcpServers: Record<string, McpServerConfig>;
};

export const buildMcpJson = (agentProfile: AgentProfile, baseMcpDir: string): McpJson => {
  const mcpServers: Record<string, McpServerConfig> = {};

  if (agentProfile.bundledMCPs) {
    for (const localmcp of agentProfile.bundledMCPs) {
      const serverProjectPath = path.join(baseMcpDir, normalizeString(localmcp.name));

      // Parse startCommand into command and args
      const parts = localmcp.startCommand.split(/\s+/);
      const command = parts[0];
      const args = parts.slice(1).map(arg => {
        // If arg looks like a relative file path, resolve it to absolute
        if (!arg.startsWith("-") && !arg.startsWith("/") && !arg.includes("=")) {
          return path.join(serverProjectPath, arg);
        }
        return arg;
      });

      mcpServers[localmcp.name] = {
        type: "stdio",
        command: command ?? "",
        args,
      };
    }
  }

  return { mcpServers };
};
