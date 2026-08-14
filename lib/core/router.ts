import type { Team } from "./types";

/**
 * Ticket routing — "the model proposes, the server decides", applied a second
 * time on the write path.
 *
 * The read path enforces that guarantee with authorize(). This is the same idea
 * for an action: the model may suggest a team, but a deterministic rules table
 * computes the answer and wins on disagreement. Both values are stored, so
 * every disagreement is a labelled training example for whatever replaces the
 * keyword table later (a classifier, a learned router) — and the rate of
 * agreement is a metric you can watch before you ever trust the model with the
 * decision.
 */

const RULES: { team: Team; keywords: string[] }[] = [
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
  teamDecidedBy: "rules" | "model_confirmed";
  routingReason: string;
}

export function routeTicket(
  subject: string,
  body: string,
  teamSuggestion?: string,
): RoutingResult {
  const text = `${subject} ${body}`.toLowerCase();

  let matchedTeam: Team | null = null;
  let matchedKeyword: string | null = null;
  let bestIndex = Number.MAX_SAFE_INTEGER;

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const i = text.indexOf(kw);
      if (i !== -1 && i < bestIndex) {
        bestIndex = i;
        matchedTeam = rule.team;
        matchedKeyword = kw;
      }
    }
  }

  const rulesTeam: Team = matchedTeam ?? DEFAULT_TEAM;
  const basis = matchedKeyword
    ? `matched "${matchedKeyword}" → ${rulesTeam}`
    : `no routing keyword matched → ${DEFAULT_TEAM}`;

  const suggestion = normaliseTeam(teamSuggestion);

  if (suggestion && suggestion === rulesTeam) {
    return {
      team: rulesTeam,
      teamProposedByModel: teamSuggestion,
      teamDecidedBy: "model_confirmed",
      routingReason: `${basis}; the assistant proposed the same team.`,
    };
  }

  if (suggestion && suggestion !== rulesTeam) {
    return {
      team: rulesTeam,
      teamProposedByModel: teamSuggestion,
      teamDecidedBy: "rules",
      routingReason: `${basis}; the assistant proposed ${suggestion} — overridden by the routing rules.`,
    };
  }

  return {
    team: rulesTeam,
    teamProposedByModel: teamSuggestion,
    teamDecidedBy: "rules",
    routingReason: `${basis}; the assistant made no proposal.`,
  };
}

export function normaliseTeam(value?: string): Team | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return (["ops", "clinical", "sales", "support", "finance"] as const).includes(v as Team)
    ? (v as Team)
    : null;
}
