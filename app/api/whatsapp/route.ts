import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/loop";
import { phoneToPrincipal } from "@/lib/channels/whatsapp-map";
import { appendAudit, ensureHydrated, getPrincipal, nextId, persistNow } from "@/lib/core/store";

export const maxDuration = 60;

/**
 * M9 — WhatsApp inbound (Twilio sandbox). A thin transport adapter: the phone
 * number maps to a principal at this edge, then the message goes through the
 * SAME agent loop as /api/chat — same MCP tools, same authorize(), same
 * audit. Nothing in lib/core knows WhatsApp exists.
 *
 * Reply is synchronous TwiML (no Twilio credentials needed). Demo-grade by
 * design: single-turn (no cross-message history), no Twilio signature
 * validation — both named in the README hardening list.
 */

function twiml(message: string): NextResponse {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

/** WhatsApp renders *single asterisks* as bold; the model may emit **double**. */
function toWhatsAppText(text: string): string {
  return text.replace(/\*\*([^*\n]+)\*\*/g, "*$1*").trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const from = String(form.get("From") ?? "");
    const body = String(form.get("Body") ?? "").trim();

    if (!from || !body) return twiml("Sorry — empty message.");

    await ensureHydrated({ force: true });

    const principalId = phoneToPrincipal(from);
    const principal = principalId ? getPrincipal(principalId) : undefined;

    if (!principal) {
      // The audit story holds even at the WhatsApp edge: the unknown-number
      // attempt is recorded against the raw sender id. (No principal's scope
      // covers it, so it never renders in anyone's rail — but it's in the
      // durable trail.)
      appendAudit({
        id: nextId("aud"),
        ts: new Date().toISOString(),
        principalId: from,
        principalType: "patient",
        tool: "whatsapp_inbound",
        args: { body: body.slice(0, 80) },
        decision: "deny",
        code: "OUT_OF_SCOPE",
        reason: "Unregistered WhatsApp number",
        latencyMs: 0,
      });
      await persistNow();
      return twiml(
        "This number isn't registered with the 01Health assistant. Please contact your practice to get set up.",
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return twiml("The assistant is temporarily unavailable. Please try again later.");
    }

    const result = await runAgent({
      principalId: principal.id,
      messages: [{ role: "user", content: body }],
      conversationId: `wa_${from.replace(/[^0-9]/g, "")}`,
      channel: "whatsapp",
    });

    await persistNow();

    const reply = toWhatsAppText(result.reply) || "Sorry — I couldn't produce an answer to that.";
    return twiml(reply);
  } catch (e) {
    // Twilio shows the raw error to nobody useful; reply politely and let
    // Vercel logs carry the detail.
    console.error("whatsapp webhook error:", e);
    return twiml("Something went wrong on our side. Please try again in a minute.");
  }
}

/** Sanity endpoint so a browser GET on the webhook URL explains itself. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    note: "Twilio WhatsApp webhook — POST form-encoded From/Body here.",
  });
}
