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

export function registerKnowledgeTools(server: McpServer, brainDir: string): void {
  const knowledgeDir = () => join(brainDir, "knowledge");

  // -------------------------------------------------------------------------
  // list_knowledge
  // -------------------------------------------------------------------------
  server.registerTool(
    "list_knowledge",
    {
      title: "List Knowledge Items",
      description: "List all global knowledge items (KIs) documented in the brain. Optimized for agy native viewing.",
      inputSchema: {
        // Optional filters could be added later
      },
    },
    async () => {
      const dir = knowledgeDir();
      const slugs = await listMarkdownFiles(dir);

      if (slugs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No knowledge items found.`,
            },
          ],
        };
      }

      const summaries: string[] = [];

      for (const slug of slugs) {
        const filePath = join(dir, `${slug}.md`);
        const { data } = await readMarkdown(filePath);

        const summary = (data.summary as string) || "No summary provided.";

        summaries.push(`- **${slug}**: ${summary}`);
      }

      return {
        content: [{ type: "text" as const, text: summaries.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // get_knowledge
  // -------------------------------------------------------------------------
  server.registerTool(
    "get_knowledge",
    {
      title: "Get Knowledge Item",
      description: "Get the full content of a specific knowledge item. Optimized for agy native viewing. Offload content to the Antigravity file viewer where possible.",
      inputSchema: {
        slug: z.string().describe("Knowledge item slug (filename without .md)."),
      },
    },
    async ({ slug }) => {
      const filePath = join(knowledgeDir(), `${slug}.md`);

      if (!(await pathExists(filePath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Knowledge item "${slug}" not found.`,
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
  // save_knowledge
  // -------------------------------------------------------------------------
  server.registerTool(
    "save_knowledge",
    {
      title: "Save Knowledge Item",
      description: "Create or update a knowledge item (KI). Slug is derived from the title. Optimized for agy native viewing.",
      inputSchema: {
        title: z.string().describe("Knowledge item title."),
        summary: z.string().describe("A short summary of what this knowledge item explains or resolves."),
        body: z.string().describe("Knowledge item body content (markdown)."),
      },
    },
    async ({ title, summary, body }) => {
      const dir = knowledgeDir();
      await ensureDir(dir);

      const slug = slugify(title);
      const filePath = join(dir, `${slug}.md`);

      const isUpdate = await pathExists(filePath);

      const data: Record<string, unknown> = {
        title,
        summary,
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
            text: `Knowledge item ${isUpdate ? "updated" : "created"}: ${slug} (${title})`,
          },
        ],
      };
    }
  );
}
