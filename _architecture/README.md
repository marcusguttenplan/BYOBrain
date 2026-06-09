# BYOBrain — Architecture Overview

> Version `0.4.0` · TypeScript · MCP SDK `^1.12.0`

---

## 1. What Is This?

BYOBrain is a **Model Context Protocol (MCP) server** that gives AI agents persistent, cross-session, cross-IDE working memory. Agents bring their own "brain directory" — a flat filesystem of markdown files — and BYOBrain exposes it as structured MCP tools, resources, and prompts.

```
AI Agent (Claude / Gemini / etc.)
        │  MCP (stdio)
        ▼
 byobrain-mcp  ─────────────────────────────────────────┐
 ┌─────────────┐   reads/writes   ┌──────────────────┐  │
 │  MCP Tools  │ ◄──────────────► │  Brain Dir (fs)  │  │
 │  Resources  │                  │  (user-defined)  │  │
 │  Prompts    │                  └──────────────────┘  │
 └──────┬──────┘                                        │
        │  HTTP (optional --ui flag)                    │
        ▼                                               │
  Nuxt 4 Dashboard  ◄────────────────────────────────── ┘
```

---

## 2. Repository Layout

```
byob/
├── src/                   # MCP server (TypeScript)
│   ├── index.ts           # Entry point — wires server, transport, UI spawn
│   ├── brain.ts           # Core library: FS helpers, frontmatter, state scope
│   ├── resources.ts       # MCP Resources (byobrain:// URI scheme)
│   ├── prompts.ts         # MCP Prompts
│   └── tools/             # One file per tool group
│       ├── init.ts        # init_brain, init_project, link_repo
│       ├── context.ts     # read_context, update_context
│       ├── issues.ts      # list/get/create/resolve_issue
│       ├── plans.ts       # list/get/save_plan
│       ├── tasks.ts       # list/get/save_task
│       ├── walkthroughs.ts
│       ├── commands.ts
│       ├── knowledge.ts   # Global KI store (cross-project)
│       ├── scratchpad.ts  # read/append_scratchpad
│       ├── state.ts       # set/get_agent_state (state machine)
│       ├── prune.ts       # prune_plans, prune_tasks
│       └── ui.ts          # get_dashboard_url
├── dashboard/             # Nuxt 4 web UI (optional, spawned as child process)
│   ├── app/
│   │   ├── pages/         # index, [project]/[type], knowledge/
│   │   └── components/
│   └── server/
│       └── api/           # Nitro API routes (projects, knowledge)
├── test/                  # Vitest unit tests
├── BRAIN.md               # Repo-local config pointer (gitignored)
├── GEMINI.md / CLAUDE.md  # Agent instruction files (gitignored)
└── package.json           # `byobrain-mcp` binary
```

---

## 3. Brain Directory Layout (Runtime)

The brain directory is user-supplied (via `BRAIN_DIR` env var or `BRAIN.md`).

```
brain_dir/
├── README.md
├── scratchpad.md
├── knowledge/             # Global, cross-project knowledge items
│   └── {slug}.md
└── projects/
    └── {project}/
        ├── context.md     # Working memory / state summary
        ├── .agent_state   # Current phase: research|planning|execution|verification
        ├── issues/        # Bug reports, feature requests
        ├── plans/         # Implementation plans (ADRs)
        ├── tasks/         # Living checklists
        ├── walkthroughs/  # Post-execution summaries
        └── commands/      # Reusable command snippets
```

All files are **plain markdown with YAML frontmatter**.

---

## 4. Core Module: `brain.ts`

Central utility library — no MCP dependencies, pure functions.

| Export | Purpose |
|---|---|
| `resolveBrainDirAsync()` | Priority: `BRAIN_DIR` env → `BRAIN.md` file → error |
| `parseBrainMd()` | Zod-validated parse of `BRAIN.md` config |
| `enforceProjectScope()` | Security guard — blocks cross-project access when locked |
| `readMarkdown()` / `writeMarkdown()` | YAML frontmatter parse/stringify |
| `mergeContextSections()` | Section-level merge for `update_context` |
| `slugify()` / `stableSlug()` | URL-safe slug generation |
| `now()` | UTC ISO timestamp |

---

## 5. State Machine

BYOBrain enforces a **four-phase SDLC workflow** per project via `.agent_state`:

```
research ──► planning ──► execution ──► verification
   │                                         │
   └──────────── (reset / new cycle) ◄───────┘
```

- State is stored in `{brain_dir}/projects/{project}/.agent_state`
- Mutation tools (`save_plan`, `save_task`, etc.) call `requireAgentState()` to gate access
- Violations return a **State Lock error** to the agent

