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

  // -------------------------------------------------------------------------
  // byobrain://knowledge — Knowledge index
  // -------------------------------------------------------------------------
  server.registerResource(
    "knowledge-index",
    "byobrain://knowledge",
    {
      title: "Knowledge Index",
      description: "Index of global knowledge items.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const dir = join(brainDir, "knowledge");
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          contents: [
            { uri: uri.href, text: "No knowledge items found." },
          ],
        };
      }

      const lines: string[] = [];
      for (const slug of slugs) {
        const { data } = await readMarkdown(join(dir, `${slug}.md`));
        lines.push(`- **${slug}**: ${data.summary || slug}`);
      }

      return {
        contents: [{ uri: uri.href, text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://knowledge/{slug} — Single knowledge item
  // -------------------------------------------------------------------------
  server.registerResource(
    "knowledge-item",
    new ResourceTemplate("byobrain://knowledge/{slug}", {
      list: undefined,
    }),
    {
      title: "Knowledge Item",
      description: "A single knowledge item's full content.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const slug = params.slug as string;
      const filePath = join(brainDir, "knowledge", `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          contents: [
            { uri: uri.href, text: `Knowledge item "${slug}" not found.` },
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
  // byobrain://projects/{project}/tasks — Task index
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-tasks",
    new ResourceTemplate("byobrain://projects/{project}/tasks", {
      list: undefined,
    }),
    {
      title: "Project Tasks",
      description: "Index of task checklists for a project.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const dir = join(brainDir, "projects", project, "tasks");
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          contents: [
            { uri: uri.href, text: `No tasks for project "${project}".` },
          ],
        };
      }

      const lines: string[] = [];
      for (const slug of slugs) {
        const { data } = await readMarkdown(join(dir, `${slug}.md`));
        const status = (data.status as string) || "active";
        lines.push(`- **${slug}** (${status}): ${data.title || slug}`);
      }

      return {
        contents: [{ uri: uri.href, text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/tasks/{slug} — Single task list
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-task",
    new ResourceTemplate("byobrain://projects/{project}/tasks/{slug}", {
      list: undefined,
    }),
    {
      title: "Project Task",
      description: "A single task document's full content.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const slug = params.slug as string;
      const filePath = join(brainDir, "projects", project, "tasks", `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          contents: [
            { uri: uri.href, text: `Task "${slug}" not found.` },
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
  // byobrain://projects/{project}/walkthroughs — Walkthrough index
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-walkthroughs",
    new ResourceTemplate("byobrain://projects/{project}/walkthroughs", {
      list: undefined,
    }),
    {
      title: "Project Walkthroughs",
      description: "Index of walkthroughs for a project.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const dir = join(brainDir, "projects", project, "walkthroughs");
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          contents: [
            { uri: uri.href, text: `No walkthroughs for project "${project}".` },
          ],
        };
      }

      const lines: string[] = [];
      for (const slug of slugs) {
        const { data } = await readMarkdown(join(dir, `${slug}.md`));
        lines.push(`- **${slug}**: ${data.title || slug}`);
      }

      return {
        contents: [{ uri: uri.href, text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/walkthroughs/{slug} — Single walkthrough
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-walkthrough",
    new ResourceTemplate("byobrain://projects/{project}/walkthroughs/{slug}", {
      list: undefined,
    }),
    {
      title: "Project Walkthrough",
      description: "A single walkthrough document's full content.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const slug = params.slug as string;
      const filePath = join(brainDir, "projects", project, "walkthroughs", `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          contents: [
            { uri: uri.href, text: `Walkthrough "${slug}" not found.` },
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
  // byobrain://projects/{project}/commands — Commands index
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-commands",
    new ResourceTemplate("byobrain://projects/{project}/commands", {
      list: undefined,
    }),
    {
      title: "Project Commands",
      description: "Index of command snippets for a project.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const dir = join(brainDir, "projects", project, "commands");
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          contents: [
            { uri: uri.href, text: `No commands for project "${project}".` },
          ],
        };
      }

      const lines: string[] = [];
      for (const slug of slugs) {
        const { data } = await readMarkdown(join(dir, `${slug}.md`));
        lines.push(`- **${slug}**: ${data.title || slug}`);
      }

      return {
        contents: [{ uri: uri.href, text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // byobrain://projects/{project}/commands/{slug} — Single command
  // -------------------------------------------------------------------------
  server.registerResource(
    "project-command",
    new ResourceTemplate("byobrain://projects/{project}/commands/{slug}", {
      list: undefined,
    }),
    {
      title: "Project Command",
      description: "A single command document's full content.",
      mimeType: "text/markdown",
    },
    async (uri, params) => {
      const project = params.project as string;
      const slug = params.slug as string;
      const filePath = join(brainDir, "projects", project, "commands", `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          contents: [
            { uri: uri.href, text: `Command "${slug}" not found.` },
          ],
        };
      }

      const raw = await readFile(filePath, "utf-8");
      return {
        contents: [{ uri: uri.href, text: raw }],
      };
    }
  );
}
