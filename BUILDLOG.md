# BUILDLOG

Honest record of how this was built and where AI did the work. Feeds the "where you used AI" section of the writeup.

## Setup & spec (before code)

- Wrote a detailed SPEC myself (with AI help in a prior session) covering milestones M1–M6, the security model, and acceptance criteria — then handed the spec plus the task PDF to Claude Code (Opus 5) to execute.
- Claude asked four scoping questions before starting: deploy shape (spec's pnpm/stdio/Express layout can't run on Vercel serverless — chose single Next.js app with in-memory MCP transport), API key handling, milestone scope, writeup ownership. All four were real decisions, not filler.
- Claude loaded its Anthropic API reference before writing agent code and caught two spec staleness bugs: `claude-sonnet-4-6` superseded by `claude-sonnet-5`, and `temperature: 0.2` now returns a 400 on current models (sampling params removed). Both would have failed at runtime.

## M1 — core layer (~30 min wall clock)

- Entirely AI-generated from the spec: types, `authorize()`, allowlist projection, keyword router, store, audit, and the proof script.
- First proof run: 9/11. Two real failures, both caught by the script doing its job:
  - `list_my_patients` for a patient principal returned `OUT_OF_SCOPE` where the spec demanded `FORBIDDEN_TYPE` — the deny-by-shape case was routed through the generic scope check. Fixed by making the operation refuse by type explicitly.
  - The audit-completeness test used a hand-counted expected number that drifted from the actual call count. Fixed by counting calls in the harness instead of by hand — the test now asserts entries == calls exactly.

## M2/M3 — MCP + agent (~30 min)

- MCP server AI-generated; smoke-tested over the in-memory transport before wiring the agent (7 tools listed, allow and deny both verified at the transport boundary).
- Typecheck caught that the installed SDK's TS types predate the `thinking: adaptive` literal — resolved by omitting the field (adaptive is the default on Sonnet 5) rather than fighting typings with casts.
- Provided API key turned out to have no credit; tests 1–8 and the whole UI are keyless by design, so the build continued and test 9 was deferred.

## M4–M6 — UI, metrics, simulator (~45 min)

- All AI-generated in one pass: three-pane layout, tool-call strips, audit polling, ticket reassignment, metrics fold, deterministic synthetic backfill (xorshift-seeded so it's identical across boots), simulator with expected-vs-actual table.
- `tsc --noEmit` and `next build` clean on second attempt (first had two type errors in generic constraints on the projection helper).

## M7 — learning router (~40 min)

- Scope added after M1–M6 shipped: a router that learns from ticket reassignments, under a precedence that keeps the guarantee (hand rules always win; learned rules only fill the default-fallthrough gap; model suggestion below that).
- The engineered demo pair needed real care: the bait's phrasing must dodge every hand keyword AND the live model rewrites ticket subjects, so the chips instruct the model to quote the title verbatim. The token extractor's hand-keyword filter correctly rejected "track" (overlaps the "tracking" hand keyword) and learned from trace+shows+movement instead — the conservative filter working as designed on the first real input.
- Proof test 10 asserts five things at once: bait falls through, correction teaches, hand-rule fixtures route identically post-learning, the probe is caught by the learned rule, and hand-territory corrections record without teaching. Green first run after one type fix.
- Fallback (exact-subject match) implemented for when token extraction yields nothing — ship beats elegant.

## Tools used

- **Claude Code (Opus 5)** — all code, this file, the README, and the first draft of WRITEUP.md (edited by me).
- **Claude Sonnet 5** — the runtime agent inside the product.
- No other AI tools; no code copied from templates or starters beyond `create-next-app`-equivalent config files.

## What I checked by hand

- Ran the proof script and read every assertion before trusting the green.
- Walked the demo chips in the browser against a fresh reset.
- Reviewed the injection article (K4) wording and the policy file line by line — the two files where a subtle bug would quietly break the guarantee.
