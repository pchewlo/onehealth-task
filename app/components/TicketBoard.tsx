"use client";

import type { CorrectionNote } from "./RightRail";
import {
  ROUTED_VIA_LABEL,
  TEAMS,
  TEAM_COLORS,
  type UiPrincipal,
  type UiTicket,
} from "../lib/ui-types";

function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Board view of the active principal's tickets — same `/api/tickets?principalId=`
 * data as the rail, so it shows exactly (and only) what this user can see.
 * Moving a card between columns is a reassignment: the same correction signal
 * the router learns from. */
export function TicketBoard({
  principal,
  tickets,
  note,
  focusTicketId,
  onReassign,
}: {
  principal: UiPrincipal;
  tickets: UiTicket[];
  note: CorrectionNote | null;
  /** Ticket to highlight + scroll to (arriving from a chat link). */
  focusTicketId: string | null;
  onReassign: (ticketId: string, team: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-2 px-6 pb-1 pt-4">
        <h2 className="text-[13px] font-semibold">{principal.name}&rsquo;s tickets</h2>
        <span className="text-[11px] text-[var(--muted)]">
          {principal.type === "internal_staff"
            ? "their own plus their managed practices' tickets"
            : "scoped to this principal"}{" "}
          · move a card to correct its team — every move is training signal for the router
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-5 pt-2">
        {TEAMS.map((team) => {
          const cards = tickets.filter((t) => t.team === team);
          return (
            <div
              key={team}
              className="flex min-h-0 w-[220px] shrink-0 flex-col rounded-xl border border-[var(--line)] bg-white/60"
            >
              <header className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TEAM_COLORS[team] ?? "bg-stone-200"}`}
                >
                  {team}
                </span>
                <span className="ml-auto text-[10.5px] tabular-nums text-[var(--muted)]">
                  {cards.length}
                </span>
              </header>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                {cards.length === 0 && (
                  <p className="px-1 pt-1 text-[10.5px] text-stone-400">No tickets</p>
                )}
                {cards.map((t) => (
                  <div
                    key={t.id}
                    ref={(el) => {
                      if (el && t.id === focusTicketId) {
                        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      }
                    }}
                    className={`fade-up rounded-lg border bg-white px-2.5 py-2 transition-shadow ${
                      t.id === focusTicketId
                        ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
                        : "border-[var(--line)]"
                    }`}
                  >
                    <div className="text-[11.5px] font-medium leading-snug" title={t.subject}>
                      {t.subject}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={`rounded px-1 py-px text-[9.5px] font-medium uppercase tracking-wide ${
                          t.routedVia === "learned"
                            ? "bg-indigo-100 text-indigo-700"
                            : t.routedVia === "model"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-stone-100 text-stone-500"
                        }`}
                        title={t.routingReason}
                      >
                        {ROUTED_VIA_LABEL[t.routedVia ?? "default"] ?? t.routedVia}
                      </span>
                      <span className="ml-auto font-mono text-[9.5px] text-[var(--muted)]">
                        {t.id}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <select
                        value={team}
                        onChange={(e) => onReassign(t.id, e.target.value)}
                        title="Move to another team — the router treats this as a correction"
                        className="rounded border border-[var(--line)] bg-white px-1 py-0.5 text-[10px] text-stone-600"
                      >
                        {TEAMS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <span className="ml-auto text-[9.5px] tabular-nums text-[var(--muted)]">
                        {timeOf(t.createdAt)}
                      </span>
                    </div>
                    {note?.ticketId === t.id && (
                      <div
                        className={`fade-up mt-1.5 rounded-md px-2 py-1 text-[10px] font-medium ${
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
