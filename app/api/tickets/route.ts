import { NextRequest, NextResponse } from "next/server";
import { commentOnTicket, correctTicket, progressTicket } from "@/lib/core/operations";
import { normaliseTeam } from "@/lib/core/router";
import {
  allPatientNames,
  commentsVisibleTo,
  ensureHydrated,
  getPrincipal,
  learnedRules,
  notificationsFor,
  persistNow,
  ticketsVisibleTo,
} from "@/lib/core/store";

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const principalId = req.nextUrl.searchParams.get("principalId");
  const principal = principalId ? getPrincipal(principalId) : undefined;
  if (!principal) {
    return NextResponse.json({ error: "principalId required" }, { status: 400 });
  }
  // Ticket scoping follows the audit log's ownership shape: your own tickets,
  // plus — for internal staff — those raised by the dentists you manage and
  // their patients. Learned rules are router state, not personal data — shown
  // so the demo can watch the loop close.
  return NextResponse.json({
    tickets: ticketsVisibleTo(principal),
    learnedRules: learnedRules(),
    comments: commentsVisibleTo(principal),
    // Strictly addressed: only notifications FOR this principal, never the
    // board-wide feed.
    notifications: notificationsFor(principal),
  });
}

/** Reassign a ticket's team — the human-correction affordance. What the
 * correction is allowed to teach is decided by policy in correctTicket():
 * learning fills the fallthrough gap; hand-rule territory only records. */
export async function POST(req: NextRequest) {
  await ensureHydrated({ force: true });
  const body = (await req.json()) as {
    principalId?: string;
    ticketId?: string;
    team?: string;
    status?: string;
    comment?: string;
  };
  const team = normaliseTeam(body.team);
  const principal = body.principalId ? getPrincipal(body.principalId) : undefined;
  const STATUSES = ["todo", "in_progress", "done", "blocked"] as const;
  const status = STATUSES.find((s) => s === body.status);

  if (!principal || !body.ticketId || (!team && !status && !body.comment)) {
    return NextResponse.json(
      { error: "principalId, ticketId and a team, status or comment required" },
      { status: 400 },
    );
  }

  // Comment: scope rides the ticket (commenter must be able to see it).
  if (body.comment) {
    const res = commentOnTicket(body.principalId!, body.ticketId, body.comment);
    if (!res.ok) {
      return NextResponse.json({ error: "Ticket not found in your scope" }, { status: 404 });
    }
    await persistNow();
    return NextResponse.json({
      ok: true,
      comment: res.comment,
      tickets: ticketsVisibleTo(principal),
      comments: commentsVisibleTo(principal),
      learnedRules: learnedRules(),
      notifications: notificationsFor(principal),
    });
  }

  // Board move: workflow status only — no routing change, no learning.
  if (status) {
    const res = progressTicket(body.principalId!, body.ticketId, status);
    if (!res.ok) {
      return NextResponse.json({ error: "Ticket not found in your scope" }, { status: 404 });
    }
    await persistNow();
    return NextResponse.json({
      ok: true,
      from: res.from,
      to: status,
      tickets: ticketsVisibleTo(principal),
      learnedRules: learnedRules(),
      notifications: notificationsFor(principal),
    });
  }
  const res = correctTicket(principal.id, body.ticketId, team!, allPatientNames());
  if (!res.ok) {
    return NextResponse.json({ error: "Ticket not found in your scope" }, { status: 404 });
  }
  await persistNow();
  return NextResponse.json({
    ok: true,
    from: res.from,
    to: team,
    learned: res.learned ?? null,
    retiredRuleId: res.retiredRuleId ?? null,
    withdrewRuleId: res.withdrewRuleId ?? null,
    notLearnedBecause: res.notLearnedBecause ?? null,
    // Same-instance snapshot for the client to merge (see /api/chat comment).
    tickets: ticketsVisibleTo(principal),
    learnedRules: learnedRules(),
  });
}
