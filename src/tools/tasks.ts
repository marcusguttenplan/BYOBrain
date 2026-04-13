import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readMarkdown,
  writeMarkdown,
  listMarkdownFiles,
  pathExists,
  ensureDir,
  slugify,
  today,
} from "../brain.js";

export function registerTaskTools(server: McpServer, brainDir: string): void {
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
      const dir = tasksDir(project);
      await ensureDir(dir);

      const slug = slugify(title);
      const filePath = join(dir, `${slug}.md`);

      const isUpdate = await pathExists(filePath);

      const data: Record<string, unknown> = {
        title,
        status: status || "active",
        updated: today(),
      };

      if (!isUpdate) {
        data.created = today();
      }

      await writeMarkdown(filePath, data, `\n${body}\n`);

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
