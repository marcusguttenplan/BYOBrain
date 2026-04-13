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
  now,
} from "../brain.js";

export function registerCommandTools(server: McpServer, brainDir: string): void {
  const commandsDir = (project: string) =>
    join(brainDir, "projects", project, "commands");

  // -------------------------------------------------------------------------
  // list_commands
  // -------------------------------------------------------------------------
  server.registerTool(
    "list_commands",
    {
      title: "List Commands",
      description: "List highly condensed snippets of saved terminal commands.",
      inputSchema: {
        project: z.string().describe("Project name."),
      },
    },
    async ({ project }) => {
      const dir = commandsDir(project);
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No commands for ${project}.` }],
        };
      }

      const summaries: string[] = [];

      for (const slug of slugs) {
        const filePath = join(dir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);
        summaries.push(`[${slug}]: ${data.title || slug}`);
      }

      return {
        content: [{ type: "text" as const, text: summaries.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // get_command
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_command",
    {
      title: "Get Command",
      description: "Get full command artifact (markdown body contains the script).",
      inputSchema: {
        project: z.string().describe("Project name."),
        slug: z.string().describe("Command slug."),
      },
    },
    async ({ project, slug }) => {
      const filePath = join(commandsDir(project), `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          content: [{ type: "text" as const, text: `Cmd ${slug} not found.` }],
          isError: true,
        };
      }

      const { data, content } = await readMarkdown(filePath);
      const lines = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join("\n");
      return {
        content: [{ type: "text" as const, text: `---\n${lines}\n---\n${content}` }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // save_command
  // -------------------------------------------------------------------------
  server.registerTool(
    "save_command",
    {
      title: "Save Command",
      description: "Save a complex command. Uses markdown codeblock body for exactly-formatted scripts.",
      inputSchema: {
        project: z.string().describe("Project name."),
        title: z.string().describe("Short descriptive title."),
        command_string: z.string().describe("Raw bash script text to be wrapped in a codeblock."),
      },
    },
    async ({ project, title, command_string }) => {
      const dir = commandsDir(project);
      await ensureDir(dir);

      const slug = slugify(title);
      const filePath = join(dir, `${slug}.md`);
      const isUpdate = await pathExists(filePath);

      const data: Record<string, unknown> = {
        title,
        updated: now(),
      };
      if (!isUpdate) data.created = now();

      // Ensure formatting stability
      const body = `\n\`\`\`bash\n${command_string.trim()}\n\`\`\`\n`;
      await writeMarkdown(filePath, data, body);

      return {
        content: [{ type: "text" as const, text: `Command ${isUpdate?'updated':'saved'}: ${slug}` }],
      };
    }
  );
}
