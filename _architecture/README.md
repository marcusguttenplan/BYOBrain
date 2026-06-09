# BYOBrain — Architecture

> **Position in the stack:** `saddlebag → packmule → **byobrain** → campfire / IDE`
>
> BYOBrain is the **reasoning and memory layer** of the Packmule harness. It is an MCP server and
> agent loop that gives AI agents persistent, structured working memory, enforces a spec-driven SDLC,
> and maintains a local knowledge + code graph. It operates standalone and plugs into any MCP-capable
> IDE (Antigravity, Cursor, Claude Desktop, Claude Code). When running alongside Saddlebag and
> Packmule Core, it gains model routing, IAM enforcement, sandboxing, and collaboration.

---

## Table of Contents

1. [What BYOBrain Is](#1-what-byobrain-is)
2. [Repository Layout](#2-repository-layout)
3. [Brain Directory Layout](#3-brain-directory-layout)
4. [Runtime Model](#4-runtime-model)
5. [MCP Surface](#5-mcp-surface)
6. [SDLC State Machine](#6-sdlc-state-machine)
7. [Internal Engine](#7-internal-engine)
8. [Knowledge & Code Graph (Kùzu)](#8-knowledge--code-graph-kùzu)
9. [Context Assembly](#9-context-assembly)
10. [Brain Sync](#10-brain-sync)
11. [Standalone vs. Full-Stack Mode](#11-standalone-vs-full-stack-mode)
12. [Configuration](#12-configuration)
13. [Build & Test](#13-build--test)

---

## 1. What BYOBrain Is

```
IDE (Antigravity / Cursor / Claude Code)
        │  MCP — stdio or HTTP+SSE
        ▼
  byobrain  ────────────────────────────────────────────────────┐
  ┌──────────────────────────────────────────────────────────┐  │
  │  MCP Server (critical path — primary IDE surface)        │  │
  │  ~40 tools · byobrain:// resources · prompts             │  │
  ├──────────────────────────────────────────────────────────┤  │
  │  Internal Engine (shared by MCP server + agent loop)     │  │
  │  SDLC Engine · Context Assembly · Skill Loader           │  │
  │  Kùzu Graph · Local Brain · Sub-Agent Orchestrator       │  │
  │  Brain Sync Client · Collaboration Client                │  │
  ├──────────────────────────────────────────────────────────┤  │
  │  Saddlebag Integration (Unix socket, optional)           │  │
  │  Model Gateway · Cedar IAM · Audit Log · Events          │  │
  └──────────────────────────────────────────────────────────┘  │
        │  file I/O                                              │
        ▼                                                        │
  Brain Dir (filesystem — owned by user)  ◄────────────────────┘
        │  optional WebSocket
        ▼
  Campfire (web dashboard)
```

**Standalone mode:** BYOBrain works without Saddlebag. Model calls go direct to providers via user API keys. No IAM, no sandboxing, no cost control — but the full SDLC workflow and memory layer work.

**Full-stack mode:** All model calls route through Saddlebag's gateway. Cedar enforces SDLC transitions. Agent JWT issued for identity. Brain Sync federates to team via CloudEvents.

---

## 2. Repository Layout

```
byob/
├── src/
│   ├── index.ts               # Entry point: wire MCP server, transport, optional UI
│   ├── brain.ts               # Core lib: FS helpers, frontmatter, state scope
│   ├── resources.ts           # byobrain:// URI scheme resources
│   ├── prompts.ts             # MCP Prompts (bootstrap, update_brain)
│   └── tools/
│       ├── init.ts            # init_brain, init_project, link_repo
│       ├── context.ts         # read_context, update_context
│       ├── issues.ts          # list/get/create/resolve_issue
│       ├── plans.ts           # list/get/save_plan, prune_plans
│       ├── tasks.ts           # list/get/save_task, prune_tasks
│       ├── walkthroughs.ts
│       ├── commands.ts
│       ├── knowledge.ts       # list/get/save_knowledge
│       ├── scratchpad.ts      # read/append_scratchpad
│       ├── state.ts           # get/set_agent_state (Cedar-enforced in full-stack)
│       ├── graph.ts           # query_graph, query_code_structure [Phase 2]
│       ├── collab.ts          # get_collaboration_state, acquire/release_lock [Phase 3]
│       ├── budget.ts          # get_budget_status, suggest_model [Phase 1]
│       ├── manifests.ts       # submit_permission_manifest [Phase 2]
│       └── ui.ts              # get_dashboard_url
├── dashboard/                 # Campfire / Nuxt 4 (optional, child process)
│   ├── app/
│   │   ├── pages/
│   │   └── components/
│   └── server/api/
├── test/                      # Vitest unit + integration
├── _architecture/             # This directory — design docs
│   ├── README.md              # ← you are here
│   ├── identity.md            # Identity model, JWT claims, Cedar principals
│   ├── gateway.md             # Model gateway, normalization, Ollama
│   ├── graph.md               # Kùzu schema, code graph, knowledge retrieval
│   ├── context.md             # Context assembly, block architecture, frugality
│   ├── sandbox.md             # Packmule Sandbox, Seatbelt/Landlock, Cedar compilation
│   └── events.md              # CloudEvents schema, event bus, brain federation
├── BRAIN.md                   # Repo-local config pointer (gitignored)
├── CLAUDE.md / GEMINI.md      # Agent instruction files (gitignored)
└── package.json               # byobrain-mcp binary
```

---

## 3. Brain Directory Layout

User-supplied via `BRAIN_DIR` env var or `BRAIN.md`. All files are **plain markdown with YAML frontmatter**.

```
brain_dir/
├── scratchpad.md                            # Cross-session ephemeral notes
├── knowledge/                               # Global, cross-project knowledge items
│   └── {YYYY-MM-DD-HHmmss-slug}.md
└── projects/
    └── {project}/
        ├── context.md                       # Working memory / constitution
        ├── .agent_state                     # Current phase
        ├── plans/
        │   └── {YYYY-MM-DD-HHmmss-slug}.md
        ├── tasks/
        │   └── {YYYY-MM-DD-HHmmss-slug}.md
        ├── walkthroughs/
        │   └── {YYYY-MM-DD-HHmmss-slug}.md
        ├── commands/
        │   └── {YYYY-MM-DD-HHmmss-slug}.md
        └── issues/
            └── {YYYY-MM-DD-HHmmss-slug}.md
```

**Artifact naming:** `{YYYY-MM-DD-HHmmss}-{slug}.md`. Timestamp prefix enables chronological sort, deduplication, and pruning without a database.

---

## 4. Runtime Model

### Processes

| Process    | When                              | What                                                            |
| ---------- | --------------------------------- | --------------------------------------------------------------- |
| MCP server | Always (while IDE connected)      | Serves all tools/resources via stdio or HTTP+SSE                |
| Agent loop | Per desk session (if self-driven) | Turn-by-turn reasoning + tool calls                             |
| Sub-agents | On demand (max 8)                 | Node.js child processes; isolated context; inherit Cedar policy |
| Dashboard  | On demand (`--ui` flag)           | Nuxt 4 Nitro child process                                      |

### Startup Sequence

1. Parse CLI args (`--ui`, `--port`, `--public`)
2. Resolve brain dir: `BRAIN_DIR` env → `BRAIN.md` → exit(1)
3. Parse `BRAIN.md`: extract `lockedProject`
4. If Saddlebag socket present → connect; register for policy events
5. Initialize Kùzu graph (in-process C++ binding)
6. Create `McpServer`; register all tools, resources, prompts
7. Connect `StdioServerTransport` (or `StreamableHttpServerTransport`)
8. Optionally spawn Campfire child process; write port to `.dashboard_port`

---

## 5. MCP Surface

### Tool Groups

| Group              | Tools                                                       |
| ------------------ | ----------------------------------------------------------- |
| Init               | `init_brain`, `init_project`, `link_repo`                   |
| Context            | `read_context`, `update_context`                            |
| Issues             | `list_issues`, `get_issue`, `create_issue`, `resolve_issue` |
| Plans              | `list_plans`, `get_plan`, `save_plan`, `prune_plans`        |
| Tasks              | `list_tasks`, `get_task`, `save_task`, `prune_tasks`        |
| Walkthroughs       | `list_walkthroughs`, `get_walkthrough`, `save_walkthrough`  |
| Commands           | `list_commands`, `get_command`, `save_command`              |
| Knowledge          | `list_knowledge`, `get_knowledge`, `save_knowledge`         |
| Scratchpad         | `read_scratchpad`, `append_scratchpad`                      |
| State              | `get_agent_state`, `set_agent_state`                        |
| Graph [P2]         | `query_graph`, `query_code_structure`                       |
| Collaboration [P3] | `get_collaboration_state`, `acquire_lock`, `release_lock`   |
| Budget [P1]        | `get_budget_status`, `suggest_model`                        |
| Manifests [P2]     | `submit_permission_manifest`                                |
| Skills [P2]        | `create_skill`                                              |
| Linear [P3]        | `sync_linear`                                               |
| UI                 | `get_dashboard_url`                                         |

### Resources (`byobrain://` URI scheme)

```
byobrain://projects
byobrain://projects/{project}/context
byobrain://projects/{project}/issues[/{slug}]
byobrain://projects/{project}/plans[/{slug}]
byobrain://projects/{project}/tasks[/{slug}]
byobrain://projects/{project}/walkthroughs[/{slug}]
byobrain://projects/{project}/commands[/{slug}]
byobrain://knowledge[/{slug}]
byobrain://scratchpad
```

---

## 6. SDLC State Machine

```
research ──► planning ──► [plan_approved] ──► execution ──► verification
   │                             │                                │
   └──────────── (reset / new cycle) ◄────────────────────────────┘
```

- State stored in `{brain_dir}/projects/{project}/.agent_state`
- Mutation tools (`save_plan`, `save_task`, etc.) call `requireAgentState()` → State Lock error on violation
- In full-stack mode: `set_agent_state("execution")` makes an RPC call to Saddlebag's Cedar engine; Cedar independently verifies `plan_approved` by checking the git-tracked plan file. BYOBrain cannot self-assert approval.
- In standalone mode: SDLC is enforced by state file alone (no Cedar verification)

---

## 7. Internal Engine

`brain.ts` — pure functions, no MCP dependencies.

| Export                               | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `resolveBrainDirAsync()`             | `BRAIN_DIR` env → `BRAIN.md` file → error         |
| `parseBrainMd()`                     | Zod-validated `BRAIN.md` config                   |
| `enforceProjectScope()`              | Blocks cross-project access when locked           |
| `readMarkdown()` / `writeMarkdown()` | YAML frontmatter parse/stringify                  |
| `mergeContextSections()`             | Section-level merge for `update_context`          |
| `slugify()` / `stableSlug()`         | URL-safe slug generation                          |
| `timestampSlug(slug)`                | Prepends `YYYY-MM-DD-HHmmss-` for artifact naming |
| `now()`                              | UTC ISO timestamp                                 |
| `harnessContext(objective, opts)`    | Assembles Block A/B/C context payload [Phase 2]   |
| `buildPermissionManifest(plan)`      | Simulates actions for batch approval [Phase 2]    |

---

## 8. Knowledge & Code Graph (Kùzu)

> See [`_architecture/graph.md`](_architecture/graph.md) for full schema and query patterns.

BYOBrain embeds **Kùzu** — a C++ in-process graph database. No server, no JVM, no Docker. ~5MB RSS base. Cypher-compatible.

**Why Kùzu over Neo4j:** Neo4j requires JVM (500MB+ RSS, 5-10s startup, Docker or JDK). Kùzu is a Node.js native binding. Zero infrastructure.

**What lives in the graph:**

- Knowledge items (with embedding vectors for similarity retrieval)
- Code structure (files, functions, classes, imports, call chains)
- Relationships between KIs and code (which function does this KI describe?)

**Code graph construction:**

- Built at `sb desk init` via tree-sitter (TypeScript, Go, Python)
- Incrementally updated on file change (fs.watch)
- Queryable via `query_graph` and `query_code_structure` MCP tools

---

## 9. Context Assembly

> See [`_architecture/context.md`](_architecture/context.md) for full block architecture and frugality details.

Every turn, BYOBrain calls `harnessContext(objective)` to build a fresh context payload — a **materialized view**, never an accumulating buffer.

### Strict Block Architecture

Prompt caching requires immutable prefixes. Progressive disclosure must never inject above cached content.

```
Block A — IMMUTABLE, ALWAYS CACHED
  HARNESS.md · desk config · skill registry (names + triggers)
  ← cache_control breakpoint →
Block B — STABLE, CACHED PER-TASK
  Active plan summary · task state · permission manifest summary
  ← cache_control breakpoint →
Block C — DYNAMIC, NEVER CACHED
  Kùzu retrieval results · code graph · loaded skill procedures
  collaboration context · frugality status · current tool results
Conversation history
```

**Rule:** Block C never injects content above Block B. Enforced by construction, not convention.

---

## 10. Brain Sync

> See [`_architecture/events.md`](_architecture/events.md) for CloudEvents schema.

Brain Sync lives **inside BYOBrain**. It is not a standalone service.

```
Session memory (ephemeral JSONL in .packmule/sessions/)
  → promoted to →
Local Kùzu (per-machine, in-process)
  → federated via →
Packmule Core Brain Federation Relay (CloudEvents append-only stream)
  → materialized on →
Teammate's local Kùzu
```

**No merge conflicts.** Knowledge events are immutable. "Updates" are new events that supersede by ID. Cursor-based catch-up on reconnect.

---

## 11. Standalone vs. Full-Stack Mode

| Feature            | Standalone            | With Saddlebag         | Full Packmule          |
| ------------------ | --------------------- | ---------------------- | ---------------------- |
| MCP tools          | ✅ all                | ✅ all                 | ✅ all                 |
| SDLC enforcement   | File-based state      | Cedar-enforced         | Cedar-enforced         |
| Model routing      | Direct provider calls | Full gateway + routing | Full gateway + routing |
| IAM / sandbox      | None                  | Cedar + Seatbelt       | Cedar + Seatbelt       |
| Budget control     | None                  | Per-desk limits        | Per-desk limits        |
| Kùzu graph         | ✅ (Phase 2+)         | ✅ (Phase 2+)          | ✅ (Phase 2+)          |
| Brain sync         | Local only            | Local only             | CloudEvents federation |
| Presence / locks   | None                  | None                   | ✅ Cedar-enforced      |
| Linear integration | None                  | None                   | ✅ (Phase 3+)          |
| Campfire           | Local dashboard       | Full-featured          | Full-featured          |

---

## 12. Configuration

### `BRAIN.md` (per-repo, gitignored)

```yaml
brain_dir: /absolute/path/to/brain
project: my-project
```

### `.packmule.toml` (desk-level, committed)

```toml
[llm]
default_provider = "anthropic"
default_model    = "claude-sonnet-4-20250514"

[llm.routing]
plan      = "claude-opus-4-20250514"
implement = "claude-sonnet-4-20250514"
classify  = "ollama/gemma3:2b"

[llm.budget]
daily_limit_usd = 50.00
```

Path-level override (`apps/ml/.packmule.toml`):

```toml
[llm]
default_provider = "google"
default_model    = "gemini-2.5-pro"
```

### Environment Variables

| Var                   | Description                              |
| --------------------- | ---------------------------------------- |
| `BRAIN_DIR`           | Absolute path to brain directory         |
| `BYOBRAIN_SOCKET`     | Path to Saddlebag Unix socket (optional) |
| `PORT` / `NITRO_PORT` | Dashboard port (set by server, not user) |
| `PROJECT`             | Locked project name (passed to Campfire) |

---

## 13. Build & Test

```bash
# Install
npm install

# Build MCP server (TypeScript → build/)
npm run build

# Dev watch mode
npm run dev

# Run tests
npm test                 # vitest run
npm run test:coverage    # with v8 coverage

# Inspect MCP tools interactively (browser UI)
npm run inspect

# Build dashboard (Campfire)
cd dashboard && pnpm build
```

### Test Structure

```
test/
├── brain.test.ts          # Core library unit tests
├── state-machine.test.ts  # SDLC enforcement
├── tools/
│   ├── plans.test.ts
│   ├── knowledge.test.ts
│   └── ...
├── graph.test.ts          # Kùzu integration [Phase 2]
├── context.test.ts        # Block architecture tests [Phase 2]
└── mcp-compliance.test.ts # Full MCP client harness
```
