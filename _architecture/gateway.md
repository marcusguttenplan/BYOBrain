# Model Gateway — Architecture

> Lives in **Saddlebag**. BYOBrain calls the gateway for all model requests.
> The gateway is independently useful — any agent or script can call it as an
> OpenAI-compatible endpoint with routing, normalization, cost control, and OAuth auth.

---

## What It Does

```
BYOBrain / External Consumer
        │  POST /v1/chat/completions (OpenAI format)
        ▼
  sb gateway (localhost HTTP)
  ┌────────────────────────────────────────────────────────────┐
  │  1. Auth: verify peer credentials or OAuth Bearer token    │
  │  2. Cedar: check quota, budget, and model permit           │
  │  3. Router: select provider + model from routing hierarchy  │
  │  4. Normalizer: rewrite request for target provider format │
  │  5. Send to provider (or Ollama)                           │
  │  6. Normalize response back to OpenAI format               │
  │  7. Ledger: append token/cost record                       │
  │  8. Events: emit cost CloudEvent                           │
  └────────────────────────────────────────────────────────────┘
        │  Stream (OpenAI delta format)
        ▼
  BYOBrain / External Consumer
```

---

## Routing Hierarchy

```
Request-level override  (X-Model header or explicit model field)
  └── Task-level routing  (X-Task-Type header)
        plan / implement / classify / review / summarize / embed
        └── Skill-level routing  (skill metadata in Block A)
              └── Path-level routing  (.packmule.toml in subdirectory)
                    └── Desk-level default  (desk config)
                          └── Global default  (~/.packmule/config.toml)
```

---

## Provider Support

| Provider | Auth | Notes |
|---|---|---|
| Anthropic | API key | Extended thinking, tool_use blocks |
| OpenAI | API key | Function calling, assistants |
| Google | API key or ADC | Gemini, function calling, grounding |
| Ollama | None | Local; no cost; `http://localhost:11434` |

---

## Local Model Support (Ollama)

The gateway has first-class Ollama support. No JVM, no cloud cost.

```toml
[llm.providers.ollama]
base_url = "http://localhost:11434"
models   = ["gemma3:latest", "gemma3:2b", "llama3.1:8b"]

[llm.routing]
classify = "ollama/gemma3:2b"     # ~zero cost; local
plan     = "claude-opus-4-20250514"
```

**How it works:**
- Gateway translates OpenAI `messages` format to Ollama `/api/chat` format
- Streams Ollama chunked response → OpenAI `data: {"choices":[{"delta":...}]}` format
- Token count: approximated via tiktoken; cost logged as `$0.00` with `"local": true`
- If Ollama is not running: falls back to next provider in fallback chain

```bash
sb model pull gemma3:2b       # pulls model via Ollama API
sb model list                 # shows all available (local + remote)
sb model benchmark gemma3:2b  # runs classify benchmark vs. remote
```

---

## Semantic Normalization Layer

Conversation history format varies significantly across providers. The gateway translates in both directions so the agent loop always speaks OpenAI format.

| Concern | Anthropic | OpenAI | Google | Ollama |
|---|---|---|---|---|
| System prompt | `"system"` top-level field | First `"system"` role message | `systemInstruction` | `"system"` role message |
| Tool calls (request) | `tools` + `tool_use` blocks | `tools` + `tool_calls` | `tools` + `functionDeclarations` | OpenAI-compatible |
| Tool results | `tool_result` content block | `"tool"` role message | `functionResponse` part | OpenAI-compatible |
| Image inputs | `"image"` source block | `image_url` in content | `inlineData` part | varies |
| Role sequencing | Strict alternation (user/assistant) | Flexible | Flexible | Flexible |
| Thinking | `extended_thinking` content | `reasoning_effort` param | `thinkingConfig` | N/A |
| Stop reason | `end_turn` / `tool_use` | `stop` / `tool_calls` | `STOP` / `MAX_TOKENS` | `stop` |

**Normalization guarantees:**
- Strict alternation enforced for Anthropic (inject synthetic assistant turn if needed)
- All tool calls converted to OpenAI format before reaching the agent
- System prompt merged into first message if provider doesn't support top-level system
- Unsupported features (e.g., vision to text-only model) logged and stripped with warning

---

## Token Ledger

Every request appended to an immutable JSONL log:

```json
{
  "id": "01HZ3K2M7V...",
  "timestamp": "2026-06-09T14:30:00Z",
  "trace": "00-abc123...",
  "desk": "myproject",
  "agent": "myproject-impl",
  "user": "guttenplan@company.com",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "task_type": "implement",
  "input_tokens": 4821,
  "output_tokens": 892,
  "cache_read_tokens": 3200,
  "cache_write_tokens": 1200,
  "cost_usd": 0.0183,
  "local": false,
  "latency_ms": 1842
}
```

```bash
sb ledger summary               # today's spend by model/task
sb ledger tail                  # live stream of requests
sb ledger export --format csv   # for spreadsheet analysis
sb ledger rollup --weekly       # frugality report
```

---

## Budget Enforcement

```toml
[llm.budget]
daily_limit_usd  = 50.00
warn_at_usd      = 40.00
```

- Below `warn_at`: normal operation
- At `warn_at`: gateway emits `com.packmule.cost.threshold` CloudEvent; Campfire shows warning; agent notified via `get_budget_status`
- At `daily_limit`: gateway returns `429 Too Many Requests`; agent catches and reports gracefully
- Budget resets at midnight UTC

---

## API Surface

```
POST /v1/chat/completions    # OpenAI-compatible; streaming + non-streaming
GET  /v1/models              # Available models per routing config
GET  /health                 # Saddlebag + gateway health
GET  /metrics                # Prometheus-compatible
POST /v1/embeddings          # Embedding requests (for Kùzu retrieval)
```

**Custom request headers:**
```
X-Task-Type: plan | implement | classify | review | summarize
X-Desk-Id: myproject
X-Trace: {traceparent}
X-Model: claude-opus-4-20250514    # explicit override
```

**Custom response headers:**
```
X-Provider: anthropic
X-Model-Used: claude-sonnet-4-20250514
X-Budget-Remaining-USD: 38.47
X-Cache-Hit: block-a | semantic | none
X-Trace: {traceparent}
```

---

## OAuth Access (External Consumers)

```bash
# Login: OAuth device flow → browser → token → system keychain
sb auth login

# Use with any OpenAI-compatible client:
export OPENAI_BASE_URL="http://localhost:$(sb gateway port)"
export OPENAI_API_KEY="$(sb auth token)"

# Works with Claude Code, Cursor, custom scripts, etc.
# All requests are still Cedar-gated under the authenticated user's identity.
```

Token scopes: `gateway:read`, `gateway:write`, `ledger:read`. Tokens carry Cedar principal. Policy enforcement applies to all external callers identically.
