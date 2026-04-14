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

export function registerPlanTools(server: McpServer, brainDir: string, lockedProject: string | null): void {
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
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

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
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

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
        "Create or update an implementation plan. Plans should be full-fidelity " +
        "copies of the agreed Implementation Plan — no size limit. On update, " +
        "provide a revision_comment to append to the running revision log.",
      inputSchema: {
        project: z.string().describe("Project name."),
        title: z.string().describe("Plan title."),
        body: z.string().describe("Plan body content (markdown). Should exactly match the agreed-upon Implementation Plan."),
        status: z
          .enum(["draft", "active", "completed", "abandoned"])
          .optional()
          .describe("Plan status. Defaults to 'active'."),
        revision_comment: z
          .string()
          .optional()
          .describe(
            "Revision comment describing what changed and why. " +
            "Appended with UTC timestamp to the Revision Log section."
          ),
      },
    },
    async ({ project, title, body, status, revision_comment }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const dir = plansDir(project);
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

      // Build the final body, appending revision log if needed
      let finalBody = `\n${body}\n`;

      if (isUpdate && revision_comment) {
        // Read existing revision log from the current file
        const existing = await readMarkdown(filePath);
        const existingContent = existing.content;

        // Extract existing revision log entries
        const revLogMarker = "## Revision Log";
        const revLogIdx = existingContent.indexOf(revLogMarker);
        let existingRevLog = "";
        if (revLogIdx !== -1) {
          existingRevLog = existingContent
            .substring(revLogIdx + revLogMarker.length)
            .trim();
        }

        // Build new revision log
        const timestamp = now();
        const newEntry = `- **${timestamp}**: ${revision_comment}`;
        const revisionLog = existingRevLog
          ? `${existingRevLog}\n${newEntry}`
          : newEntry;

        finalBody = `\n${body}\n\n## Revision Log\n\n${revisionLog}\n`;
      } else if (!isUpdate && revision_comment) {
        // New plan with an initial comment
        const timestamp = now();
        const newEntry = `- **${timestamp}**: ${revision_comment}`;
        finalBody = `\n${body}\n\n## Revision Log\n\n${newEntry}\n`;
      }

      // Write with fallback: if locked, create new file with full timestamp
      try {
        await writeMarkdown(filePath, data, finalBody);
      } catch {
        const fallbackSlug = timestampedSlug(title);
        const fallbackPath = join(dir, `${fallbackSlug}.md`);
        data.supersedes = slug;
        await writeMarkdown(fallbackPath, data, finalBody);

        return {
          content: [
            {
              type: "text" as const,
              text: `Plan written to fallback: ${fallbackSlug} (could not update ${slug})`,
            },
          ],
        };
      }

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
