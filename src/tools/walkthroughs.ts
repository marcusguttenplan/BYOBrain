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

export function registerWalkthroughTools(server: McpServer, brainDir: string, lockedProject: string | null): void {
  const walkthroughsDir = (project: string) =>
    join(brainDir, "projects", project, "walkthroughs");

  // -------------------------------------------------------------------------
  // list_walkthroughs
  // -------------------------------------------------------------------------
  server.registerTool(
    "list_walkthroughs",
    {
      title: "List Walkthroughs",
      description: "List walkthrough documents for a project. Optimized for agy native viewing.",
      inputSchema: {
        project: z.string().describe("Project name."),
      },
    },
    async ({ project }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const dir = walkthroughsDir(project);
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No walkthroughs found for project "${project}".`,
            },
          ],
        };
      }

      const summaries: string[] = [];

      for (const slug of slugs) {
        const filePath = join(dir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);

        summaries.push(
          `- **${slug}**: ${data.title || slug}`
        );
      }

      return {
        content: [{ type: "text" as const, text: summaries.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // get_walkthrough
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_walkthrough",
    {
      title: "Get Walkthrough",
      description: "Get the full content of a specific walkthrough document. Optimized for agy native viewing. Offload content to the Antigravity file viewer where possible.",
      inputSchema: {
        project: z.string().describe("Project name."),
        slug: z.string().describe("Walkthrough slug (filename without .md)."),
      },
    },
    async ({ project, slug }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const filePath = join(walkthroughsDir(project), `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Walkthrough "${slug}" not found in project "${project}".`,
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
  // save_walkthrough
  // -------------------------------------------------------------------------
  server.registerTool(
    "save_walkthrough",
    {
      title: "Save Walkthrough",
      description:
        "Create or update a walkthrough document. Slug is derived from the title. Optimized for agy native viewing.",
      inputSchema: {
        project: z.string().describe("Project name."),
        title: z.string().describe("Walkthrough title."),
        body: z.string().describe("Walkthrough body content (markdown)."),
      },
    },
    async ({ project, title, body }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const dir = walkthroughsDir(project);
      await ensureDir(dir);

      // Stable slug: find existing by title, or create with date+hour prefix
      const existingSlug = await findByTitle(dir, title);
      const slug = existingSlug || stableSlug(title);
      const filePath = join(dir, `${slug}.md`);
      const isUpdate = !!existingSlug;

      const data: Record<string, unknown> = {
        title,
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
              text: `Walkthrough written to fallback: ${fallbackSlug} (could not update ${slug})`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Walkthrough ${isUpdate ? "updated" : "created"}: ${slug} (${title})`,
          },
        ],
      };
    }
  );
}
