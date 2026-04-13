import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer, brainDir: string): void {
  // -------------------------------------------------------------------------
  // bootstrap — Guided project setup
  // -------------------------------------------------------------------------
  server.registerPrompt(
    "bootstrap",
    {
      title: "Bootstrap Project",
      description:
        "Set up BYOBrain for a new project. Creates the project directory, " +
        "populates context.md, and offers to link repositories.",
      argsSchema: {
        project: z.string().describe("Name of the project to bootstrap."),
      },
    },
    ({ project }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `I want to set up BYOBrain for a project called "${project}".`,
              "",
              "Please help me:",
              `1. Run init_project to create the project directory for "${project}"`,
              "2. Populate context.md with:",
              "   - Project name and description",
              "   - Architecture quick reference (tech stack, key services)",
              "   - Current state (what's deployed, what's in progress)",
              "   - Recent decisions (last 5-10 important choices)",
              "   - Environment info (staging/prod URLs, key services)",
              "3. Ask if I want to link any repositories with link_repo",
              "",
              `Brain directory: ${brainDir}`,
            ].join("\n"),
          },
        },
      ],
    })
  );

  // -------------------------------------------------------------------------
  // update_brain — End-of-session brain update
  // -------------------------------------------------------------------------
  server.registerPrompt(
    "update_brain",
    {
      title: "Update Brain",
      description:
        "End-of-session workflow. Updates context.md with session work, " +
        "creates or resolves issues, and updates plans.",
      argsSchema: {
        project: z.string().describe("Name of the project to update."),
        summary: z
          .string()
          .describe("Brief summary of what was accomplished this session."),
      },
    },
    ({ project, summary }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `I've finished a work session on "${project}". Here's what I did:`,
              "",
              summary,
              "",
              "Please update the brain:",
              "1. Use update_context to add new entries to '## Current State' and '## Recent Decisions'",
              "   - Prefix each entry with today's date: (YYYY-MM-DD)",
              "   - Keep the file under 200 lines total — prune old resolved items if needed",
              "2. Create issues for any new blockers discovered (create_issue)",
              "3. Resolve any issues that were fixed this session (resolve_issue)",
              "4. Update or create plans if implementation plans changed (save_plan)",
              "5. Add any volatile notes to the scratchpad (append_scratchpad)",
              "",
              `Brain directory: ${brainDir}`,
            ].join("\n"),
          },
        },
      ],
    })
  );
}
