"use client";

import type { UiAuditEntry, UiLearnedRule } from "../lib/ui-types";

function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export interface CorrectionNote {
  ticketId: string;
  kind: "learned" | "retired" | "recorded";
  detail: string;
}

/**
 * Audit rail — redesigned per design_handoff_dashboard_redesign. The rail is
 * audit only (the board owns tickets now); staff additionally see the learned
 * rules block at the bottom. Allow rows are plain white; deny rows are the
 * only red on the screen — semantic colour where meaning demands it.
 */
export function AuditLog({
  entries,
  nameOf,
}: {
  entries: UiAuditEntry[];
  nameOf: (id: string) => string;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline gap-2 px-4 pb-2.5 pt-4">
        <span className="label">Audit log</span>
        <span className="ml-auto inline-flex items-center gap-[5px] text-[10.5px] text-[var(--ink-3)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
          live · scoped to you
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3">
        {entries.length === 0 && (
          <p className="px-1 pt-0.5 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
            Every tool call made as this user lands here — allowed or denied. Internal staff also
            see their managed dentists&rsquo; calls.
          </p>
        )}
        {entries.map((e) => {
          const deny = e.decision === "deny";
          return (
            <div
              key={e.id}
              title={e.reason}
              className={`fade-up rounded-md border px-2.5 py-[7px] ${
                deny
                  ? "border-[var(--deny-line)] bg-[var(--deny-soft)]"
                  : "border-[var(--line)] bg-white"
              }`}
            >
              <div className="flex items-center gap-[7px]">
                <span className={`text-[11px] ${deny ? "text-[var(--deny)]" : "text-[var(--ok)]"}`}>
                  {deny ? "✕" : "✓"}
                </span>
                <span className="font-mono text-[11px] font-medium">{e.tool}</span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                  {timeOf(e.ts)}
                </span>
              </div>
              <div className="mt-[3px] text-[10.5px] text-[var(--ink-2)]">
                as {nameOf(e.principalId)}
                {e.code && <span className="text-[var(--deny)]"> · {e.code}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Staff-only footer block: what the router has taught itself, and the one
 * line of policy that keeps it safe. */
export function LearnedRulesBlock({ rules }: { rules: UiLearnedRule[] }) {
  if (!rules.length) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t border-[var(--line)] px-4 py-3">
      <span className="label !text-[var(--accent-ink)]">Learned rules</span>
      {rules.map((r) => (
        <div
          key={r.id}
          className="fade-up flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-2)]"
        >
          <span className="text-[var(--accent-ink)]">
            {r.tokens.length ? r.tokens.join("+") : `"${r.exactSubject}"`}
          </span>
          <span>→</span>
          <span className="rounded-full bg-[var(--accent-soft)] px-2 py-px text-[10px] uppercase tracking-[0.06em] text-[var(--accent-ink)]">
            {r.team}
          </span>
          <span className="ml-auto text-[10px] text-[var(--ink-3)]">from {r.sourceTicketId}</span>
        </div>
      ))}
      <p className="text-[10.5px] leading-snug text-[var(--ink-3)]">
        Learned rules fill the gap below hand rules — never override them.
      </p>
    </div>
  );
}
