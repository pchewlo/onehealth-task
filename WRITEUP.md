# Part 2 — Writeup

Draft for Tom to edit. Every claim below is checkable against the repo or the live demo at onehealth-task.vercel.app.

---

## 1. How this scales as a business

**The layer is the asset, not the assistant.** The assistant on top of it will be rewritten several times — new models, new prompts, new channels. The thing that compounds is the doorway: one place where every request is identified, authorised, redacted, audited, and (for actions) routed. Each new agent, channel or tool added behind that doorway inherits the whole security and measurement apparatus for free. That is where the leverage is: the marginal cost of agent #5 is a system prompt and a tool subset, not a security review.

**What compounds.** Three feedback loops are built into this slice, deliberately:

1. **Routing corrections — and the loop is closed in this build.** Every ticket stores what the model proposed and what the rules decided; every human reassignment stores what the right team actually was. M7 turns that signal into behaviour under a hard precedence: hand rules always win, learned rules fill only the gap where no hand rule matched, the model's suggestion sits below both. A correction in the gap teaches a rule; a correction against a learned rule retires it; a correction against a hand rule is recorded as evidence for a human to edit the table — and can never change behaviour by itself. Proof test 10 asserts the isolation property rather than asserting *about* it: a learned rule cannot move anything a hand rule claims. This is the autonomy mechanism in miniature — the adaptive part earns exactly the territory the deterministic part has explicitly ceded, and nothing more.
2. **Resolution rate as the OMTM.** A conversation is resolved iff the user got what they needed with no negative signal (👎, reassignment, rephrase-loop, denied-then-abandoned). It is measurable per conversation from day one, and it is the number the whole system exists to move.
3. **The audit trail as demand signal.** Denials are not just enforcement — they are a log of what users asked for and couldn't get. That is the roadmap for the next tool and the next principal type, written by the users themselves.

**What bottlenecks.** Two things, and neither is model capability. First, ticket throughput: an assistant that raises tickets faster than teams close them has automated the creation of a backlog. The dashboard's greyed-out row ("ops hours saved") is the honest admission that the metric that matters next needs production data. Second, trust calibration: the layer can prove a principal never read out of scope, but "the assistant filed a wrong-but-plausible ticket" erodes trust faster than any denial. Which leads to:

**How the assistant earns the right to act.** Autonomy should be granted per action class, not per agent, and granted by evidence, not vibes. The mechanism is already in this build in miniature: for ticket routing, the model proposes, the rules decide, and every disagreement is measured. When the model's proposal agrees with rules + human corrections for N consecutive weeks above a threshold, flip that one action class to model-decides-rules-audit. The rules table doesn't disappear — it demotes to a monitor, and any drift re-triggers review. The traffic simulator is the other half of this: a deterministic fixture set that any prompt/model/tool change must pass before shipping. Autonomy promotion = (live agreement rate over threshold) AND (eval suite green). That is a definition you can write down, audit, and defend to a regulator.

**Human-out-of-the-loop, defined.** The line is not "when the model is good enough"; it is per action class, when three conditions hold: (a) the action is reversible or bounded (a mis-routed ticket costs minutes; a mis-sent patient email costs trust — those are different classes forever), (b) the measured error rate is below the human baseline for the same action, on live traffic, and (c) there is a monitored rollback path. Reads are already out-of-the-loop in this build — enforced by code, not reviewed by humans. Ticket routing is next. Anything patient-facing stays in-loop until (a)–(c) hold, and some classes (clinical judgement) should simply never promote.

**Durable strength / weakness.** The durable strength is that governance here is *structural*, not behavioural: the model cannot leak dob/email because it never receives them, and cannot act as another principal because identity is not in its vocabulary. Prompt-injection resistance falls out for free (demo scenario 6). The durable weakness is the single doorway itself: it is a chokepoint for latency, for availability, and for organisational ownership — whoever owns this layer gates every team's agent roadmap. That is a governance decision as much as an architecture.

