"use client";

import { useState } from "react";
import {
  ROUTED_VIA_LABEL,
  TEAMS,
  TEAM_COLORS,
  type UiAuditEntry,
  type UiLearnedRule,
  type UiTicket,
} from "../lib/ui-types";

function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AuditLog({
  entries,
  nameOf,
}: {
  entries: UiAuditEntry[];
  nameOf: (id: string) => string;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Audit log
        </h2>
        <span className="flex items-center gap-1 text-[10.5px] text-[var(--muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" /> live · scoped to
          you
        </span>
      </header>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {entries.length === 0 && (
          <p className="px-1 pt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
            Empty until this user's first tool call. Every invocation made as them lands here —
            allowed <span className="text-green-700">✅</span> or denied{" "}
            <span className="text-red-700">⛔</span>. Internal staff also see their managed
            dentists&rsquo; calls.
          </p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            title={e.reason}
            className={`fade-up rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${
              e.decision === "deny"
                ? "border-red-200 bg-[var(--deny-soft)]"
                : "border-[var(--line)] bg-white"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>{e.decision === "deny" ? "⛔" : "✅"}</span>
              <span className="font-mono font-medium">{e.tool}</span>
              <span className="ml-auto text-[10px] tabular-nums text-[var(--muted)]">{timeOf(e.ts)}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[var(--muted)]">
              <span>as {nameOf(e.principalId)}</span>
              {e.code && <span className="font-medium text-[var(--deny)]">· {e.code}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface CorrectionNote {
  ticketId: string;
  kind: "learned" | "retired" | "recorded";
  detail: string;
}

export function TicketsPanel({
  tickets,
  learnedRules,
  note,
  onReassign,
}: {
  tickets: UiTicket[];
  learnedRules: UiLearnedRule[];
  note: CorrectionNote | null;
  onReassign: (ticketId: string, team: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="flex min-h-0 flex-col border-t border-[var(--line)]" style={{ flexBasis: "46%" }}>
      <header className="flex items-baseline justify-between px-4 pb-2 pt-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Tickets
        </h2>
        <span className="text-[10.5px] text-[var(--muted)]">
          click a team badge to correct it
        </span>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-2">
        {tickets.length === 0 && (
          <p className="px-1 pt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
            No tickets yet for this principal. When the assistant raises one, the badge shows the
            team and <em>how</em> it was routed.
          </p>
        )}
        {tickets.map((t) => (
          <div key={t.id} className="fade-up rounded-lg border border-[var(--line)] bg-white px-2.5 py-2">
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
                  title="Reassign the team — every correction is training signal for the router"
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition hover:ring-2 hover:ring-stone-300 ${TEAM_COLORS[t.team] ?? "bg-stone-200"}`}
                >
                  {t.team} ▾
                </button>
              )}
              <span className="truncate text-[11.5px] font-medium" title={t.subject}>
                {t.subject}
              </span>
            </div>
            <div className="mt-1 flex items-start gap-1.5">
              <span
                className={`shrink-0 rounded px-1 py-px text-[9.5px] font-medium uppercase tracking-wide ${
                  t.routedVia === "learned"
                    ? "bg-indigo-100 text-indigo-700"
                    : t.routedVia === "model"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-stone-100 text-stone-500"
                }`}
              >
                {ROUTED_VIA_LABEL[t.routedVia ?? "default"] ?? t.routedVia}
              </span>
              <span className="text-[10.5px] leading-snug text-[var(--muted)]" title={t.routingReason}>
                {t.routingReason.length > 90 ? `${t.routingReason.slice(0, 90)}…` : t.routingReason}
              </span>
            </div>
            {note?.ticketId === t.id && (
              <div
                className={`fade-up mt-1.5 rounded-md px-2 py-1 text-[10.5px] font-medium ${
                  note.kind === "learned"
                    ? "bg-indigo-50 text-indigo-700"
                    : note.kind === "retired"
                      ? "bg-orange-50 text-orange-700"
                      : "bg-stone-100 text-stone-600"
                }`}
              >
                {note.detail}
              </div>
            )}
          </div>
        ))}
      </div>

      {learnedRules.length > 0 && (
        <div className="border-t border-dashed border-[var(--line)] px-4 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-500">
            📚 Learned rules
          </div>
          <div className="mt-1 space-y-0.5">
            {learnedRules.map((r) => (
              <div key={r.id} className="fade-up flex items-center gap-1.5 text-[10.5px] text-[var(--muted)]">
                <span className="font-mono text-indigo-700">
                  {r.tokens.length ? r.tokens.join("+") : `"${r.exactSubject}"`}
                </span>
                <span>→</span>
                <span className={`rounded-full px-1.5 py-px text-[9.5px] font-semibold uppercase ${TEAM_COLORS[r.team] ?? "bg-stone-200"}`}>
                  {r.team}
                </span>
                <span className="ml-auto">from {r.sourceTicketId}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[9.5px] leading-snug text-stone-400">
            Fill the gap below the hand rules; they can never override them.
          </p>
        </div>
      )}
    </section>
  );
}
