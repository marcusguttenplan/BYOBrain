#!/usr/bin/env node

import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveBrainDirAsync } from "./brain.js";
import { registerInitTools } from "./tools/init.js";
import { registerContextTools } from "./tools/context.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerPlanTools } from "./tools/plans.js";
import { registerScratchpadTools } from "./tools/scratchpad.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

async function main(): Promise<void> {
  // Resolve brain directory
  let brainDir: string;
  try {
    brainDir = await resolveBrainDirAsync();
  } catch (err) {
    console.error(
      "Failed to resolve brain directory:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }

  console.error(`BYOBrain MCP server starting (brain: ${brainDir})`);

  // Create MCP server
  const server = new McpServer({
    name: "byobrain-mcp",
    version: "0.1.0",
  });

  // Register all tools
  registerInitTools(server, brainDir);
  registerContextTools(server, brainDir);
  registerIssueTools(server, brainDir);
  registerPlanTools(server, brainDir);
  registerScratchpadTools(server, brainDir);

  // Register resources
  registerResources(server, brainDir);

  // Register prompts
  registerPrompts(server, brainDir);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("BYOBrain MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
