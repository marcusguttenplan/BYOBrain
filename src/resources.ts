import { join } from "node:path";
import { readdir } from "node:fs/promises";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  readMarkdown,
  listMarkdownFiles,
  pathExists,
} from "./brain.js";
import { readFile } from "node:fs/promises";

export function registerResources(server: McpServer, brainDir: string): void {
  // -------------------------------------------------------------------------
  // byobrain://projects — List all projects
  // -------------------------------------------------------------------------
  server.registerResource(
    "projects-list",
    "byobrain://projects",
    {
      title: "Project List",
      description: "List of all projects in the brain.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const projectsDir = join(brainDir, "projects");
      let projects: string[] = [];
      try {
        const entries = await readdir(projectsDir, { withFileTypes: true });
        projects = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        // projects dir may not exist yet
      }

      return {
        contents: [
          {
            uri: uri.href,
            text:
              projects.length > 0
                ? projects.map((p) => `- ${p}`).join("\n")
                : "No projects found. Use init_project to create one.",
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/context — Project context
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-context",
    new ResourceTemplate("byobrain://projects/{project}/context", {
      list: undefined,
    }),
    {
      title: "Project Context",
      description: "A project's context.md working memory.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const contextPath = join(brainDir, "projects", project, "context.md");

      if (!(await pathExists(contextPath))) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `No context found for project "${project}".`,
            },
          ],
        };
      }

      const raw = await readFile(contextPath, "utf-8");
      return {
        contents: [{ uri: uri.href, text: raw }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/issues — Issue index
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-issues",
    new ResourceTemplate("byobrain://projects/{project}/issues", {
      list: undefined,
    }),
    {
      title: "Project Issues",
      description: "Index of issues for a project.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const dir = join(brainDir, "projects", project, "issues");
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          contents: [
            { uri: uri.href, text: `No issues for project "${project}".` },
          ],
        };
      }

      const lines: string[] = [];
      for (const slug of slugs) {
        const { data } = await readMarkdown(join(dir, `${slug}.md`));
        const status = (data.status as string) || "open";
        lines.push(`- **${slug}** (${status}): ${data.title || slug}`);
      }

      return {
        contents: [{ uri: uri.href, text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/issues/{slug} — Single issue
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-issue",
    new ResourceTemplate("byobrain://projects/{project}/issues/{slug}", {
      list: undefined,
    }),
    {
      title: "Project Issue",
      description: "A single issue's full content.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const slug = params.slug as string;
      const filePath = join(
        brainDir,
        "projects",
        project,
        "issues",
        `${slug}.md`
      );

      if (!(await pathExists(filePath))) {
        return {
          contents: [
            { uri: uri.href, text: `Issue "${slug}" not found.` },
          ],
        };
      }

      const raw = await readFile(filePath, "utf-8");
      return {
        contents: [{ uri: uri.href, text: raw }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/plans — Plan index
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-plans",
    new ResourceTemplate("byobrain://projects/{project}/plans", {
      list: undefined,
    }),
    {
      title: "Project Plans",
      description: "Index of implementation plans for a project.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const dir = join(brainDir, "projects", project, "plans");
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          contents: [
            { uri: uri.href, text: `No plans for project "${project}".` },
          ],
        };
      }

      const lines: string[] = [];
      for (const slug of slugs) {
        const { data } = await readMarkdown(join(dir, `${slug}.md`));
        const status = (data.status as string) || "draft";
        lines.push(`- **${slug}** (${status}): ${data.title || slug}`);
      }

      return {
        contents: [{ uri: uri.href, text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/plans/{slug} — Single plan
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-plan",
    new ResourceTemplate("byobrain://projects/{project}/plans/{slug}", {
      list: undefined,
    }),
    {
      title: "Project Plan",
      description: "A single plan's full content.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const slug = params.slug as string;
      const filePath = join(
        brainDir,
        "projects",
        project,
        "plans",
        `${slug}.md`
      );

      if (!(await pathExists(filePath))) {
        return {
          contents: [
            { uri: uri.href, text: `Plan "${slug}" not found.` },
          ],
        };
      }

      const raw = await readFile(filePath, "utf-8");
      return {
        contents: [{ uri: uri.href, text: raw }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://scratchpad — Scratchpad content
  // -------------------------------------------------------------------------
  server.registerResource(
    "scratchpad",
    "byobrain://scratchpad",
    {
      title: "Scratchpad",
      description: "Brain scratchpad — short-lived cross-session notes.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const scratchpadPath = join(brainDir, "scratchpad.md");

      if (!(await pathExists(scratchpadPath))) {
        return {
          contents: [
            { uri: uri.href, text: "Scratchpad does not exist yet." },
          ],
        };
      }

      const raw = await readFile(scratchpadPath, "utf-8");
      return {
        contents: [{ uri: uri.href, text: raw }],
      };
    }
  );
}
