#!/usr/bin/env node

import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveBrainDirAsync, parseBrainMd } from "./brain.js";
import { registerInitTools } from "./tools/init.js";
import { registerContextTools } from "./tools/context.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerPlanTools } from "./tools/plans.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerWalkthroughTools } from "./tools/walkthroughs.js";
import { registerCommandTools } from "./tools/commands.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerScratchpadTools } from "./tools/scratchpad.js";
import { registerStateTools } from "./tools/state.js";
import { registerPruneTools } from "./tools/prune.js";
import { registerUiTools } from "./tools/ui.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { createServer } from "node:net";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));


/** Find a random available port. */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "string" ? 0 : address?.port ?? 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/** Placeholder for starting the Nuxt 4 Dashboard. */
async function startUi(options: {
  port: number;
  host: string;
  brainDir: string;
  project: string | null;
}): Promise<void> {
  const nitroPath = join(__dirname, "..", "dashboard", ".output", "server", "index.mjs");

  // Check if dashboard is built
  const { existsSync } = await import("node:fs");
  if (!existsSync(nitroPath)) {
    console.error(
      `[UI] Error: Dashboard build not found at ${nitroPath}\n` +
      `     Please run 'npm run build' in the dashboard directory first.`
    );
    return;
  }

  console.error(`[UI] Starting Dashboard on http://${options.host}:${options.port}...`);

  const child = spawn("node", [nitroPath], {
    env: {
      ...process.env,
      PORT: options.port.toString(),
      NITRO_PORT: options.port.toString(),
      NITRO_HOST: options.host,
      BRAIN_DIR: options.brainDir,
      PROJECT: options.project || "",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  // Persist port for the protocol handler
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(process.cwd(), ".dashboard_port"), options.port.toString(), "utf-8");
  } catch (err) {
    console.error("[UI] Failed to write .dashboard_port file:", err);
  }

  child.on("error", (err) => {
    console.error("[UI] Failed to start Dashboard:", err);
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[UI] Dashboard exited with code ${code}`);
    }
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      ui: { type: "boolean", short: "u" },
      public: { type: "boolean", short: "p" },
      port: { type: "string" },
    },
    strict: false,
  });

  const uiEnabled = values.ui ?? false;
  const isPublic = values.public ?? false;
  let port = (typeof values.port === "string") ? parseInt(values.port, 10) : 0;

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

  let lockedProject: string | null = null;
  try {
    const config = await parseBrainMd(join(process.cwd(), "BRAIN.md"));
    if (config) {
      lockedProject = config.project;
      console.error(`MCP locked to project: ${lockedProject}`);
    }
  } catch (err) {
    // No BRAIN.md or invalid, ignore
  }

  // Create MCP server
  const server = new McpServer({
    name: "byobrain-mcp",
    version: "0.4.0",
  });

  let dashboardUrl: string | null = null;

  // Register all tools
  registerInitTools(server, brainDir, lockedProject);
  registerContextTools(server, brainDir, lockedProject);
  registerIssueTools(server, brainDir, lockedProject);
  registerPlanTools(server, brainDir, lockedProject);
  registerTaskTools(server, brainDir, lockedProject);
  registerWalkthroughTools(server, brainDir, lockedProject);
  registerCommandTools(server, brainDir, lockedProject);
  registerKnowledgeTools(server, brainDir);
  registerScratchpadTools(server, brainDir);
  registerStateTools(server, brainDir, lockedProject);
  registerPruneTools(server, brainDir, lockedProject);
  registerUiTools(server, () => dashboardUrl);

  // Register resources
  registerResources(server, brainDir);

  // Register prompts
  registerPrompts(server, brainDir);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("BYOBrain MCP server running on stdio");

  // Start UI if enabled
  if (uiEnabled) {
    if (port === 0) {
      try {
        port = await findFreePort();
      } catch (err) {
        console.error("Failed to find free port for UI:", err);
        port = 8383; // Fallback
      }
    }

    const host = isPublic ? "0.0.0.0" : "127.0.0.1";
    dashboardUrl = `http://${host}:${port}`;
    await startUi({
      port,
      host,
      brainDir,
      project: lockedProject,
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
