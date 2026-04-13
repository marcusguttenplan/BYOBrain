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

export function registerInitTools(server: McpServer, brainDir: string): void {
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
                    "## On Conversation Start",
                    "",
                    "1. Read `BRAIN.md` in this repo root to find the brain directory and project name.",
                    "2. Call `list_knowledge` to check for relevant global architecture/patterns.",
                    "3. Read `{brain_dir}/projects/{project}/context.md` for current project state.",
                    "4. Scan `{brain_dir}/projects/{project}/issues/` and `plans/` for active work.",
                    "5. Use this context to avoid re-explaining project state. Jump straight into the work.",
                    "",
                    "## Planning Mode (The Trio: Plan → Task → Walkthrough)",
                    "",
                    "For any non-trivial request (architectural changes, multi-file edits, ambiguous scope),",
                    "follow this structured workflow. **Do NOT skip phases.**",
                    "",
                    "### Phase 1: Research",
                    "- Investigate the codebase, dependencies, and implications.",
                    "- **Do NOT make source code changes** during this phase.",
                    "- Ask the user open questions if needed.",
                    "",
                    "### Phase 2: Create Implementation Plan",
                    "- Call `save_plan` with the full-fidelity plan. Plans have **no size limit**.",
                    "- Present key decisions and trade-offs to the user for review.",
                    "- **STOP and wait for explicit user approval before proceeding.**",
                    "",
                    "### Phase 3: Execute",
                    "- Call `save_task` with a checklist of work items.",
                    "- Update the task (same title) as you complete items: `[ ]` → `[/]` → `[x]`.",
                    "- If you discover issues requiring significant plan changes, update the plan",
                    "  (with `revision_comment`) and re-request approval before continuing.",
                    "",
                    "### Phase 4: Verify & Walkthrough",
                    "- Run tests, build checks, or manual verification steps.",
                    "- Call `save_walkthrough` summarizing: changes made, what was tested, results.",
                    "- Update the plan status to `completed`.",
                    "",
                    "### When NOT to Plan",
                    "- Investigatory questions: 'explain X', 'where do we do Y?'",
                    "- Trivially simple changes: fix typo, add comment, run command",
                    "- Minor follow-ups to an already-approved plan",
                    "",
                    "## Throughout Execution (Every Turn)",
                    "",
                    "ALWAYS write to the brain after ANY significant step:",
                    "1. **Update context.md** — New decisions, status changes. Under 200 lines. Prefix `(YYYY-MM-DD)`.",
                    "2. **Plans** — Full-fidelity. Always include `revision_comment` on updates.",
                    "3. **Tasks** — Living checklist. Update progress each turn.",
                    "4. **Issues** — New blockers → `create_issue`. Resolved → `resolve_issue`.",
                    "5. **Commands** — Complex commands that work → `save_command`.",
                    "6. **Knowledge** — Create KIs iteratively as you discover patterns, not after.",
                    "",
                    "## Artifact Formats",
                    "",
                    "### Implementation Plan (`save_plan`)",
                    "```",
                    "# [Goal Description]",
                    "Brief problem description and background context.",
                    "",
                    "## User Review Required",
                    "Breaking changes, significant design decisions. Use alerts.",
                    "",
                    "## Proposed Changes",
                    "### [Component Name]",
                    "#### [MODIFY|NEW|DELETE] filename",
                    "Description of changes with code diffs.",
                    "",
                    "## Open Questions",
                    "Clarifying questions for the user.",
                    "",
                    "## Verification Plan",
                    "How you will verify the changes work.",
                    "```",
                    "",
                    "### Task Checklist (`save_task`)",
                    "```",
                    "- [ ] Uncompleted",
                    "- [/] In progress",
                    "- [x] Completed",
                    "  - Indented sub-items for granularity",
                    "```",
                    "",
                    "### Walkthrough (`save_walkthrough`)",
                    "```",
                    "## Changes Made",
                    "What was changed and why.",
                    "",
                    "## What Was Tested",
                    "Commands run, checks performed.",
                    "",
                    "## Results",
                    "Validation outcomes.",
                    "```",
                    "",
                    "## Rules (Frugal Token Policy)",
                    "",
                    "- **Telegraphic**: Omit pleasantries. Use abbreviations.",
                    "- **Offload**: Never inline large logs. Save to scratchpad/KIs, reference by path.",
                    "- **Size Limits**: context.md under 200 lines. Prune resolved items.",
                    '- **Concrete**: "gray-matter parsing fails on empty frontmatter" not "some parsing issues."',
                    "- **References**: Don't duplicate — link to brain URIs or wiki pages.",
                    "- **\"Don't forget\" = permanent rule**: If the user says \"don't forget\", \"remember to\",",
                    "  or any correction implying a recurring mistake, **immediately** save it as a Knowledge Item",
                    "  or append it to context.md so it is never repeated across sessions.",
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
            const ignoreEntries = ["BRAIN.md", "CLAUDE.md", "GEMINI.md"];
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
