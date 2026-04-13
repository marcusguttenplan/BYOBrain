import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readMarkdown, pathExists, today } from "../brain.js";
import { readFile, appendFile } from "node:fs/promises";

export function registerScratchpadTools(
  server: McpServer,
  brainDir: string
): void {
  const scratchpadPath = join(brainDir, "scratchpad.md");

  // -------------------------------------------------------------------------
  // read_scratchpad
  // -------------------------------------------------------------------------
  server.registerTool(
    "read_scratchpad",
    {
      title: "Read Scratchpad",
      description: "Read the contents of the brain's scratchpad.",
      inputSchema: {},
    },
    async () => {
      if (!(await pathExists(scratchpadPath))) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Scratchpad is empty (file does not exist). Use init_brain to create it.",
            },
          ],
        };
      }

      const raw = await readFile(scratchpadPath, "utf-8");

      return {
        content: [{ type: "text" as const, text: raw }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // append_scratchpad
  // -------------------------------------------------------------------------
  server.registerTool(
    "append_scratchpad",
    {
      title: "Append to Scratchpad",
      description:
        "Append a timestamped note to the brain's scratchpad. " +
        "Notes are automatically prefixed with today's date.",
      inputSchema: {
        note: z.string().describe("Note content to append."),
      },
    },
    async ({ note }) => {
      const entry = `\n## [${today()}] Note\n\n${note}\n`;

      await appendFile(scratchpadPath, entry, "utf-8");

      return {
        content: [
          {
            type: "text" as const,
            text: `Appended note to scratchpad (${today()}).`,
          },
        ],
      };
    }
  );
}
