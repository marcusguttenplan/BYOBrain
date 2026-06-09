# Context Assembly — Architecture

> Context is a **budget**, not a buffer. Every turn, BYOBrain builds a fresh context
> payload — a materialized view, never an accumulating window. The goal: put precisely
> the right information in front of the model and nothing else.

---

## Core Problem

Two forces are in tension:

1. **Prompt caching** requires immutable content prefixes. Cache hits ≈ 0.1× input price.
2. **Progressive disclosure** loads content dynamically. If dynamic content injects above cached content, the cache breaks every turn.

**The fix:** A strict, immutable block architecture enforced by construction.

---

## Strict Block Architecture

```
┌─────────────────────────────────────────────────────┐
│  Block A — IMMUTABLE, ALWAYS CACHED                 │
│                                                     │
│  · HARNESS.md (project constitution)                │
│  · Desk config (model, routing, budget)             │
│  · Skill registry (names + when-to-use triggers)    │
│                                                     │
│  ← cache_control: { type: "ephemeral" } breakpoint  │
├─────────────────────────────────────────────────────┤
│  Block B — STABLE, CACHED PER-TASK                  │
│                                                     │
│  · Active plan (frontmatter + summary only)         │
│  · Current task state                               │
│  · Permission manifest summary                      │
│                                                     │
│  ← cache_control: { type: "ephemeral" } breakpoint  │
├─────────────────────────────────────────────────────┤
│  Block C — DYNAMIC, NEVER CACHED                    │
│                                                     │
│  · Kùzu retrieval: relevant knowledge items         │
│  · Kùzu retrieval: relevant code structure          │
│  · Loaded skill procedure (on activation)           │
│  · Collaboration context (who else, active locks)   │
│  · Frugality context (budget remaining, burn rate)  │
│  · Tool results from current turn                   │
├─────────────────────────────────────────────────────┤
│  Conversation history                               │
└─────────────────────────────────────────────────────┘
```

**Invariant: Block C never injects content above Block B.** This is enforced by `harnessContext()` construction — the order is unconditional.

---

## `harnessContext(objective, opts)` — Assembly Steps

Called at the start of every agent turn:

```typescript
async function harnessContext(objective: string, opts: ContextOpts): Promise<ContextPayload> {
  // Block A — always identical; cache hit after first turn
  const blockA = await assembleBlockA(opts.desk);

  // Block B — changes only on plan/task transition; cache hit for duration of task
  const blockB = await assembleBlockB(opts.activePlan, opts.activeTask);

  // Block C — freshly assembled each turn; precision-retrieved, never padded
  const blockC = await assembleBlockC(objective, opts);

  return { blockA, blockB, blockC, cacheBreakpoints: [blockA.end, blockB.end] };
}

async function assembleBlockC(objective: string, opts: ContextOpts): Promise<Block> {
  const [knowledge, codeGraph, skillHints, collab, frugality] = await Promise.all([
    kuzu.retrieveKnowledge(objective, { limit: 5, scope: opts.scope }),
    kuzu.retrieveCodeContext(objective, { limit: 3 }),
    skillLoader.getHints(objective),
    collab.getContext(opts.desk),
    ledger.getFrugalityContext(opts.desk),
  ]);

  // Trim to fit remaining token budget; never exceed Block C max
  return trimToTokenBudget([knowledge, codeGraph, skillHints, collab, frugality], opts.blockCMax);
}
```

---

## Three-Level Skill Disclosure

Skill content loads progressively to minimize Block A size:

```
Level 1 — In Block A (always loaded):
  SKILL.md frontmatter: name + when-to-use trigger phrase

Level 2 — In Block C (on activation):
  Full procedure / instructions (MODULE.md)

Level 3 — On demand (in Block C, as needed):
  Reference data files, examples, external docs
```

A skill is "activated" when the trigger phrase matches the current objective. Only then does its full procedure load into Block C.

---

## Token Budget Allocation

Default budget breakdown (configurable per desk):

| Block | Token Budget | Notes |
|---|---|---|
| Block A | 2,000 | Fixed; identical every turn |
| Block B | 1,500 | Changes on task transitions |
| Block C | 6,000 | Split: 3k knowledge, 1.5k code, 1.5k other |
| Conversation | Remaining | Up to model context window |

If Block C retrieval exceeds budget: trim by least-similar knowledge items first, then code context, then other. Never truncate mid-item.

---

## Progressive Disclosure for Plans

Plans use three-level disclosure in Block B:

```markdown
<!-- Level 1: Always loaded (frontmatter + summary) -->
---
id: plan-2026-06-09-130543-auth-overhaul
status: approved
---
## Summary (100 words max)
Refactor authentication module to support OIDC...

<!-- Level 2: Load on request or new task -->
## Full plan body (sections, tasks, verification)

<!-- Level 3: Load only when specifically needed -->
## Background, research notes, rejected alternatives
```

---

## Frugality Mechanisms

| Mechanism | Savings | How Measured |
|---|---|---|
| Block A prompt caching | Cache reads ≈ 0.1× input | Cache hit rate per block (in ledger) |
| Progressive disclosure | ~60% baseline context reduction | Context size per turn |
| Local model routing (classify) | ~100× cheaper | Task-type cost breakdown |
| Semantic caching (Phase 4) | 40-70% on repetitive queries | Semantic cache hit/miss ratio |
| Structured output discipline | 5-8× cheaper than prose | `max_tokens` per task type |
| Batch API routing | 50% off non-interactive | Batch vs. interactive ratio |
| Knowledge compaction | Prevents unbounded artifact growth | Artifact size over time |
| Skill ROI tracking | Surface "expensive but unused" skills | Per-skill token cost × hit rate |

### Automated Frugality Loops

```
1. Measure: Every token attributed to model/task/skill/phase
2. Analyze: Weekly rollup identifies top cost centers
3. Suggest: "Review tasks cost $12/day on Opus;
             Sonnet saves $8/day with <5% quality loss"
4. Enforce: Budget policies auto-route when budget tightens
5. Report: Campfire shows before/after cost curves
```
