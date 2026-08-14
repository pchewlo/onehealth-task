import { NextRequest, NextResponse } from "next/server";
import { correctTicket } from "@/lib/core/operations";
import { normaliseTeam } from "@/lib/core/router";
import { allPatientNames, learnedRules, ticketsBy } from "@/lib/core/store";

export async function GET(req: NextRequest) {
  const principalId = req.nextUrl.searchParams.get("principalId");
  if (!principalId) {
    return NextResponse.json({ error: "principalId required" }, { status: 400 });
  }
  // Ticket scoping mirrors the tool: you see what you created. Learned rules
  // are router state, not personal data — shown so the demo can watch the
  // loop close.
  return NextResponse.json({
    tickets: ticketsBy(principalId),
    learnedRules: learnedRules(),
  });
}

/** Reassign a ticket's team — the human-correction affordance. What the
 * correction is allowed to teach is decided by policy in correctTicket():
 * learning fills the fallthrough gap; hand-rule territory only records. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { principalId?: string; ticketId?: string; team?: string };
  const team = normaliseTeam(body.team);
  if (!body.principalId || !body.ticketId || !team) {
    return NextResponse.json({ error: "principalId, ticketId, team required" }, { status: 400 });
  }
  const res = correctTicket(body.principalId, body.ticketId, team, allPatientNames());
  if (!res.ok) {
    return NextResponse.json({ error: "Ticket not found in your scope" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    from: res.from,
    to: team,
    learned: res.learned ?? null,
    retiredRuleId: res.retiredRuleId ?? null,
    notLearnedBecause: res.notLearnedBecause ?? null,
    // Same-instance snapshot for the client to merge (see /api/chat comment).
    tickets: ticketsBy(body.principalId),
    learnedRules: learnedRules(),
  });
}
