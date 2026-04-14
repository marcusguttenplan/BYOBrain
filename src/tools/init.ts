import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    ensureDir,
    writeMarkdown,
    readMarkdown,
    pathExists,
    now,
    enforceProjectScope,
} from "../brain.js";

const BRAIN_README_CONTENT = `# Brain — Working Memory Layer

Cross-agent, cross-IDE operational memory.

## Structure

- \`projects/\` — One directory per active project
- \`scratchpad.md\` — Short-lived cross-session notes

## Agent Protocol

1. Read \`projects/{project}/context.md\` at conversation start
2. Update brain files after significant work sessions
3. Keep context files under 200 lines
4. Date everything with \`(YYYY-MM-DD)\` prefix
`;

const SCRATCHPAD_CONTENT = `# Scratchpad

Short-lived notes. Review monthly — promote or delete.

---
`;

const CONTEXT_TEMPLATE = (project: string) => `# ${project} — Context

## Current State

## Recent Decisions

## Architecture Quick Ref
`;

export function registerInitTools(server: McpServer, brainDir: string, lockedProject: string | null): void {
    // -------------------------------------------------------------------------
    // init_brain
    // -------------------------------------------------------------------------
    server.registerTool(
        "init_brain",
        {
            title: "Initialize Brain",
            description:
                "Create the brain directory structure (README.md, projects/, scratchpad.md). " +
                "Uses BRAIN_DIR if path is omitted.",
            inputSchema: {
                path: z
                    .string()
                    .optional()
                    .describe("Path to create the brain directory. Defaults to BRAIN_DIR."),
            },
        },
        async ({ path }) => {
            const targetDir = path || brainDir;

            await ensureDir(join(targetDir, "projects"));
            await ensureDir(join(targetDir, "knowledge"));

            // Write README if it doesn't exist
            const readmePath = join(targetDir, "README.md");
            if (!(await pathExists(readmePath))) {
                await writeMarkdown(
                    readmePath,
                    { title: "Brain — Working Memory Layer", created: now() },
                    BRAIN_README_CONTENT
                );
            }

            // Write scratchpad if it doesn't exist
            const scratchpadPath = join(targetDir, "scratchpad.md");
            if (!(await pathExists(scratchpadPath))) {
                await writeMarkdown(
                    scratchpadPath,
                    { title: "Scratchpad", updated: now() },
                    SCRATCHPAD_CONTENT
                );
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Brain initialized at ${targetDir}\n\nCreated:\n- README.md\n- projects/\n- knowledge/\n- scratchpad.md`,
                    },
                ],
            };
        }
    );

    // -------------------------------------------------------------------------
    // init_project
    // -------------------------------------------------------------------------
    server.registerTool(
        "init_project",
        {
            title: "Initialize Project",
            description:
                "Create a project directory with context.md, plans/, and issues/ subdirectories.",
            inputSchema: {
                project: z.string().describe("Project name (used as directory name)."),
            },
        },
        async ({ project }) => {
            const scopeError = enforceProjectScope(project, lockedProject);
            if (scopeError) return scopeError;

            const projectDir = join(brainDir, "projects", project);

            await ensureDir(join(projectDir, "plans"));
            await ensureDir(join(projectDir, "issues"));
            await ensureDir(join(projectDir, "tasks"));
            await ensureDir(join(projectDir, "walkthroughs"));
            await ensureDir(join(projectDir, "commands"));

            // Write context.md if it doesn't exist
            const contextPath = join(projectDir, "context.md");
            if (!(await pathExists(contextPath))) {
                await writeMarkdown(
                    contextPath,
                    { project, updated: now() },
                    CONTEXT_TEMPLATE(project)
                );
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Project "${project}" initialized at ${projectDir}\n\nCreated:\n- context.md\n- plans/\n- issues/\n- tasks/\n- walkthroughs/\n- commands/`,
                    },
                ],
            };
        }
    );

    // -------------------------------------------------------------------------
    // link_repo
    // -------------------------------------------------------------------------
    server.registerTool(
        "link_repo",
        {
            title: "Link Repository",
            description:
                "Link a repository to the brain. Creates BRAIN.md (config pointer), " +
                "CLAUDE.md and GEMINI.md (agent instructions), and adds them to .gitignore.",
            inputSchema: {
                project: z.string().describe("Project name to link to."),
                repo_path: z
                    .string()
                    .describe("Absolute path to the repository root."),
            },
        },
        async ({ project, repo_path }) => {
            const scopeError = enforceProjectScope(project, lockedProject);
            if (scopeError) return scopeError;

            const created: string[] = [];

            // --- BRAIN.md ---
            const brainMdContent = [
                "# BRAIN.md",
                `brain_dir: ${brainDir}`,
                `project: ${project}`,
                "",
            ].join("\n");
            await writeFile(join(repo_path, "BRAIN.md"), brainMdContent, "utf-8");
            created.push("BRAIN.md");

            // --- Agent instructions (delimited section) ---
            const BRAIN_SECTION_START = "<!-- BYOBRAIN:START -->";
            const BRAIN_SECTION_END = "<!-- BYOBRAIN:END -->";

            const brainSection = (agentName: string) =>
                [
                    BRAIN_SECTION_START,
                    `# ${agentName} Agent Instructions — BYOBrain`,
                    "",
                    "## Token Frugality (Telegraphic Mode)",
                    "- **Zero Prose**: Chat responses must be links to artifacts or bulleted facts.",
                    "- **Fact-Only Context**: \`context.md\` should be a condensed index, not a narrative.",
                    "- **Offloading**: Never inline logs or large diffs; use the scratchpad or KIs.",
                    "- **Native Viewing**: Prioritize `view_file` (for AGV) and dashboard links. Use Antigravity-native viewers for all research and verification summaries.",
                    "- **Deep Linking**: Use the `byobrain://` protocol for all dashboard links presented to the user.",
                    "",
                    "## The Quad Workflow (State Machine)",
                    "You are restricted by a strict State Machine. You must execute your tasks following these phases exactly.",
                    "If you attempt to modify state incorrectly, the MCP tools will throw a State Lock error.",
                    "",
                    "### 1. Spec (Stage 0)",
                    "- **State**: \`research\` (Mutation tools locked)",
                    "- Check KIs before doing ANY work.",
                    "- Architectural features require a Spec/ADR saved in \`knowledge/\` before any code or plans.",
                    "- **Transition**: Use \`set_agent_state\` to move to \`planning\`.",
                    "",
                    "### 2. Plan",
                    "- **State**: \`planning\`",
                    "- Call \`save_plan\` with implementation details referring back to the Spec.",
                    "- Ensure your plan contains a \`## Verification Plan\` section.",
                    "- **STOP** and wait for explicit user approval (\`[APPROVED]\`).",
                    "- **Transition**: User approval allows you to use \`set_agent_state\` to move to \`execution\`.",
                    "",
                    "### 3. Task",
                    "- **State**: \`execution\`",
                    "- Call \`save_task\` with a living checklist.",
                    "- Update turn-by-turn as you work: \`[ ]\` → \`[/]\` → \`[x]\`.",
                    "- **Transition**: Use \`set_agent_state\` to move to \`verification\`.",
                    "",
                    "### 4. Walkthrough",
                    "- **State**: \`verification\`",
                    "- Perform tests, linting, and manual validation.",
                    "- Output the results to \`save_walkthrough\`.",
                    "",
                    "## Artifact Frontmatter",
                    "Every markdown file in the brain MUST include this YAML block at the top:",
                    "\`\`\`yaml",
                    "---",
                    "project: [project_name]",
                    "status: [draft|active|completed|abandoned]",
                    "tags: [spec, adr, plan, task, walkthrough, architecture]",
                    "links: [[related-slugs]]",
                    "type: [adr|spec|plan|task|walkthrough]",
                    "---",
                    "\`\`\`",
                    "",
                    "## Pruning",
                    "- Use \`prune_plans\` or \`prune_tasks\` periodically to remove completed items.",
                    "",
                    "## Brain Location",
                    "",
                    "```",
                    `brain_dir: ${brainDir}`,
                    `project: ${project}`,
                    "```",
                    BRAIN_SECTION_END,
                    "",
                ].join("\n");

            /**
             * Write or update the brain section in an agent file.
             * - If file doesn't exist: create with brain section only.
             * - If file exists without markers: prepend brain section.
             * - If file exists with markers: replace only the brain section.
             */
            async function upsertAgentFile(
                filePath: string,
                agentName: string
            ): Promise<string> {
                const section = brainSection(agentName);
                let existing = "";
                try {
                    existing = await readFile(filePath, "utf-8");
                } catch {
                    // File doesn't exist — create fresh
                    await writeFile(filePath, section, "utf-8");
                    return "created";
                }

                if (
                    existing.includes(BRAIN_SECTION_START) &&
                    existing.includes(BRAIN_SECTION_END)
                ) {
                    // Replace existing brain section
                    const before = existing.substring(
                        0,
                        existing.indexOf(BRAIN_SECTION_START)
                    );
                    const after = existing.substring(
                        existing.indexOf(BRAIN_SECTION_END) + BRAIN_SECTION_END.length
                    );
                    await writeFile(filePath, before + section + after.trimStart(), "utf-8");
                    return "updated";
                }

                // Prepend brain section to existing content
                await writeFile(filePath, section + "\n" + existing, "utf-8");
                return "prepended";
            }

            // --- CLAUDE.md ---
            const claudeAction = await upsertAgentFile(
                join(repo_path, "CLAUDE.md"),
                "Claude"
            );
            created.push(`CLAUDE.md (${claudeAction})`);

            // --- GEMINI.md ---
            const geminiAction = await upsertAgentFile(
                join(repo_path, "GEMINI.md"),
                "Gemini"
            );
            created.push(`GEMINI.md (${geminiAction})`);

            // --- Append to .gitignore if needed ---
            const gitignorePath = join(repo_path, ".gitignore");
            const ignoreEntries = ["BRAIN.md", "CLAUDE.md", "GEMINI.md", ".agent_state"];
            let gitignoreContent = "";
            try {
                gitignoreContent = await readFile(gitignorePath, "utf-8");
            } catch {
                // .gitignore doesn't exist yet
            }

            const missing = ignoreEntries.filter(
                (entry) => !gitignoreContent.split("\n").includes(entry)
            );

            if (missing.length > 0) {
                const appendBlock = [
                    "",
                    "# BYOBrain — per-repo config (generated, contains local paths)",
                    ...missing,
                    "",
                ].join("\n");
                await appendFile(gitignorePath, appendBlock, "utf-8");
                created.push(`.gitignore (added ${missing.join(", ")})`);
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: [
                            `Linked repo at ${repo_path} to project "${project}"`,
                            "",
                            "Created:",
                            ...created.map((f) => `  - ${f}`),
                        ].join("\n"),
                    },
                ],
            };
        }
    );
}

// Need writeFile/readFile/appendFile for link_repo (raw writes, no frontmatter)
import { writeFile, appendFile } from "node:fs/promises";
