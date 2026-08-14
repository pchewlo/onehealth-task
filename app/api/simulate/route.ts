import { NextResponse } from "next/server";
import fixtures from "@/fixtures/traffic.json";
import { runAgent } from "@/lib/agent/loop";
import { appendEvent, ensureHydrated, nextId, persistNow } from "@/lib/core/store";

export const maxDuration = 300;

/**
 * Traffic simulator — and, because expected vs actual is recorded per fixture,
 * an eval harness. This is the seed of the eval-gated release loop: replay
 * this same traffic against any prompt, model or tool change before shipping,
 * and it is the mechanism by which an action class accumulates the measured
 * samples that earn an autonomy promotion.
 *
 * Fixtures run through the REAL /chat pipeline as their own principals — same
 * model, same MCP tools, same policy. No shortcuts.
 */

interface Fixture {
  id: string;
  principalId: string;
  message: string;
  expect: string; // "resolved" | "denied" | "ticket:<team>"
}

interface SimResult {
  id: string;
  principalId: string;
  message: string;
  expect: string;
  actual: string;
  pass: boolean;
  reply: string;
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  await ensureHydrated({ force: true });
  const results: SimResult[] = [];

  for (const f of fixtures as Fixture[]) {
    const convId = `sim_${f.id}`;
    let actual = "error";
    let reply = "";
    try {
      const res = await runAgent({
        principalId: f.principalId,
        messages: [{ role: "user", content: f.message }],
        conversationId: convId,
      });
      reply = res.reply;

      const created = res.toolCalls.find((c) => c.tool === "create_ticket" && c.allowed);
      const deniedRead = res.denials.some((d) => d.tool !== "create_ticket");
      if (created) {
        const team = (created.result as { ticket?: { team?: string } })?.ticket?.team;
        actual = `ticket:${team ?? "unknown"}`;
      } else if (deniedRead || res.denials.length > 0) {
        actual = "denied";
      } else {
        actual = "resolved";
      }
    } catch (e) {
      reply = e instanceof Error ? e.message : "error";
    }

    const pass = actual === f.expect;
    results.push({ ...f, actual, pass, reply: reply.slice(0, 160) });

    appendEvent({
      id: nextId("ev"),
      ts: new Date().toISOString(),
      type: "conversation_end",
      principalId: f.principalId,
      conversationId: convId,
      resolved: pass,
      reason: pass ? undefined : actual === "denied" ? "confusion" : "mis_route",
      fixtureId: f.id,
      expected: f.expect,
      actual,
      pass,
    });
  }

  await persistNow();
  const passed = results.filter((r) => r.pass).length;
  return NextResponse.json({ results, passed, total: results.length });
}
