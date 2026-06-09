# Packmule Sandbox — Architecture

> Packmule Sandbox is a **first-class, named, versioned component** — not a side effect of
> Cedar evaluation. Cedar permits are compiled into OS sandbox profiles. The sandbox enforces
> what Cedar decides, at the OS level.

---

## What It Does

```
Cedar permit(principal, action, resource)
        ↓
  Profile Generator (sb sandbox compile)
        ↓
  OS Primitive
  ├── macOS:  Seatbelt profile (sandbox-exec)
  ├── Linux:  Landlock (FS) + seccomp-bpf (syscalls)
  └── Node:   --permission flags
        ↓
  Process runs inside profile
  Write outside allowed paths → OS DENIED
  (Not a log. A physical barrier.)
```

---

## Sandbox Layers

| Layer | Mechanism | What It Constrains |
|---|---|---|
| OS filesystem | Seatbelt / Landlock | Path read/write, mkdir, rename |
| OS network | Seatbelt / seccomp | Socket creation, connect |
| OS syscalls | seccomp-bpf (Linux) | Allowed syscall allowlist |
| Node.js runtime | `--permission` flags | FS, network, child_process |
| Cedar PDP | cedar-go | Logical evaluation before execution |

Defense in depth: Cedar says no → action never attempted. Cedar says yes → OS sandbox still enforces the declared paths.

---

## Cedar → Sandbox Profile Compilation

When a session starts (or policies change), Saddlebag compiles the active Cedar policy for the agent into a sandbox profile:

```bash
sb sandbox compile \
  --agent myproject-impl \
  --desk myproject \
  --platform macos \
  --output /tmp/packmule/myproject-impl.sb

# Produced profile (macOS Seatbelt):
(version 1)
(allow file-read* (subpath "/Users/guttenplan/code/myproject/src"))
(allow file-write* (subpath "/Users/guttenplan/code/myproject/src/auth"))
(allow file-write* (subpath "/Users/guttenplan/code/myproject/tests/auth"))
(allow process-exec (literal "/usr/bin/git"))
(allow network-outbound (remote tcp "api.anthropic.com:443"))
(deny network-outbound)
(deny default)
```

---

## Cedar-Enforced File Locks

When Agent A acquires a lock on `auth.ts`, Saddlebag dynamically injects a transient `forbid` rule and recompiles affected agents' sandbox profiles:

```cedar
// Injected dynamically — not persisted to desk/
forbid(
  principal,
  action == Action::"file.write",
  resource == Path::"./src/auth.ts"
) unless { principal == Agent::"myproject-impl" };
```

The result: Agent B's sandbox profile no longer includes `auth.ts` in allowed write paths. The write physically fails at the OS level — not advisory, not logged and allowed.

Lock operations:
```bash
sb lock acquire ./src/auth.ts --agent myproject-impl
sb lock release ./src/auth.ts --agent myproject-impl
sb lock list                  # active locks with holders and expiry
sb lock break ./src/auth.ts   # admin override (audited)
```

---

## Standalone Use

Packmule Sandbox is independently useful without the rest of the stack:

```bash
# Run a command in a sandbox with explicit allow-lists
sb sandbox exec \
  --allow-read ./src \
  --allow-write ./build \
  --allow-exec npm \
  -- npm run build

# Compile a Cedar policy to a platform sandbox profile
sb sandbox compile \
  --policy ./desk/policy.cedar \
  --platform macos \
  --output sandbox.sb

# Red-team a sandbox profile
sb sandbox test \
  --profile sandbox.sb \
  --red-team          # attempts escape scenarios; reports violations
```

```typescript
// SDK usage
import { PacmuleSandbox } from '@packmule/sandbox';

const sandbox = new PacmuleSandbox({
  allowRead: ['./src'],
  allowWrite: ['./build'],
  allowExec: ['npm', 'git'],
  allowNetwork: ['api.anthropic.com:443'],
});

await sandbox.exec('npm run build');
```

---

## Foundation

Built on `@anthropic-ai/sandbox-runtime`, extended with:
- Packmule Profile Generator (Cedar → OS profile)
- Dynamic profile recompilation (lock events trigger recompile)
- Red-team test suite (escape scenario corpus)
- Cross-platform: macOS Seatbelt + Linux Landlock/seccomp

---

## Security Properties

| Property | Guarantee |
|---|---|
| FS containment | Writes outside declared paths → OS denied (not advisory) |
| Network containment | Connections to undeclared hosts → OS denied |
| Lock enforcement | Locked files → removed from allowlist until released |
| Sub-agent isolation | Sub-agents get same-or-narrower profiles as parent |
| Audit | Every sandbox violation emits `com.packmule.sandbox.violation` CloudEvent |
| Escalation | Repeated violations → session termination |
