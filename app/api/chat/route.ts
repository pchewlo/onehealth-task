import { NextRequest, NextResponse } from "next/server";
import { runAgent, type ChatMessage } from "@/lib/agent/loop";

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
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
