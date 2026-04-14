import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readMarkdown,
  writeMarkdown,
  listMarkdownFiles,
  pathExists,
  ensureDir,
  stableSlug,
  timestampedSlug,
  findByTitle,
  now,
  enforceProjectScope,
} from "../brain.js";
import { requireAgentState } from "./state.js";

export function registerTaskTools(server: McpServer, brainDir: string, lockedProject: string | null): void {
  const tasksDir = (project: string) =>
    join(brainDir, "projects", project, "tasks");

  // -------------------------------------------------------------------------
  // list_tasks
  // -------------------------------------------------------------------------
  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description: "List task documents for a project.",
      inputSchema: {
        project: z.string().describe("Project name."),
        status: z
          .string()
          .optional()
          .describe("Filter by status (e.g. 'active', 'completed', 'draft')."),
      },
    },
    async ({ project, status }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const dir = tasksDir(project);
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No tasks found for project "${project}".`,
            },
          ],
        };
      }

      const summaries: string[] = [];

      for (const slug of slugs) {
        const filePath = join(dir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);

        const taskStatus = (data.status as string) || "active";

        if (status && taskStatus !== status) continue;

        summaries.push(
          `- **${slug}** (${taskStatus}): ${data.title || slug}`
        );
      }

      if (summaries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No ${status || ""} tasks found for project "${project}".`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: summaries.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // get_task
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_task",
    {
      title: "Get Task",
      description: "Get the full content of a specific task list.",
      inputSchema: {
        project: z.string().describe("Project name."),
        slug: z.string().describe("Task slug (filename without .md)."),
      },
    },
    async ({ project, slug }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const filePath = join(tasksDir(project), `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Task "${slug}" not found in project "${project}".`,
            },
          ],
          isError: true,
        };
      }

      const { data, content } = await readMarkdown(filePath);
      const frontmatterLines = Object.entries(data)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `---\n${frontmatterLines}\n---\n${content}`,
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // save_task
  // -------------------------------------------------------------------------
  server.registerTool(
    "save_task",
    {
      title: "Save Task",
      description:
        "Create or update a task document. Slug is derived from the title.",
      inputSchema: {
        project: z.string().describe("Project name."),
        title: z.string().describe("Task title."),
        body: z.string().describe("Task body content (markdown checklist)."),
        status: z
          .enum(["draft", "active", "completed", "abandoned"])
          .optional()
          .describe("Task list status. Defaults to 'active'."),
      },
    },
    async ({ project, title, body, status }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      // Ensure agent is in the execution phase to mutate tasks.
      await requireAgentState(brainDir, project, "execution");

      const dir = tasksDir(project);
      await ensureDir(dir);

      // Stable slug: find existing by title, or create with date+hour prefix
      const existingSlug = await findByTitle(dir, title);
      const slug = existingSlug || stableSlug(title);
      const filePath = join(dir, `${slug}.md`);
      const isUpdate = !!existingSlug;

      const data: Record<string, unknown> = {
        title,
        status: status || "active",
        updated: now(),
      };

      if (!isUpdate) {
        data.created = now();
      }

      // Write with fallback: if locked, create new file with full timestamp
      try {
        await writeMarkdown(filePath, data, `\n${body}\n`);
      } catch {
        const fallbackSlug = timestampedSlug(title);
        const fallbackPath = join(dir, `${fallbackSlug}.md`);
        data.supersedes = slug;
        await writeMarkdown(fallbackPath, data, `\n${body}\n`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Task written to fallback: ${fallbackSlug} (could not update ${slug})`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Task ${isUpdate ? "updated" : "created"}: ${slug} (${title})`,
          },
        ],
      };
    }
  );
}
