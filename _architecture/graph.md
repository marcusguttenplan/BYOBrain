# Knowledge & Code Graph — Architecture

> **Kùzu** is an embedded C++ graph database with Cypher-compatible query language.
> It lives **inside BYOBrain** as a Node.js native binding — in-process, no server,
> no JVM, no Docker. ~5MB RSS base. Cypher-compatible. Zero-weight infrastructure.

---

## Why Kùzu, Not Neo4j

| Concern | Neo4j | Kùzu |
|---|---|---|
| Runtime | JVM server process | C++ in-process library |
| Memory footprint | 500MB+ RSS | ~5MB base + data |
| Startup | 5–10 seconds | Instant (library load) |
| Query language | Cypher | Cypher-compatible |
| Node.js interface | Bolt driver (network) | Native binding (in-process) |
| Dependencies | JDK or Docker required | None |
| Infrastructure | Server-based | Embedded (like SQLite) |

---

## What Lives in the Graph

Two logically separate graphs sharing one Kùzu database:

1. **Knowledge Graph** — durable facts extracted from agent work
2. **Code Graph** — structural understanding of the codebase (built by tree-sitter)

Combined: "which knowledge items relate to this function?" and "what does this function call?"

---

## Schema

```cypher
-- Knowledge items
CREATE NODE TABLE KnowledgeItem(
  id         STRING,
  title      STRING,
  summary    STRING,
  body       STRING,
  scope      STRING,    -- 'project' | 'user' | 'team' | 'org' | 'public'
  confidence STRING,    -- 'unverified' | 'verified' | 'deprecated'
  created_by STRING,    -- agent principal
  user       STRING,    -- human who ran the agent
  device_id  STRING,    -- machine identity
  created_at TIMESTAMP,
  trace_id   STRING,    -- W3C traceparent
  embedding  FLOAT[768],
  PRIMARY KEY (id)
);

-- Code structure
CREATE NODE TABLE File(
  path       STRING PRIMARY KEY,
  language   STRING,
  size       INT64,
  last_modified TIMESTAMP
);

CREATE NODE TABLE Function(
  id         STRING PRIMARY KEY,
  name       STRING,
  signature  STRING,
  start_line INT64,
  end_line   INT64
);

CREATE NODE TABLE Class(
  id         STRING PRIMARY KEY,
  name       STRING,
  start_line INT64,
  end_line   INT64
);

CREATE NODE TABLE Module(
  name       STRING PRIMARY KEY,
  path       STRING
);

CREATE NODE TABLE Tag(name STRING PRIMARY KEY);

-- Relationships
CREATE REL TABLE DEFINED_IN(FROM Function TO File);
CREATE REL TABLE DEFINED_IN(FROM Class TO File);
CREATE REL TABLE CALLS(FROM Function TO Function);
CREATE REL TABLE HAS_METHOD(FROM Class TO Function);
CREATE REL TABLE IMPORTS(FROM File TO Module);

CREATE REL TABLE ABOUT(FROM KnowledgeItem TO Function);
CREATE REL TABLE REFERENCES(FROM KnowledgeItem TO File);
CREATE REL TABLE TAGGED(FROM KnowledgeItem TO Tag);
CREATE REL TABLE DERIVED_FROM(FROM KnowledgeItem TO KnowledgeItem);
```

---

## Code Graph Construction

### Initialization

```bash
sb desk init    # or: byobrain init_project
```

1. tree-sitter parses all source files (TypeScript, Go, Python, more via plugin)
2. Functions, classes, imports, exports extracted
3. Call chains resolved where deterministic
4. All nodes/edges inserted into Kùzu

For large repos: parallel parse, streamed insert. Incremental from git diff.

### Incremental Updates

`fs.watch` on desk directory. On file change:
1. Re-parse changed file
2. Diff against existing Kùzu nodes for that file
3. Delete stale nodes; insert new nodes; update edges

### Language Support

| Language | Parser | Captures |
|---|---|---|
| TypeScript / JavaScript | tree-sitter-typescript | Functions, classes, interfaces, imports, exports, call sites |
| Go | tree-sitter-go | Functions, structs, interfaces, imports |
| Python | tree-sitter-python | Functions, classes, imports |
| Any | LSP (fallback) | Symbols, definitions, references |

---

## Knowledge Item Lifecycle

```
Agent produces insight
      ↓
append_scratchpad (ephemeral)
      ↓
save_knowledge  (markdown file in brain_dir/knowledge/)
      ↓
Kùzu ingestion  (embedding generated, node inserted)
      ↓
Retrieval in harness_context (similarity query)
      ↓
[optional] Brain Sync → federated to teammates
```

### Knowledge Item Schema

Filename: `{YYYY-MM-DD-HHmmss}-{slug}.md`

```yaml
---
id: ki-2026-06-09-143000-firestore-pagination
title: "Firestore pagination requires startAfter, not offset"
summary: "Offset queries scan the entire collection. Use cursor-based pagination."
tags: [firestore, pagination, performance]
scope: project
confidence: verified
source:
  agent: myproject-impl
  user: guttenplan@company.com
  device_id: mbp-14-uuid-abc123
  session_id: sess-xyz
  trace: 00-abc123...
  derived_from: walkthrough-2026-06-09-fix-pagination
references:
  - byobrain://projects/myproject/walkthroughs/2026-06-09-143000-fix-pagination
  - file:///src/api/submissions.get.ts#L45-L60
---

Full body of the knowledge item...
```

---

## Query Patterns

### Agent context retrieval (embedding similarity)

```cypher
// Get top-5 knowledge items most relevant to this objective
MATCH (ki:KnowledgeItem)
WHERE ki.scope IN ['project', 'user', 'team']
  AND ki.confidence != 'deprecated'
RETURN ki.id, ki.title, ki.summary,
       vector_similarity(ki.embedding, $query_embedding) AS score
ORDER BY score DESC
LIMIT 5
```

### Code graph queries

```cypher
// What functions call authenticate()?
MATCH (caller:Function)-[:CALLS]->(callee:Function)
WHERE callee.name = 'authenticate'
RETURN caller.name, caller.signature

// What does auth.ts import?
MATCH (f:File)-[:IMPORTS]->(m:Module)
WHERE f.path ENDS WITH 'auth.ts'
RETURN m.name, m.path

// Knowledge items related to a function
MATCH (ki:KnowledgeItem)-[:ABOUT]->(fn:Function)
WHERE fn.name = 'authenticate'
RETURN ki.title, ki.summary
```

### MCP tools

```
query_graph("MATCH (ki:KnowledgeItem) WHERE ...")          # raw Cypher
query_code_structure("what calls authenticate()")           # natural language → Cypher
```

---

## Storage Layout

```
~/.packmule/
└── graph/
    └── {desk-id}/
        ├── kuzu.db                 # Kùzu data directory
        └── embeddings.bin          # embedding vectors (HNSW index)
```

Kùzu data directory is portable — copy it to share or back up the graph.
