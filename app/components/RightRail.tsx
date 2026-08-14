"use client";

import { useState } from "react";
import { TEAMS, TEAM_COLORS, type UiAuditEntry, type UiTicket } from "../lib/ui-types";

function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AuditLog({ entries }: { entries: UiAuditEntry[] }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Audit log
        </h2>
        <span className="text-[10.5px] text-[var(--muted)]">every call · live</span>
      </header>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {entries.length === 0 && (
          <p className="px-1 pt-2 text-[11.5px] text-[var(--muted)]">
            No calls yet — every tool invocation lands here, allowed or denied.
          </p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            title={e.reason}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${
              e.decision === "deny"
                ? "border-red-200 bg-[var(--deny-soft)]"
                : "border-[var(--line)] bg-white"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>{e.decision === "deny" ? "⛔" : "✅"}</span>
              <span className="font-mono font-medium">{e.tool}</span>
              <span className="ml-auto text-[10px] text-[var(--muted)]">{timeOf(e.ts)}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[var(--muted)]">
              <span>{e.principalId}</span>
              {e.code && <span className="font-medium text-[var(--deny)]">· {e.code}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TicketsPanel({
  tickets,
  onReassign,
}: {
  tickets: UiTicket[];
  onReassign: (ticketId: string, team: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="flex min-h-0 flex-col border-t border-[var(--line)]" style={{ flexBasis: "40%" }}>
      <header className="flex items-baseline justify-between px-4 pb-2 pt-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Tickets
        </h2>
        <span className="text-[10.5px] text-[var(--muted)]">{tickets.length} open</span>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {tickets.length === 0 && (
          <p className="px-1 pt-1 text-[11.5px] text-[var(--muted)]">
            No tickets yet for this principal.
          </p>
        )}
        {tickets.map((t) => (
          <div key={t.id} className="rounded-lg border border-[var(--line)] bg-white px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              {editing === t.id ? (
                <select
                  autoFocus
                  defaultValue={t.team}
                  onBlur={() => setEditing(null)}
                  onChange={(e) => {
                    onReassign(t.id, e.target.value);
                    setEditing(null);
                  }}
                  className="rounded border border-[var(--line)] bg-white px-1 py-0.5 text-[10.5px]"
                >
                  {TEAMS.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setEditing(t.id)}
                  title="Reassign team — every correction is training signal for the router"
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition hover:ring-2 hover:ring-stone-300 ${TEAM_COLORS[t.team] ?? "bg-stone-200"}`}
                >
                  {t.team} ▾
                </button>
              )}
              <span className="truncate text-[11.5px] font-medium">{t.subject}</span>
            </div>
            <div className="mt-1 text-[10.5px] leading-snug text-[var(--muted)]">
              {t.teamDecidedBy === "model_confirmed" ? "routed by model (confirmed by rules)" : "routed by rules"}
              {" · "}
              {t.routingReason}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
