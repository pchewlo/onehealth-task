import { appendAudit, nextId, readAudit } from "./store";
import type { AuditEntry, Decision, Principal } from "./types";

/**
 * Every invocation is audited — allows and denies alike, including the ones
 * made by the proof script. A layer that only logs successes tells you what
 * the system did; a layer that logs refusals tells you what it was asked to do,
 * which is the more interesting half.
 */
export function record(
  principal: Principal,
  tool: string,
  args: unknown,
  decision: Decision,
  startedAt: number,
): AuditEntry {
  const entry: AuditEntry = {
    id: nextId("aud"),
    ts: new Date().toISOString(),
    principalId: principal.id,
    principalType: principal.type,
    tool,
    args: truncateArgs(args),
    decision: decision.allow ? "allow" : "deny",
    code: decision.allow ? undefined : decision.code,
    reason: decision.allow ? undefined : decision.reason,
    latencyMs: Math.max(0, Date.now() - startedAt),
  };
  appendAudit(entry);
  return entry;
}

export { readAudit };

/** Ticket bodies can be long and can carry free text — keep the audit readable. */
function truncateArgs(args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const key of ["body", "query", "subject"]) {
    const v = out[key];
    if (typeof v === "string" && v.length > 80) out[key] = `${v.slice(0, 80)}…`;
  }
  return out;
}
