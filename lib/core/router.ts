import { learnedRules } from "./store";
import type { LearnedRule, Team, Ticket } from "./types";

/**
 * Ticket routing — "the model proposes, the server decides", applied a second
 * time on the write path. From M7 onward the router also LEARNS from human
 * corrections, under a precedence that is the architecture itself:
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PRECEDENCE (resolveTeam):                                               │
 * │                                                                          │
 * │    1. HAND RULES        — always win. Written by humans, changed only    │
 * │                           by humans. Learning can NEVER override them.   │
 * │    2. LEARNED RULES     — consulted ONLY when no hand rule matched.      │
 * │                           They exist to fill the default-fallthrough     │
 * │                           gap, nothing else.                             │
 * │    3. MODEL SUGGESTION  — accepted only when tiers 1 and 2 both passed.  │
 * │    4. DEFAULT           — support.                                       │
 * │                                                                          │
 * │  LEARNING PROPOSES, POLICY DECIDES. A human correction may create a      │
 * │  learned rule, but only for tickets the hand rules never claimed         │
 * │  (routedVia "default" or "model"). Correcting a hand-routed ticket is    │
 * │  recorded as signal for the next human revision of the hand table — it   │
 * │  does not, and cannot, change routing behaviour by itself. That is the   │
 * │  same shape as the read path: the adaptive part fills gaps; the          │
 * │  deterministic part owns the floor.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const HAND_RULES: { team: Team; keywords: string[] }[] = [
  {
    team: "clinical",
    keywords: ["ipr", "attachment", "clinical", "tooth", "teeth", "pain", "refinement", "fit", "tracking", "bite"],
  },
  { team: "finance", keywords: ["invoice", "refund", "payment", "billing", "charge", "credit note"] },
  {
    team: "ops",
    keywords: ["delay", "delayed", "production", "shipping", "shipment", "lab", "tracking number", "dispatch", "courier"],
  },
  { team: "sales", keywords: ["upgrade", "pricing", "quote", "new patient", "demo", "contract"] },
];

const DEFAULT_TEAM: Team = "support";

export interface RoutingResult {
  team: Team;
  teamProposedByModel?: string;
  teamDecidedBy: Ticket["teamDecidedBy"];
  routedVia: Ticket["routedVia"];
  learnedRuleId?: string;
  routingReason: string;
}

export function resolveTeam(
  subject: string,
  body: string,
  teamSuggestion?: string,
): RoutingResult {
  const text = `${subject} ${body}`.toLowerCase();
  const suggestion = normaliseTeam(teamSuggestion);

  /* ── Tier 1: hand rules — always win ── */
  const hand = matchHandRule(text);
  if (hand) {
    const basis = `matched "${hand.keyword}" → ${hand.team}`;
    if (suggestion && suggestion === hand.team) {
      return {
        team: hand.team,
        teamProposedByModel: teamSuggestion,
        teamDecidedBy: "model_confirmed",
        routedVia: "hand_rule",
        routingReason: `${basis}; the assistant proposed the same team.`,
      };
    }
    return {
      team: hand.team,
      teamProposedByModel: teamSuggestion,
      teamDecidedBy: "rules",
      routedVia: "hand_rule",
      routingReason: suggestion
        ? `${basis}; the assistant proposed ${suggestion} — overridden by the routing rules.`
        : `${basis}; the assistant made no proposal.`,
    };
  }

  /* ── Tier 2: learned rules — the fallthrough gap only ── */
  const learned = matchLearnedRule(subject, text);
  if (learned) {
    return {
      team: learned.team,
      teamProposedByModel: teamSuggestion,
      teamDecidedBy: "learned",
      routedVia: "learned",
      learnedRuleId: learned.id,
      routingReason: `no hand rule matched; learned rule [${learned.tokens.join("+") || "exact subject"}] → ${learned.team} (taught by the correction on ${learned.sourceTicketId})${
        suggestion && suggestion !== learned.team ? `; the assistant proposed ${suggestion} — outranked` : ""
      }.`,
    };
  }

  /* ── Tier 3: model suggestion ── */
  if (suggestion) {
    return {
      team: suggestion,
      teamProposedByModel: teamSuggestion,
      teamDecidedBy: "model",
      routedVia: "model",
      routingReason: `no rule matched; the assistant's proposal (${suggestion}) accepted.`,
    };
  }

  /* ── Tier 4: default ── */
  return {
    team: DEFAULT_TEAM,
    teamDecidedBy: "rules",
    routedVia: "default",
    routingReason: `no routing rule matched and no proposal made → ${DEFAULT_TEAM}.`,
  };
}

function matchHandRule(text: string): { team: Team; keyword: string } | null {
  let best: { team: Team; keyword: string } | null = null;
  let bestIndex = Number.MAX_SAFE_INTEGER;
  for (const rule of HAND_RULES) {
    for (const kw of rule.keywords) {
      const i = text.indexOf(kw);
      if (i !== -1 && i < bestIndex) {
        bestIndex = i;
        best = { team: rule.team, keyword: kw };
      }
    }
  }
  return best;
}

function matchLearnedRule(subject: string, text: string): LearnedRule | null {
  for (const rule of learnedRules()) {
    if (rule.exactSubject) {
      if (subject.trim().toLowerCase() === rule.exactSubject) return rule;
      continue;
    }
    // Crude on purpose: a rule fires when at least two of its tokens (or all,
    // for single-token rules) appear in the new ticket. Ship beats elegant —
    // and test 10 asserts the crude version still cannot touch hand-rule
    // territory, because precedence keeps it out entirely.
    const hits = rule.tokens.filter((t) => text.includes(t)).length;
    const needed = Math.min(2, rule.tokens.length);
    if (hits >= needed && needed > 0) return rule;
  }
  return null;
}

/* ---------------- Learning from corrections ---------------- */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "has", "been",
  "still", "since", "about", "please", "again", "into", "onto", "your", "their",
  "them", "will", "would", "could", "should", "there", "here", "what", "when",
  "where", "which", "cant", "wont", "dont", "isnt", "arent", "very", "just",
  "some", "more", "another", "every", "keeps", "keep", "gets", "got", "was",
  "were", "are", "you", "our", "his", "her", "its", "not", "but", "can", "who",
]);

const ALL_HAND_KEYWORDS = HAND_RULES.flatMap((r) => r.keywords);

/**
 * Extract the content tokens a learned rule will match on. Deliberately
 * conservative: tokens overlapping any hand keyword are excluded, so a learned
 * rule can never even *appear* to compete with the hand table. If nothing
 * survives, the caller falls back to exact-subject matching — the crude
 * version that still demos the loop.
 */
export function extractTokens(subject: string, patientNames: string[]): string[] {
  const nameParts = new Set(
    patientNames.flatMap((n) => n.toLowerCase().split(/\s+/)),
  );
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !STOPWORDS.has(w) &&
        !nameParts.has(w) &&
        !ALL_HAND_KEYWORDS.some((kw) => kw.includes(w) || w.includes(kw)),
    )
    .slice(0, 4);
}

/** Which routing tiers a correction is allowed to teach from. */
export function isLearnable(routedVia: Ticket["routedVia"]): boolean {
  return routedVia === "default" || routedVia === "model";
}

export function normaliseTeam(value?: string): Team | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return (["ops", "clinical", "sales", "support", "finance"] as const).includes(v as Team)
    ? (v as Team)
    : null;
}
