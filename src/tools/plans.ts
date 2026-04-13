import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readMarkdown,
  writeMarkdown,
  listMarkdownFiles,
  pathExists,
  ensureDir,
  timestampedSlug,
  now,
} from "../brain.js";

export function registerPlanTools(server: McpServer, brainDir: string): void {
  const plansDir = (project: string) =>
    join(brainDir, "projects", project, "plans");

  // -------------------------------------------------------------------------
  // list_plans
  // -------------------------------------------------------------------------
  server.registerTool(
    "list_plans",
    {
      title: "List Plans",
      description: "List implementation plans for a project.",
      inputSchema: {
        project: z.string().describe("Project name."),
        status: z
          .string()
          .optional()
          .describe("Filter by status (e.g. 'active', 'completed', 'draft')."),
      },
    },
    async ({ project, status }) => {
      const dir = plansDir(project);
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No plans found for project "${project}".`,
            },
          ],
        };
      }

      const summaries: string[] = [];

      for (const slug of slugs) {
        const filePath = join(dir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);

        const planStatus = (data.status as string) || "draft";

        if (status && planStatus !== status) continue;

        summaries.push(
          `- **${slug}** (${planStatus}): ${data.title || slug}`
        );
      }

      if (summaries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No ${status || ""} plans found for project "${project}".`,
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
  // get_plan
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_plan",
    {
      title: "Get Plan",
      description: "Get the full content of a specific implementation plan.",
      inputSchema: {
        project: z.string().describe("Project name."),
        slug: z.string().describe("Plan slug (filename without .md)."),
      },
    },
    async ({ project, slug }) => {
      const filePath = join(plansDir(project), `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Plan "${slug}" not found in project "${project}".`,
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
  // save_plan
  // -------------------------------------------------------------------------
  server.registerTool(
    "save_plan",
    {
      title: "Save Plan",
      description:
        "Create or update an implementation plan. Slug is derived from the title.",
      inputSchema: {
        project: z.string().describe("Project name."),
        title: z.string().describe("Plan title."),
        body: z.string().describe("Plan body content (markdown)."),
        status: z
          .enum(["draft", "active", "completed", "abandoned"])
          .optional()
          .describe("Plan status. Defaults to 'active'."),
      },
    },
    async ({ project, title, body, status }) => {
      const dir = plansDir(project);
      await ensureDir(dir);

      const slug = timestampedSlug(title);
      const filePath = join(dir, `${slug}.md`);

      const isUpdate = await pathExists(filePath);

      const data: Record<string, unknown> = {
        title,
        status: status || "active",
        updated: now(),
      };

      if (!isUpdate) {
        data.created = now();
      }

      await writeMarkdown(filePath, data, `\n${body}\n`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Plan ${isUpdate ? "updated" : "created"}: ${slug} (${title})`,
          },
        ],
      };
    }
  );
}