**What to watch.** Resolution rate (weekly); routing agreement + reassignment rate (the autonomy instrument); denial rate split by "policy working" vs "scope too tight" (rising denials on legitimate asks = the product's growth signal); eval pass rate on every release; and time-to-close per team once ticket volume is real.

## 2. How it scales technically

The load-bearing decision is that `lib/core` is pure and transport-free. Everything else is replaceable around it:

- **More entities**: add the record type, add a rule in `authorize()`, add an allowlist. Until both edits happen, the new entity is invisible — fail-closed applies to schema growth, not just requests. Restricted-by-default is the property that survives a growing schema.
- **Real DB**: `store.ts` is the only file that knows data lives in arrays. Swap it for Postgres and add row-level security as a second, independent enforcement of the same ownership rules — defence in depth where the DB re-checks what `authorize()` already decided.
- **More principal types**: one new case in `authorize()`, one allowlist column. The patient type was added this way in this build; a "lab partner" or "insurer" type is the same shape of change.
- **More agents/channels**: each gets a principal-bound MCP client and a tool subset. The layer doesn't know how many agents exist.
- **More tools**: the fixed seven become a catalogue; past a few dozen, tool search/deferred loading rather than always-on schemas.
- **Kept simple now, hardened later**: in-memory state (→ Postgres + append-only audit store), keyword router (→ classifier trained on the accumulated corrections), single region/process (→ queue between agent and ticketing), demo principal selection (→ verified session; the swap is one marked line).

## 3. Candid critique of the approach

**Keep: the single governed doorway, and isolation in code.** This is the correct core bet. "Never trust the model" is the only assumption that survives model swaps, prompt injection, and audits. The build demonstrates the payoff cheaply: the injection demo requires no defensive prompting at all.

**Keep: ticketing rather than acting — but treat it as a stage, not a destination.** Tickets are the right first action because they are reversible and produce labelled routing data. The risk is comfort: if everything permanently becomes a ticket, the assistant is a form-filler and the leverage story dies. The promotion mechanism (§1) is how ticketing avoids becoming the ceiling.

**Change: don't run one MCP server per principal at scale.** Binding the principal at process/server construction is airtight but heavyweight: per-session processes (or per-request servers) multiply cold starts and connections. The property that actually matters is *identity travels out-of-band of the model*, not *one server per principal*. At scale, run one stateless layer that takes a verified identity token on a side channel (as this build's serverless variant already does internally) — same guarantee, one deployment.

**Push back: MCP is the right shape but the wrong place for the guarantee.** MCP buys real things — a stable tool contract, reuse across future agents, ecosystem tooling. But MCP is a *protocol*, not a *policy engine*: authorisation, redaction and audit live in our layer and would be identical over plain HTTP. Two places MCP may actively mislead: (1) its ecosystem defaults assume tools are trusted extensions of the user, while our threat model treats the model as the adversary — so any third-party MCP server plugged in beside ours would bypass the doorway unless forced through it; (2) tool-count growth: MCP's flat tool lists get expensive in context as the catalogue grows. Verdict: adopt MCP as the transport, refuse to let any MCP server exist that doesn't sit behind the governed layer, and keep the "swappable transport" property proven (here: `lib/core` imports nothing from MCP).

**One more push-back on the brief.** "A small, fixed set of tools" is right for reads, but the interesting scaling question is write-actions, and the brief's framing (read tools + ticket tools) postpones it. The promotion mechanism should be designed *now*, while the action set is small — retrofitting measurement onto actions that already ship is much harder than shipping actions pre-instrumented.

## 4. Where AI was used

Everything — see BUILDLOG.md for the specific record. Summary: the spec was written with AI assistance first; Claude Code (Opus 5) then generated all code, caught two stale-spec bugs against the current Anthropic API (superseded model id; removed `temperature` parameter), and surfaced the serverless/spec conflict as a decision rather than silently resolving it. The proof script failed twice on first run — both real bugs, both fixed before any UI existed. The runtime agent is Claude Sonnet 5. Hand-verification concentrated where it mattered: the policy file, the injection article, and every assertion in the proof.

---

*Evidence index: `npm run prove` (the 10-test proof, incl. the learning-isolation assertion) · demo chip 6 (live injection) · the "teach the router" chip pair (the learning loop, live) · Metrics tab (routing agreement, reassignment rate, resolution rate) · `POST /api/simulate` (the eval harness) · `lib/core` imports (transport-independence claim).*
