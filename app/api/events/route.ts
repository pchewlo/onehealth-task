import { NextRequest, NextResponse } from "next/server";
import { appendEvent, ensureHydrated, nextId, persistNow } from "@/lib/core/store";
import type { UnresolvedReason } from "@/lib/core/types";

/** Feedback (👍/👎) and conversation_end events from the UI. */
export async function POST(req: NextRequest) {
  await ensureHydrated();
  const body = (await req.json()) as {
    type?: "feedback" | "conversation_end";
    principalId?: string;
    conversationId?: string;
    rating?: "up" | "down";
    resolved?: boolean;
    reason?: UnresolvedReason;
  };
  if (!body.type || !body.principalId || !body.conversationId) {
    return NextResponse.json(
      { error: "type, principalId, conversationId required" },
      { status: 400 },
    );
  }
  appendEvent({
    id: nextId("ev"),
    ts: new Date().toISOString(),
    type: body.type,
    principalId: body.principalId,
    conversationId: body.conversationId,
    rating: body.rating,
    resolved: body.resolved,
    reason: body.reason,
  });
  await persistNow();
  return NextResponse.json({ ok: true });
}
