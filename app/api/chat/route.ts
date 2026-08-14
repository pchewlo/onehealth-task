import { NextRequest, NextResponse } from "next/server";
import { runAgent, type ChatMessage } from "@/lib/agent/loop";
import { auditVisibleTo, getPrincipal, learnedRules, ticketsBy } from "@/lib/core/store";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      principalId?: string;
      messages?: ChatMessage[];
      conversationId?: string;
    };
    if (!body.principalId || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "principalId and messages required" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 503 },
      );
    }
    const result = await runAgent({
      principalId: body.principalId,
      messages: body.messages,
      conversationId: body.conversationId ?? "default",
    });
    // Piggyback this instance's view of the rails on the response. On
    // serverless, the GET endpoints may be answered by a different instance
    // whose memory never saw this conversation — the chat response is the one
    // place guaranteed to be in the same process as the writes it caused, so
    // the client merges from here and the UI stays truthful regardless of
    // which lambda answers the polls.
    const principal = getPrincipal(body.principalId)!;
    return NextResponse.json({
      ...result,
      audit: auditVisibleTo(principal, 60),
      tickets: ticketsBy(body.principalId),
      learnedRules: learnedRules(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
