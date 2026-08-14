import { NextRequest, NextResponse } from "next/server";
import { appendEvent, nextId, reassignTicket, ticketsBy } from "@/lib/core/store";
import { normaliseTeam } from "@/lib/core/router";

export async function GET(req: NextRequest) {
  const principalId = req.nextUrl.searchParams.get("principalId");
  if (!principalId) {
    return NextResponse.json({ error: "principalId required" }, { status: 400 });
  }
  // Ticket scoping mirrors the tool: you see what you created.
  return NextResponse.json({ tickets: ticketsBy(principalId) });
}

/** Reassign a ticket's team — the human-correction affordance. Every
 * reassignment is free training signal for the router: it is a labelled
 * example of what the right team actually was. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { principalId?: string; ticketId?: string; team?: string };
  const team = normaliseTeam(body.team);
  if (!body.principalId || !body.ticketId || !team) {
    return NextResponse.json({ error: "principalId, ticketId, team required" }, { status: 400 });
  }
  const res = reassignTicket(body.ticketId, body.principalId, team);
  if (!res.ok) {
    return NextResponse.json({ error: "Ticket not found in your scope" }, { status: 404 });
  }
  appendEvent({
    id: nextId("ev"),
    ts: new Date().toISOString(),
    type: "ticket_reassigned",
    principalId: body.principalId,
    conversationId: "",
    fromTeam: res.from,
    toTeam: team,
  });
  return NextResponse.json({ ok: true, from: res.from, to: team });
}