---

## 6. MCP Surface

### Tools (25 total)

| Group | Tools |
|---|---|
| Init | `init_brain`, `init_project`, `link_repo` |
| Context | `read_context`, `update_context` |
| Issues | `list_issues`, `get_issue`, `create_issue`, `resolve_issue` |
| Plans | `list_plans`, `get_plan`, `save_plan` |
| Tasks | `list_tasks`, `get_task`, `save_task` |
| Walkthroughs | `list_walkthroughs`, `get_walkthrough`, `save_walkthrough` |
| Commands | `list_commands`, `get_command`, `save_command` |
| Knowledge | `list_knowledge`, `get_knowledge`, `save_knowledge` |
| Scratchpad | `read_scratchpad`, `append_scratchpad` |
| State | `get_agent_state`, `set_agent_state` |
| Prune | `prune_plans`, `prune_tasks` |
| UI | `get_dashboard_url` |

### Resources (`byobrain://` URI scheme)

```
byobrain://projects                              → project list
byobrain://projects/{project}/context
byobrain://projects/{project}/issues
byobrain://projects/{project}/issues/{slug}
byobrain://projects/{project}/plans
byobrain://projects/{project}/plans/{slug}
byobrain://projects/{project}/tasks
byobrain://projects/{project}/tasks/{slug}
byobrain://projects/{project}/walkthroughs
byobrain://projects/{project}/walkthroughs/{slug}
byobrain://projects/{project}/commands
byobrain://projects/{project}/commands/{slug}
byobrain://knowledge
byobrain://knowledge/{slug}
byobrain://scratchpad
```

---

## 7. Transport & Startup

`index.ts` entry point:

1. **Parse CLI args** — `--ui`, `--public`, `--port`
2. **Resolve brain dir** — env var → `BRAIN.md` → exit(1)
3. **Parse `BRAIN.md`** — extract `lockedProject` (optional scope lock)
4. **Create `McpServer`** — register all tools, resources, prompts
5. **Connect `StdioServerTransport`** — MCP over stdio
6. **Optionally spawn dashboard** — Nuxt 4 Nitro output as child process on a free port; port written to `.dashboard_port`

**Security**: When `lockedProject` is set (via `BRAIN.md`), all tool calls are guarded by `enforceProjectScope()` — cross-project writes return an error without touching the filesystem.

---

## 8. Dashboard (Optional UI)

- **Framework**: Nuxt 4 / Vue 3 (in `dashboard/`)
- **Runtime**: Spawned as a Nitro server child process; communicates via env vars (`BRAIN_DIR`, `PROJECT`, `PORT`)
- **API routes** (`dashboard/server/api/`): `projects.get.ts`, `knowledge.get.ts` — direct filesystem reads, no MCP involvement
- **Pages**: Project index, per-project artifact browser (`[project]/[type]`), knowledge index
- **Access**: URL exposed via `get_dashboard_url` MCP tool; port persisted to `.dashboard_port`

---

## 9. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Filesystem as database** | Zero infra — works with any directory, Obsidian, Google Drive, etc. |
| **YAML frontmatter** | Structured metadata without a separate DB; human-readable |
| **`byobrain://` URI scheme** | Stable deep-links across sessions and IDEs |
| **State machine enforcement** | Prevents agents from skipping spec/plan phases; enforced at the tool layer |
| **Project scope lock** | Per-repo `BRAIN.md` pins the server to one project; prevents cross-project data leaks |
| **Stdio transport only** | MCP spec default; UI is a separate HTTP process |
| **Nuxt/Nitro for UI** | SSR + static API routes; bundled into `dashboard/.output` and shipped with the npm package |

---

## 10. Build & Test

```bash
# Build MCP server
npm run build           # tsc → build/

# Dev mode
npm run dev             # tsc --watch

# Run tests
npm test                # vitest run
npm run test:coverage   # with v8 coverage

# Inspect MCP tools interactively
npm run inspect         # @modelcontextprotocol/inspector

# Build dashboard (from dashboard/)
cd dashboard && pnpm build
```

---

## 11. Configuration Reference

### `BRAIN.md` (per-repo, gitignored)
```
brain_dir: /absolute/path/to/brain
project: my-project
```

### Environment Variables
| Var | Description |
|---|---|
| `BRAIN_DIR` | Absolute path to brain directory (overrides `BRAIN.md`) |
| `PORT` / `NITRO_PORT` | Dashboard port (set by MCP server, not user) |
| `PROJECT` | Locked project name passed to dashboard |
