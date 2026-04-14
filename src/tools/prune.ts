import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { enforceProjectScope, listMarkdownFiles, readMarkdown } from "../brain.js";
import { requireAgentState } from "./state.js";

export function registerPruneTools(server: McpServer, brainDir: string, lockedProject: string | null): void {
  // -------------------------------------------------------------------------
  // prune_plans
  // -------------------------------------------------------------------------
  server.tool(
    "prune_plans",
    "Deletes any plans that are marked as 'completed' or 'abandoned'.",
    {
      project: z.string().describe("Project name."),
    },
    async ({ project }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      await requireAgentState(brainDir, project, ["planning", "execution", "verification"]);

      const plansDir = join(brainDir, "projects", project, "plans");
      const slugs = await listMarkdownFiles(plansDir);
      let count = 0;

      for (const slug of slugs) {
        const filePath = join(plansDir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);
        if (data.status === "completed" || data.status === "abandoned") {
          await unlink(filePath);
          count++;
        }
      }

      return {
        content: [{ type: "text", text: `Pruned ${count} stale plan(s) from ${project}.` }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // prune_tasks
  // -------------------------------------------------------------------------
  server.tool(
    "prune_tasks",
    "Deletes any tasks that are marked as 'completed' or 'abandoned'.",
    {
      project: z.string().describe("Project name."),
    },
    async ({ project }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      await requireAgentState(brainDir, project, ["planning", "execution", "verification"]);

      const tasksDir = join(brainDir, "projects", project, "tasks");
      const slugs = await listMarkdownFiles(tasksDir);
      let count = 0;

      for (const slug of slugs) {
        const filePath = join(tasksDir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);
        if (data.status === "completed" || data.status === "abandoned") {
          await unlink(filePath);
          count++;
        }
      }

      return {
        content: [{ type: "text", text: `Pruned ${count} stale task(s) from ${project}.` }],
      };
    }
  );
}
