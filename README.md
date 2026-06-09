# BYOBrain

[![npm version](https://img.shields.io/npm/v/byobrain-mcp.svg)](https://www.npmjs.com/package/byobrain-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Persistent cross-agent working memory and spec-driven SDLC via MCP.**

An [MCP](https://modelcontextprotocol.io) server that gives any AI coding agent persistent, structured working memory, enforces a four-phase development workflow, and maintains a local knowledge graph. You supply a brain directory; BYOBrain handles the rest.

```bash
npx byobrain-mcp
```

---

## Why

Every new AI conversation starts cold. You re-explain your project, your stack, your current blockers. Insights from one agent are invisible to another. Agents skip planning, hallucinate that specs exist, and drift from agreed-upon approaches.

BYOBrain fixes the memory and discipline problems:

- **Persistent memory** — one brain directory shared across all agents, sessions, and IDEs
- **Spec-driven SDLC** — a four-phase state machine (research → plan → execute → verify) enforced at the tool layer, not by prompt
- **Human-readable** — plain markdown files; open in Obsidian, VS Code, or `cat`
- **Agent-agnostic** — any MCP-compatible IDE (Claude Desktop, Claude Code, Cursor, Windsurf, Antigravity)
- **Zero infrastructure** — no server, no database, no auth in standalone mode

---

## Part of the Packmule Stack

BYOBrain is the **brain** — the reasoning and memory layer. It operates standalone or as part of the Packmule harness:

```
saddlebag → packmule → byobrain → campfire / IDE
(credentials,         (memory,     (dashboard)
 gateway, IAM)         SDLC)
```

| Mode | What You Get |
|---|---|
| **Standalone** | Persistent memory, SDLC enforcement, local knowledge graph, Campfire dashboard |
| **With Saddlebag** | + Model routing, cost control, IAM, OS-level sandbox |
| **Full Packmule** | + Team collaboration, brain federation, Linear integration, presence, Cedar file locks |

---

## Quick Start

### 1. Configure your IDE

**Claude Desktop / Claude Code** (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "byobrain": {
      "command": "npx",
      "args": ["-y", "byobrain-mcp"],
      "env": { "BRAIN_DIR": "/path/to/your/brain" }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "byobrain": {
      "command": "npx",
      "args": ["-y", "byobrain-mcp"],
      "env": { "BRAIN_DIR": "/path/to/your/brain" }
    }
  }
}
```

**Antigravity** (`~/.gemini/config.json`):
```json
{
  "mcpServers": {
    "byobrain": {
      "command": "npx",
      "args": ["-y", "byobrain-mcp"],
      "env": { "BRAIN_DIR": "/path/to/your/brain" }
    }
  }
}
```

### 2. Bootstrap a project

```
> init_brain
> init_project({ project: "myapp" })
> link_repo({ project: "myapp", repo_path: "/path/to/myapp" })
```

`link_repo` creates a `BRAIN.md` at the repo root and writes tailored agent instruction files (`CLAUDE.md`, `GEMINI.md`) that enforce the brain protocol.

### 3. Work normally

Your agent reads context at conversation start, follows the SDLC state machine, and updates the brain at the end of each session.

---

## SDLC State Machine

BYOBrain enforces a strict four-phase workflow per project:

```
research ──► planning ──► execution ──► verification
                              ↑               │
                              └───────────────┘ (iterate)
```

| Phase | State | What You Do | Locked Tools |
|---|---|---|---|
| **Research** | `research` | Explore, read context, check knowledge | Mutation tools locked |
| **Plan** | `planning` | Write implementation plan; wait for human approval | `save_task`, `save_walkthrough` |
| **Execute** | `execution` | Implement; update task checklist turn-by-turn | `save_plan` |
| **Verify** | `verification` | Test, lint, validate; write walkthrough | — |

Attempting to use a locked tool returns a **State Lock error** — not a suggestion, an error.

---

## Brain Directory

```
brain/
├── scratchpad.md
├── knowledge/
│   └── {YYYY-MM-DD-HHmmss-slug}.md
└── projects/
    └── {project}/
        ├── context.md
        ├── .agent_state
        ├── plans/
        ├── tasks/
        ├── walkthroughs/
        ├── commands/
        └── issues/
```

All files are plain markdown with YAML frontmatter. Artifacts are named `YYYY-MM-DD-HHmmss-{slug}.md` for chronological sorting and deduplication.

---

## Tools

| Group | Tools |
|---|---|
| Init | `init_brain`, `init_project`, `link_repo` |
| Context | `read_context`, `update_context` |
| Issues | `list_issues`, `get_issue`, `create_issue`, `resolve_issue` |
| Plans | `list_plans`, `get_plan`, `save_plan`, `prune_plans` |
| Tasks | `list_tasks`, `get_task`, `save_task`, `prune_tasks` |
| Walkthroughs | `list_walkthroughs`, `get_walkthrough`, `save_walkthrough` |
| Commands | `list_commands`, `get_command`, `save_command` |
| Knowledge | `list_knowledge`, `get_knowledge`, `save_knowledge` |
| Scratchpad | `read_scratchpad`, `append_scratchpad` |
| State | `get_agent_state`, `set_agent_state` |
| UI | `get_dashboard_url` |

---

## Resources

Browse brain content via `byobrain://` URIs:

```
byobrain://projects
byobrain://projects/{project}/context
byobrain://projects/{project}/plans[/{slug}]
byobrain://projects/{project}/tasks[/{slug}]
byobrain://projects/{project}/walkthroughs[/{slug}]
byobrain://projects/{project}/issues[/{slug}]
byobrain://projects/{project}/commands[/{slug}]
byobrain://knowledge[/{slug}]
byobrain://scratchpad
```

---

## Run with Dashboard

```bash
BRAIN_DIR=/path/to/brain npx byobrain-mcp --ui
# or: byobrain-mcp --ui --port 3001

# Get URL from agent
> get_dashboard_url
```

---

## Docker

```bash
docker build -t byobrain-mcp .
docker run -i --rm -v /path/to/brain:/brain byobrain-mcp
```

MCP config (Docker):
```json
{
  "mcpServers": {
    "byobrain": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "/path/to/brain:/brain", "byobrain-mcp"]
    }
  }
}
```

---

## Development

```bash
npm install
npm run build          # tsc → build/
npm run dev            # watch mode
npm run inspect        # MCP Inspector (browser UI)
npm test               # vitest
npm run test:coverage  # with v8 coverage
```

### Architecture docs

See [`_architecture/`](_architecture/) for detailed design documentation:

| Doc | What |
|---|---|
| [README.md](_architecture/README.md) | System overview, runtime model, MCP surface |
| [identity.md](_architecture/identity.md) | Identity model, JWT claims, policy tiers |
| [gateway.md](_architecture/gateway.md) | Model gateway, routing, normalization, Ollama |
| [graph.md](_architecture/graph.md) | Kùzu schema, code graph, knowledge retrieval |
| [context.md](_architecture/context.md) | Context assembly, block architecture, frugality |
| [sandbox.md](_architecture/sandbox.md) | Packmule Sandbox, Seatbelt/Landlock, Cedar compilation |
| [events.md](_architecture/events.md) | CloudEvents schema, event bus, brain federation |

---

## License

MIT
