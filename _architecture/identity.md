# Identity — Architecture

> **Vision:** Packmule Identity becomes the AWS IAM for agents in organizations. A standard,
> externalized identity service that any agent framework can use to issue, scope, audit, and
> revoke agent capabilities — with the same rigor as human IAM.

---

## Two-Layer Identity Model

### Layer 1: Local (file / action / tool level)

Controls what an agent can do on this machine. Enforced by Cedar (PDP) + OS primitives (PEP).

| Concern        | Mechanism                                         |
| -------------- | ------------------------------------------------- |
| File access    | Cedar path policies → Seatbelt/Landlock profiles  |
| Tool execution | Cedar action policies → Node `--permission` flags |
| Shell commands | Cedar command policies → sandbox subprocess       |
| Network access | Cedar network policies → network proxy / Seatbelt |

### Layer 2: Remote (user / agent / machine / org)

Controls what an agent can do on cloud resources.

| Concern          | Mechanism                                                 |
| ---------------- | --------------------------------------------------------- |
| User identity    | OIDC (Google, GitHub, corporate IdP) or OAuth 2.0         |
| Agent identity   | Packmule-issued short-lived JWT                           |
| Machine identity | Instance identity document or mTLS cert                   |
| Cloud resources  | Agent JWT → STS token exchange → scoped cloud credentials |

---

## Agent JWT

Every agent that runs under Packmule receives a short-lived JWT (~60 minutes). The JWT is issued by Packmule Core and verified by Saddlebag's Cedar engine.

```json
{
  "sub": "myproject-impl",
  "user": "guttenplan@company.com",
  "device_id": "mbp-14-uuid-abc123",
  "machine_fingerprint": "sha256:def456...",
  "desk": "myproject",
  "project": "myproject",
  "phase": "execution",
  "plan_id": "plan-2026-06-09-130543-auth-overhaul",
  "session_id": "sess-xyz",
  "iat": 1749478200,
  "exp": 1749481800
}
```

Every Cedar decision, tool call, and model request is attributable to a specific human on a specific device running a specific plan. Full compliance attribution.

---

## Cedar Principals

Principal naming convention: `$project-$phase`

```
User::"guttenplan@company.com"
Device::"mbp-14-uuid-abc123"
Agent::"myproject-plan"           # planning agent for myproject
Agent::"myproject-impl"           # implementation agent
Agent::"myproject-review"         # review agent
Agent::"io26-swag-impl"           # impl agent for a different project
Agent::"myproject-impl:sub-01"    # sub-agent under the implementation agent
```

Sub-agents inherit parent's desk policy + sandbox constraints. They cannot grant themselves permissions the parent doesn't have.

---

## Policy Tiers

| Tier | Directory  | Mutability                      | Scope                     |
| ---- | ---------- | ------------------------------- | ------------------------- |
| 1    | `default/` | Immutable — ships with Packmule | Universal baseline safety |
| 2    | `org/`     | Org-admin managed               | Company-wide              |
| 3    | `team/`    | Team-lead managed               | Team                      |
| 4    | `desk/`    | Per-project, git-tracked        | Project                   |
| 5    | `user/`    | User preferences, local only    | Personal                  |

**Merge rule:** `forbid` always wins. `default > org > team > desk > user`. Lower tiers narrow, never widen.

### Default Policy (Phase 1 Dev Mode)

```cedar
// default/dev-mode.cedar — Phase 1 only
// Permissive for local; deny for external/irreversible

permit(principal is Agent, action in [
  Action::"file.read", Action::"file.write",
  Action::"shell.exec", Action::"git"
], resource);

forbid(principal, action in [
  Action::"deploy", Action::"db.migrate",
  Action::"network.external", Action::"secret.read"
]) unless { context.human_approved == true };
```

### Auto-Generated Policy (from batch approvals)

```cedar
// Auto-generated: 2026-06-09T14:30:00Z by guttenplan via approval
// session: sess-xyz · plan: plan-2026-06-09-130543-auth-overhaul
permit(
  principal == Agent::"myproject-impl",
  action == Action::"file.write",
  resource in Path::"./apps/ml"
) when { context.plan_approved == true };
```

---

## Batch Permission Manifests

Agents move faster than humans. Per-action prompts kill adoption. The fix is a pre-execution manifest.

```
Planning phase:
  Agent simulates intended actions
        ↓
  Generates manifest:
    "Read ./src/**
     Write ./src/auth/* and ./tests/auth/*
     Shell: npm test, git commit"
        ↓
  Cedar evaluates against existing policies
  (some may already be permitted)
        ↓
  ONE batch approval prompt to developer
  (can narrow: "allow write, but not ./src/auth/secrets.ts")
        ↓
  Cedar generates session-scoped rules
  covering all approved actions
        ↓
Execution phase:
  Pre-approved actions → auto-allowed, no prompts
  Unanticipated action → single prompt, option to expand manifest
```

---

## Tamper-Proof Plan Approval

`context.plan_approved` is never set by BYOBrain. Saddlebag independently verifies:

1. Git-tracked plan file exists and parses cleanly
2. YAML frontmatter contains `status: approved`
3. Approval commit matches expected author
4. (Optional, Phase 3+) GPG signature on approval commit

---

## External Gateway Access

Third-party consumers (Claude Code, Cursor, scripts) access the gateway via OAuth:

```bash
sb auth login          # OAuth device flow → browser → token → system keychain
sb auth status         # show current identity + expiry
sb auth logout

export OPENAI_BASE_URL="http://localhost:$(sb gateway port)"
export OPENAI_API_KEY="$(sb auth token)"
```

All tokens carry the Cedar principal they act as. Gateway calls from Claude Code are still policy-gated under the authenticating user's identity.

---

## Identity as a Service (Roadmap)

```
Phase 1-3:  Identity embedded in Packmule Core (local)
Phase 4+:   Standalone identity service:
```

The identity service will:

- Run as a standalone binary or managed cloud service
- Issue agent JWTs to any agent framework (not just Packmule-native)
- Plug into AWS IAM Identity Center, Microsoft Entra ID, Okta, Google Workspace
- Provide org-wide agent capability dashboard and audit log
- Support delegated admin: org admins grant teams; team leads grant projects
- Enable cross-org federation (e.g., contractor agents with org-scoped permissions)

**The cloud IAM analogy:**

| Packmule Concept          | Cloud IAM Analogue           |
| ------------------------- | ---------------------------- |
| Local Cedar policy        | IAM Policy                   |
| Agent identity JWT        | Workload Identity token      |
| Desk                      | IAM Role                     |
| `plan_approved` predicate | IAM Condition key            |
| `default/` policy tier    | Permission boundary          |
| Audit log + decision log  | CloudTrail                   |
| STS token exchange        | Workload Identity Federation |
| Identity service          | AWS IAM Identity Center      |
