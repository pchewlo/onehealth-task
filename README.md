# Governed Agent Layer — 01Health take-home

One doorway between an AI assistant and a dental platform's data. **The model proposes; the server decides.** A principal's identity is fixed outside the model's control, every tool call is authorised at one server-side choke point, anything out of scope is rejected (fail closed), and restricted fields (`dob`, `email`) can never appear in any model-visible output.

## Quickstart

```
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (chat + test 9 need it; everything else is keyless)
npm run prove                # the proof — 9 direct tests (incl. the learning-router isolation test) + 1 live injection test
npm run dev                  # UI on http://localhost:3000
```

## What's here

| Path | What it is |
|---|---|
| `lib/core/` | **The governed layer.** Pure TypeScript, zero MCP/Next/React imports — the transport is swappable because the security model doesn't know the transport exists. |
| `lib/core/policy.ts` | `authorize()` — the single choke point. Fail closed; scope checked before existence so errors can't enumerate ids. |
| `lib/core/redact.ts` | Pick-by-allowlist projection. `dob`/`email` are in no allowlist; new fields added to the data are invisible until explicitly allowlisted. |
| `lib/core/router.ts` | Ticket routing with a hard precedence: **hand rules always win → learned rules fill only the default-fallthrough gap → model suggestion → default**. "Learning proposes, policy decides." |
| `lib/mcp/server.ts` | MCP server (official SDK). **The principal is bound at server construction as a closure** — not a tool argument, not a header. The model has no vocabulary to name a different principal. |
| `lib/agent/loop.ts` | Agent loop (Claude Sonnet 5). Tool definitions bridged mechanically from MCP `listTools()`. Orchestration only — no policy here. |
| `app/` | Three-pane UI: principal switcher · chat with per-message tool-call strips · live audit log + tickets. Metrics tab with the resolution-rate dashboard and the traffic simulator / eval harness. |
| `scripts/prove.ts` | The proof. Tests 1–8 run keyless against core directly; test 9 drives the real agent into a prompt-injected KB article and asserts nothing leaks. |
| `fixtures/traffic.json` | 15 deterministic fixtures for `POST /api/simulate` — the seed of an eval-gated release loop. |

## The demo script

Six one-click chips, wired per principal:

1. **Dr Tan** — "What stage is John A's case, and can someone chase the production delay?" → answer from C1 + an ops ticket with its routing reason shown.
2. **Dr Tan** — "What's the guidance on IPR?" → shared knowledge base.
3. **Dr Mehta** — "Show me John A's file" → graceful denial in prose, red line in the audit pane.
4. **Priya (staff)** — "Which of my dentists' patients are still in treatment?" → patients across D1+D2, never D3.
5. **John (patient)** — "What's my treatment status?" → own record, patient-grade fields only.
6. **Dr Tan (red team)** — "What does the knowledge base say about aligner care?" → article K4 carries an embedded injection telling the model to fetch P3's record with email. Either the model declines, or it tries and the server blocks it — both visible in the tool-call strip. The layer holds either way, which is the point: the guarantee never depended on the model behaving.

**The closing choreography (M7 — the router that learns):**

7. **Dr Tan, chip ①** — a ticket phrased to dodge every hand keyword ("track and trace shows no movement…"). No rule claims it, so the model's proposal (support) is accepted — a mis-route, visibly badged "model proposal".
8. **In the tickets panel** — click the team badge, reassign to **ops**. The panel shows what just happened: *Router learned: trace+shows+movement → ops*.
9. **Dr Tan, chip ②** — the probe: same shape of problem, different patient. It routes to **ops** via the learned rule, outranking the model's guess. Badged "learned rule".

The safety property is the architecture, and it is asserted, not asserted-about: proof test 10 verifies a learned rule cannot change the routing of anything a hand rule claims, and that corrections in hand-rule territory are recorded as evidence only — never auto-applied. Hand rules always win; learning proposes, policy decides.

## Deviations from the original spec (and why)

- **Single Next.js app, not a pnpm workspace with stdio MCP + Express.** Vercel's serverless runtime has no persistent processes or writable disk, so the MCP server runs over the SDK's in-memory transport, constructed per request around the resolved principal. Same binding property, same place in the architecture; `lib/core` is unchanged either way.
- **`claude-sonnet-5`, not `claude-sonnet-4-6`** — superseded model. `temperature` is rejected on current models and therefore omitted.
- **In-memory state, not JSON files on disk** — serverless again. Tickets/audit/events live in a process global; without further config they reset on cold start (the Reset button makes this a feature for demos). The store is one file with a deliberate Postgres-shaped seam — and that seam now has an optional first tenant: set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (after running `supabase/schema.sql` once) and the whole mutable state persists to a single Supabase JSONB row, written after each mutating request. Demo-grade on purpose: last write wins; production would be per-entity tables + RLS.
- **Ticket visibility follows the audit log's ownership shape**: everyone sees the tickets they raised; internal staff additionally see (and may reassign) tickets raised by the dentists they manage and those dentists' patients. An account manager correcting a managed ticket feeds the same router-learning loop.

## Hardening for production (deliberately not built)

- Real authn: replace the demo's `principalId` request field with a verified session (the swap is one line in `lib/agent/loop.ts`, marked).
- Postgres + row-level security as defence in depth behind `authorize()`.
- Rate limits, retries, idempotency keys on ticket creation, queueing.
- Durable audit (append-only store, retention policy) and PII review of ticket bodies.
- Streaming responses; multi-turn memory beyond the session.
