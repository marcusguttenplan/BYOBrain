import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readMarkdown,
  writeMarkdown,
  mergeContextSections,
  pathExists,
  now,
  enforceProjectScope,
} from "../brain.js";

export function registerContextTools(
  server: McpServer,
  brainDir: string,
  lockedProject: string | null
): void {
  // -------------------------------------------------------------------------
  // read_context
  // -------------------------------------------------------------------------
  server.registerTool(
    "read_context",
    {
      title: "Read Context",
      description:
        "Read the context.md file for a project. Returns the full markdown content including frontmatter.",
      inputSchema: {
        project: z.string().describe("Project name."),
      },
    },
    async ({ project }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const contextPath = join(brainDir, "projects", project, "context.md");

      if (!(await pathExists(contextPath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No context found for project "${project}". Use init_project to create it.`,
            },
          ],
          isError: true,
        };
      }

      const { data, content } = await readMarkdown(contextPath);

      // Format frontmatter as readable header
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
  // update_context
  // -------------------------------------------------------------------------
  server.registerTool(
    "update_context",
    {
      title: "Update Context",
      description:
        "Update a project's context.md using section-level merge. " +
        "Sections matching existing ## headings are replaced; new sections are appended. " +
        "The 'updated' frontmatter field is set to today's date.",
      inputSchema: {
        project: z.string().describe("Project name."),
        updates: z
          .string()
          .describe(
            "Markdown content with ## sections to merge into context.md. " +
              "Matching sections are replaced, new sections are appended."
          ),
      },
    },
    async ({ project, updates }) => {
      const scopeError = enforceProjectScope(project, lockedProject);
      if (scopeError) return scopeError;

      const contextPath = join(brainDir, "projects", project, "context.md");

      if (!(await pathExists(contextPath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No context found for project "${project}". Use init_project first.`,
            },
          ],
          isError: true,
        };
      }

      const { data, content } = await readMarkdown(contextPath);
      const merged = mergeContextSections(content, updates);

      const updatesSection = updates;

      data.updated = now();

      await writeMarkdown(
        contextPath,
        data,
        mergeContextSections(content, updatesSection)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Context updated for "${project}" (${now()}).`,
          },
        ],
      };
    }
  );
}
