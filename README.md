# BYOBrain

[![npm version](https://img.shields.io/npm/v/byobrain-mcp.svg)](https://www.npmjs.com/package/byobrain-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Persistent cross-agent working memory via MCP.**

An [MCP](https://modelcontextprotocol.io) server that gives any AI coding agent persistent, structured working memory. You supply a brain directory; BYOBrain manages context, plans, and issues across conversations, agents, and IDEs.

```bash
npx byobrain-mcp
```

## Why

Every new AI conversation starts cold. You re-explain your project, your stack, your current blockers. Insights from one agent are invisible to another. There's no shared memory layer.

BYOBrain fixes this. One brain directory. Any MCP-compatible agent reads it at conversation start, writes to it at conversation end.

- **BYO** — you own your data. Plain markdown files on your filesystem.
- **Agent-agnostic** — works with any MCP client (Claude Desktop, Claude Code, Cursor, Windsurf, Gemini).
- **Human-readable** — brain files are markdown. Open them in Obsidian, VS Code, or `cat` them.
- **Zero infrastructure** — no database, no server process, no auth. Just files.

## Quick Start

### 1. Configure your MCP client

**Claude Desktop / Claude Code** (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "byobrain": {
      "command": "npx",
      "args": ["-y", "byobrain-mcp"],
      "env": {
        "BRAIN_DIR": "/path/to/your/brain"
      }
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
      "env": {
        "BRAIN_DIR": "/path/to/your/brain"
      }
    }
  }
}
```

### 2. Bootstrap a project

Use the `bootstrap` prompt or run manually:

```
> init_brain
> init_project({ project: "myapp" })
> link_repo({ project: "myapp", repo_path: "/path/to/myapp" })
```

### 3. Work normally

Your agent reads context at conversation start and updates it at conversation end.

## Usage

### Test locally with MCP Inspector

```bash
# Clone and build
git clone https://github.com/marcusguttenplan/byobrain-mcp
cd byobrain-mcp
npm install
npm run build

# Start the MCP Inspector (opens browser UI)
BRAIN_DIR=/path/to/your/brain npm run inspect
```

The Inspector lets you browse tools, call them interactively, and verify resources — all before configuring any client.

### Run directly

```bash
# Via npx (no install needed)
BRAIN_DIR=/path/to/your/brain npx byobrain-mcp

# Or after global install
npm install -g byobrain-mcp
BRAIN_DIR=/path/to/your/brain byobrain-mcp
```

The server communicates over stdio (JSON-RPC). MCP clients spawn it automatically — you typically don't need to run it manually.

## Brain Directory Structure

```
brain/
├── README.md
├── projects/
│   └── myapp/
│       ├── context.md          # Current state, decisions, architecture
│       ├── plans/              # Active implementation plans
│       │   └── api-redesign.md
│       └── issues/             # Active blockers, bugs
│           └── docker-build.md
└── scratchpad.md               # Short-lived cross-session notes
```

## Tools

| Tool | Description |
|------|-------------|
| `init_brain` | Create brain directory structure |
| `init_project` | Create a project with context.md, plans/, issues/ |
| `link_repo` | Drop a BRAIN.md pointer into a repository |
| `read_context` | Read a project's context.md |
| `update_context` | Section-level merge into context.md |
| `list_issues` | List issues (skips resolved by default) |
| `get_issue` | Get full issue content |
| `create_issue` | Create an issue with frontmatter |
| `resolve_issue` | Mark issue resolved with notes |
| `list_plans` | List implementation plans |
| `get_plan` | Get full plan content |
| `save_plan` | Create or update a plan |
| `read_scratchpad` | Read scratchpad contents |
| `append_scratchpad` | Append timestamped note |

## Resources

Browse brain content via `byobrain://` URIs:

| URI | Content |
|-----|---------|
| `byobrain://projects` | Project list |
| `byobrain://projects/{name}/context` | Project context |
| `byobrain://projects/{name}/issues` | Issue index |
| `byobrain://projects/{name}/plans` | Plan index |
| `byobrain://scratchpad` | Scratchpad |

## Prompts

| Prompt | Description |
|--------|-------------|
| `bootstrap` | Guided project setup workflow |
| `update_brain` | End-of-session brain update workflow |

## Per-Repo Configuration

Link a repo to the brain by placing a `BRAIN.md` at its root:

```yaml
# BRAIN.md
brain_dir: /path/to/brain
project: myapp
```

The `link_repo` tool creates this file for you.

`BRAIN.md` fields are validated with a strict schema:

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `brain_dir` | string | ✅ | Non-empty absolute path |
| `project` | string | ✅ | Alphanumeric with hyphens/underscores |

Invalid `BRAIN.md` files produce clear error messages at startup.

## Docker

### Build

```bash
docker build -t byobrain-mcp .
```

### Run

```bash
# Mount your brain directory into the container
docker run -i --rm \
  -v /path/to/your/brain:/brain \
  byobrain-mcp
```

### MCP client config (Docker)

```json
{
  "mcpServers": {
    "byobrain": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/path/to/your/brain:/brain",
        "byobrain-mcp"
      ]
    }
  }
}
```

## Development

```bash
npm install
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm run inspect        # MCP Inspector (browser UI)
npm test               # Run tests (vitest)
```

## License

MIT
