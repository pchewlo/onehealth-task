"use client";

import { useState } from "react";
import type { CorrectionNote } from "./RightRail";
import {
  ROUTED_VIA_LABEL,
  STATUS_COLUMNS,
  TEAMS,
  TEAM_COLORS,
  type UiComment,
  type UiPrincipal,
  type UiTicket,
} from "../lib/ui-types";

function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Kanban board of the active principal's tickets — same scoped
 * `/api/tickets?principalId=` data as the rail, so it shows exactly (and only)
 * what this user may see. Three different acts live here, deliberately apart:
 *   - drag a card between COLUMNS  → workflow status (To Do → … → Done)
 *   - change the TEAM on a card    → routing correction — the router learns
 *   - COMMENT on a card            → a note; the creator hears about it
 */
export function TicketBoard({
  principal,
  tickets,
  comments,
  note,
  focusTicketId,
  onReassign,
  onStatusChange,
  onComment,
}: {
  principal: UiPrincipal;
  tickets: UiTicket[];
  comments: UiComment[];
  note: CorrectionNote | null;
  focusTicketId: string | null;
  onReassign: (ticketId: string, team: string) => void;
  onStatusChange: (ticketId: string, status: string) => void;
  onComment: (ticketId: string, text: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commentsFor = (ticketId: string) => comments.filter((c) => c.ticketId === ticketId);

  const submitComment = (ticketId: string) => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onComment(ticketId, text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-2 px-6 pb-1 pt-4">
        <h2 className="text-[13px] font-semibold">{principal.name}&rsquo;s tickets</h2>
        <span className="text-[11px] text-[var(--muted)]">
          drag a card to update its status · change a card&rsquo;s team to correct routing (the
          router learns from it) · comments notify whoever raised the ticket
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-5 pt-2">
        {STATUS_COLUMNS.map((col) => {
          const cards = tickets.filter((t) => (t.status || "todo") === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                if (dragId) onStatusChange(dragId, col.key);
                setDragId(null);
              }}
              className={`flex min-h-0 w-[250px] shrink-0 flex-col rounded-xl border bg-white/60 transition ${
                overCol === col.key
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                  : "border-[var(--line)]"
              }`}
            >
              <header className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  {col.label}
                </span>
                <span className="ml-auto text-[10.5px] tabular-nums text-[var(--muted)]">
                  {cards.length}
                </span>
              </header>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                {cards.length === 0 && (
                  <p className="px-1 pt-1 text-[10.5px] text-stone-400">
                    {overCol === col.key ? "Drop here" : "No tickets"}
                  </p>
                )}
                {cards.map((t) => {
                  const tComments = commentsFor(t.id);
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      ref={(el) => {
                        if (el && t.id === focusTicketId) {
                          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                        }
                      }}
                      className={`fade-up cursor-grab rounded-lg border bg-white px-2.5 py-2 transition-shadow active:cursor-grabbing ${
                        t.id === focusTicketId
                          ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
                          : dragId === t.id
                            ? "border-stone-300 opacity-60"
                            : "border-[var(--line)]"
                      }`}
                    >
                      <div className="text-[11.5px] font-medium leading-snug" title={t.subject}>
                        {t.subject}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <select
                          value={t.team}
                          onChange={(e) => onReassign(t.id, e.target.value)}
                          title="Correct the team — the router treats this as training signal"
                          className={`appearance-none rounded-full border-0 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide transition hover:ring-2 hover:ring-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-300 ${TEAM_COLORS[t.team] ?? "bg-stone-200"}`}
                        >
                          {TEAMS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <span
                          className={`rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide ${
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

                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          onClick={() => {
                            setDraft("");
                            setOpenComments(openComments === t.id ? null : t.id);
                          }}
                          className="text-[10px] font-medium text-stone-500 transition hover:text-[var(--accent)]"
                        >
                          💬 {tComments.length || ""}{" "}
                          {openComments === t.id ? "hide" : tComments.length ? "comments" : "comment"}
                        </button>
                        <span className="ml-auto text-[9.5px] tabular-nums text-[var(--muted)]">
                          {timeOf(t.createdAt)}
                        </span>
                      </div>

                      {openComments === t.id && (
                        <div className="fade-up mt-1.5 space-y-1 border-t border-dashed border-[var(--line)] pt-1.5">
                          {tComments.map((c) => (
                            <div key={c.id} className="text-[10.5px] leading-snug">
                              <span className="font-semibold text-stone-600">{c.byName}</span>{" "}
                              <span className="text-[9px] text-[var(--muted)]">{timeOf(c.ts)}</span>
                              <div className="text-stone-700">{c.text}</div>
                            </div>
                          ))}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              submitComment(t.id);
                            }}
                            className="flex gap-1 pt-0.5"
                          >
                            <input
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Add a comment…"
                              className="min-w-0 flex-1 rounded border border-[var(--line)] px-1.5 py-1 text-[10.5px] outline-none focus:border-[var(--accent)]"
                            />
                            <button
                              type="submit"
                              disabled={!draft.trim()}
                              className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
                            >
                              Post
                            </button>
                          </form>
                        </div>
                      )}

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
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
