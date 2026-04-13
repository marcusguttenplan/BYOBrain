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
  enforceProjectScope,
} from "../brain.js";

export function registerIssueTools(server: McpServer, brainDir: string, lockedProject: string | null): void {
  const issuesDir = (project: string) =>
    join(brainDir, "projects", project, "issues");

  // -------------------------------------------------------------------------
  // list_issues
  // -------------------------------------------------------------------------
  server.registerTool(
    "list_issues",
    {
      title: "List Issues",
      description:
        "List issues for a project. Skips resolved issues by default. " +
        "Use include_resolved or status filter to see resolved issues.",
      inputSchema: {
        project: z.string().describe("Project name."),
        status: z
          .string()
          .optional()
          .describe("Filter by status (e.g. 'open', 'resolved')."),
        include_resolved: z
          .boolean()
          .optional()
          .describe("If true, include resolved issues in the list. Default: false."),
      },
    },
    async ({ project, status, include_resolved }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const dir = issuesDir(project);
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No issues found for project "${project}".`,
            },
          ],
        };
      }

      const summaries: string[] = [];

      for (const slug of slugs) {
        const filePath = join(dir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);

        const issueStatus = (data.status as string) || "open";

        // Skip resolved unless explicitly included
        if (
          issueStatus === "resolved" &&
          !include_resolved &&
          status !== "resolved"
        ) {
          continue;
        }

        // Apply status filter if provided
        if (status && issueStatus !== status) {
          continue;
        }

        const severity = data.severity ? ` [${data.severity}]` : "";
        summaries.push(
          `- **${slug}** (${issueStatus}${severity}): ${data.title || slug}`
        );
      }

      if (summaries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No ${status || "open"} issues found for project "${project}".`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: summaries.join("\n"),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // get_issue
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_issue",
    {
      title: "Get Issue",
      description: "Get the full content of a specific issue.",
      inputSchema: {
        project: z.string().describe("Project name."),
        slug: z.string().describe("Issue slug (filename without .md)."),
      },
    },
    async ({ project, slug }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const filePath = join(issuesDir(project), `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Issue "${slug}" not found in project "${project}".`,
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
  // create_issue
  // -------------------------------------------------------------------------
  server.registerTool(
    "create_issue",
    {
      title: "Create Issue",
      description:
        "Create a new issue file with YAML frontmatter (title, status, severity, created date).",
      inputSchema: {
        project: z.string().describe("Project name."),
        title: z.string().describe("Issue title."),
        body: z.string().describe("Issue body content (markdown)."),
        severity: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("Issue severity level."),
      },
    },
    async ({ project, title, body, severity }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const dir = issuesDir(project);
      await ensureDir(dir);

      const slug = timestampedSlug(title);
      const filePath = join(dir, `${slug}.md`);

      const data: Record<string, unknown> = {
        title,
        status: "open",
        created: now(),
      };

      if (severity) {
        data.severity = severity;
      }

      await writeMarkdown(filePath, data, `\n${body}\n`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Issue created: ${slug} (${title})`,
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // resolve_issue
  // -------------------------------------------------------------------------
  server.registerTool(
    "resolve_issue",
    {
      title: "Resolve Issue",
      description:
        "Mark an issue as resolved. Sets status to 'resolved', adds resolved date, " +
        "and appends resolution notes.",
      inputSchema: {
        project: z.string().describe("Project name."),
        slug: z.string().describe("Issue slug (filename without .md)."),
        resolution: z
          .string()
          .describe("Resolution notes explaining how the issue was resolved."),
      },
    },
    async ({ project, slug, resolution }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const filePath = join(issuesDir(project), `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Issue "${slug}" not found in project "${project}".`,
            },
          ],
          isError: true,
        };
      }

      const { data, content } = await readMarkdown(filePath);

      data.status = "resolved";
      data.resolved = now();

      const updatedContent =
        content.trimEnd() +
        `\n\n## Resolution (${now()})\n\n${resolution}\n`;

      await writeMarkdown(filePath, data, updatedContent);

      return {
        content: [
          {
            type: "text" as const,
            text: `Issue "${slug}" resolved (${now()}).`,
          },
        ],
      };
    }
  );
}
