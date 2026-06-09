# CloudEvents & Event Bus — Architecture

> Packmule uses [CNCF CloudEvents v1.0](https://cloudevents.io) for all structured events.
> This ensures Campfire can consume events from any CloudEvents-compatible system, and
> Packmule events can forward to Pub/Sub, EventBridge, Kafka, or any CloudEvents sink.

---

## Why CloudEvents

CloudEvents is a CNCF specification for describing events in a common format. Using it:
- Makes Campfire a **generic** agent dashboard, not just a Packmule-specific one
- Enables forwarding to cloud event buses without custom adapters
- Provides a stable, versioned event contract for inter-component communication
- Allows any CloudEvents-compliant producer to integrate with Packmule's event infrastructure

---

## Base Schema

All Packmule events conform to CloudEvents v1.0:

```json
{
  "specversion": "1.0",
  "id": "01HZ3K2M7V...",
  "source": "packmule/{component}/{desk}-{phase}",
  "type": "com.packmule.{domain}.{action}",
  "datacontenttype": "application/json",
  "time": "2026-06-09T14:30:00Z",
  "traceparent": "00-abc123...",
  "data": { ... }
}
```

`traceparent` follows W3C Trace Context. All events carry the same trace ID as the operation that produced them — enabling full end-to-end trace replay in Campfire.

---

## Event Type Registry

### Agent Lifecycle

```
com.packmule.agent.started
com.packmule.agent.state.changed
com.packmule.agent.file.focused        # agent is actively editing a file
com.packmule.agent.completed
com.packmule.agent.failed
com.packmule.agent.spawned             # sub-agent spawned
com.packmule.agent.terminated          # sub-agent terminated
```

### Plan & Task

```
com.packmule.plan.created
com.packmule.plan.approved             # human approved plan
com.packmule.plan.rejected
com.packmule.plan.completed
com.packmule.task.created
com.packmule.task.started
com.packmule.task.completed
```

### Knowledge

```
com.packmule.knowledge.created         # new KI
com.packmule.knowledge.updated         # supersedes previous version
com.packmule.knowledge.deprecated      # marks KI as stale
com.packmule.knowledge.federated       # local KI published to brain relay
```

### Cost & Budget

```
com.packmule.cost.request              # every model request (per-token)
com.packmule.cost.threshold            # warn_at_usd crossed
com.packmule.cost.limit                # daily_limit_usd reached
com.packmule.cost.rollup               # daily/weekly summary
```

### Policy & Security

```
com.packmule.policy.decision           # Cedar evaluation result
com.packmule.policy.changed            # policy file updated
com.packmule.policy.manifest.submitted # batch permission manifest submitted
com.packmule.policy.manifest.approved  # manifest approved by human
com.packmule.sandbox.violation         # OS sandbox denied an action
```

### Collaboration

```
com.packmule.lock.acquired
com.packmule.lock.released
com.packmule.lock.broken               # admin override
com.packmule.presence.online
com.packmule.presence.offline
com.packmule.presence.heartbeat
```

---

## Example Events

### Agent state change

```json
{
  "specversion": "1.0",
  "id": "01HZ3K2M7V-abc",
  "source": "packmule/byobrain/myproject-impl",
  "type": "com.packmule.agent.state.changed",
  "time": "2026-06-09T14:30:00Z",
  "traceparent": "00-abc123-def456-01",
  "data": {
    "desk": "myproject",
    "agent": "myproject-impl",
    "user": "guttenplan@company.com",
    "device_id": "mbp-14-uuid-abc123",
    "from_state": "planning",
    "to_state": "execution",
    "plan_id": "plan-2026-06-09-130543-auth-overhaul",
    "session_id": "sess-xyz"
  }
}
```

### Model request (cost)

```json
{
  "specversion": "1.0",
  "id": "01HZ3K2M8A-def",
  "source": "packmule/saddlebag/gateway",
  "type": "com.packmule.cost.request",
  "time": "2026-06-09T14:30:01Z",
  "traceparent": "00-abc123-def456-01",
  "data": {
    "desk": "myproject",
    "agent": "myproject-impl",
    "user": "guttenplan@company.com",
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "task_type": "implement",
    "input_tokens": 4821,
    "output_tokens": 892,
    "cache_read_tokens": 3200,
    "cost_usd": 0.0183,
    "local": false,
    "latency_ms": 1842
  }
}
```

### File lock acquired

```json
{
  "specversion": "1.0",
  "id": "01HZ3K2M9B-ghi",
  "source": "packmule/saddlebag/cedar",
  "type": "com.packmule.lock.acquired",
  "time": "2026-06-09T14:30:05Z",
  "traceparent": "00-abc123-def456-01",
  "data": {
    "path": "./src/auth.ts",
    "holder": "myproject-impl",
    "user": "guttenplan@company.com",
    "expires_at": "2026-06-09T15:30:05Z"
  }
}
```

---

## Transport

### Local event bus

Saddlebag runs a WebSocket server that all local components (BYOBrain, Campfire, sub-agents) subscribe to:

```
ws://localhost:{sb-port}/events
```

Subscriptions filtered by event type patterns (glob):
```typescript
await bus.subscribe('com.packmule.cost.*', handleCost);
await bus.subscribe('com.packmule.lock.*', handleLock);
await bus.subscribe('com.packmule.*', logAll);
```

### Brain federation relay

For team knowledge sync, events in the `com.packmule.knowledge.*` namespace are forwarded to a relay (HTTP append-only JSONL log):

```
POST {relay_url}/events          # publish
GET  {relay_url}/events?after={cursor}  # poll
```

Cursor-based polling. On reconnect, catch up from last cursor. **No merge conflicts** — events are immutable. Superseding events reference the original by ID.

### External sinks

CloudEvents format enables direct forwarding to any sink:
```
Google Cloud Pub/Sub   (push subscription)
AWS EventBridge
Azure Event Grid
Kafka (CloudEvents encoding)
Webhook
```

---

## Campfire Subscription

Campfire subscribes to the local event bus and renders events in real time. When operating in standalone mode, it accepts any WebSocket or SSE stream emitting CloudEvents:

```
Campfire → ws://localhost:{sb-port}/events        # Packmule stack
Campfire → ws://any-other-agent-system/events     # Any CloudEvents source
```

---

## Event Validation

All emitted events are validated against the CloudEvents JSON Schema in tests:
```bash
npm run test -- events    # validates all event shapes
```

CI gate: any event that fails schema validation blocks the build.
