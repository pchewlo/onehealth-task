"use client";

import { useState } from "react";
import type { CorrectionNote } from "./RightRail";
import {
  PILL_NEUTRAL,
  ROUTED_VIA_LABEL,
  STATUS_COLUMNS,
  TEAMS,
  VIA_PILL,
  type UiComment,
  type UiPrincipal,
  type UiTicket,
} from "../lib/ui-types";

function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Kanban board — restyled per design_handoff_dashboard_redesign; logic
 * unchanged. Same scoped `/api/tickets?principalId=` data as the rail, so it
 * shows exactly (and only) what this user may see. Three acts, kept apart:
 *   - drag a card between COLUMNS  → workflow status (To do → … → Done)
 *   - change the TEAM on a card    → routing correction — the router learns
 *   - COMMENT on a card            → a note; the creator hears about it
 * Staff and account-managed dentists get all three; a dentist with no account
 * manager gets view access only. (Patients never reach this board at all.)
 */
export function TicketBoard({
  principal,
  principals,
  tickets,
  comments,
  note,
  focusTicketId,
  onReassign,
  onStatusChange,
  onComment,
}: {
  principal: UiPrincipal;
  principals: UiPrincipal[];
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

  const nameOf = (id?: string) => principals.find((p) => p.id === id)?.name ?? id ?? "—";

  // Owner = the practice's account manager if one exists, else the dentist.
  // New tickets carry ownerId from the server; this derives it for older ones.
  const ownerOf = (t: UiTicket): string => {
    if (t.ownerId) return nameOf(t.ownerId);
    const creator = principals.find((p) => p.id === t.createdBy);
    const dentistId = creator?.dentistId;
    if (!dentistId) return creator?.name ?? "—";
    const manager = principals.find(
      (p) => p.type === "internal_staff" && p.manages?.includes(dentistId),
    );
    return (
      manager?.name ??
      principals.find((p) => p.type === "dentist" && p.dentistId === dentistId)?.name ??
      creator?.name ??
      "—"
    );
  };

  const hasManager =
    principal.type === "dentist" &&
    Boolean(principal.dentistId) &&
    principals.some(
      (p) => p.type === "internal_staff" && p.manages?.includes(principal.dentistId!),
    );
  const readOnly = principal.type === "dentist" && !hasManager;

  const commentsFor = (ticketId: string) => comments.filter((c) => c.ticketId === ticketId);

  const submitComment = (ticketId: string) => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onComment(ticketId, text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-2.5 px-6 pb-1 pt-4">
        <h2 className="text-[13px] font-semibold">{principal.name}&rsquo;s tickets</h2>
        <span className="text-[11px] text-[var(--ink-3)]">
          {readOnly
            ? "view only — this practice has no account manager"
            : "drag to move · change a team to correct routing (the router learns from it) · comments notify whoever raised the ticket"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-5 pt-3">
        {STATUS_COLUMNS.map((col) => {
          const cards = tickets.filter((t) => (t.status || "todo") === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setOverCol(null);
                if (dragId) onStatusChange(dragId, col.key);
                setDragId(null);
              }}
              className={`flex min-h-0 w-[252px] shrink-0 flex-col rounded-lg border transition-all duration-150 ease-out ${
                overCol === col.key
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                  : "border-[var(--line)] bg-white/60"
              }`}
            >
              <header className="flex items-center gap-[7px] px-3 pb-1.5 pt-2.5">
                <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                <span className="label">{col.label}</span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                  {cards.length}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-1.5">
                {cards.length === 0 && (
                  <p className="px-1 pt-0.5 text-[11px] text-[var(--ink-3)]">
                    {!readOnly && overCol === col.key ? "Drop here" : "No tickets"}
                  </p>
                )}
                {cards.map((t) => {
                  const tComments = commentsFor(t.id);
                  return (
                    <div
                      key={t.id}
                      draggable={!readOnly}
                      onDragStart={() => !readOnly && setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      ref={(el) => {
                        if (el && t.id === focusTicketId) {
                          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                        }
                      }}
                      className={`fade-up rounded-lg border bg-white px-3 py-2.5 transition-all duration-150 ease-out ${readOnly ? "" : "cursor-grab active:cursor-grabbing"} ${
                        t.id === focusTicketId
                          ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
                          : dragId === t.id
                            ? "border-[var(--line-strong)] opacity-60"
                            : "border-[var(--line)] hover:border-[var(--line-strong)]"
                      }`}
                    >
                      <div className="text-[12.5px] font-medium leading-[1.4]" title={t.subject}>
                        {t.subject}
                      </div>

                      <div className="mt-2 flex items-center gap-1.5">
                        {readOnly ? (
                          <span className={PILL_NEUTRAL}>{t.team}</span>
                        ) : (
                          <select
                            value={t.team}
                            onChange={(e) => onReassign(t.id, e.target.value)}
                            title="Change team to correct routing — the router learns from it"
                            className={`${PILL_NEUTRAL} cursor-pointer appearance-none bg-transparent transition-all duration-150 ease-out hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none`}
                          >
                            {TEAMS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                        <span
                          className={`whitespace-nowrap rounded-full px-[7px] py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] ${VIA_PILL[t.routedVia ?? "default"] ?? VIA_PILL.default}`}
                          title={t.routingReason}
                        >
                          {ROUTED_VIA_LABEL[t.routedVia ?? "default"] ?? t.routedVia}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-[var(--ink-3)]">
                          {t.id}
                        </span>
                      </div>

                      <div className="mt-[7px] flex items-center gap-1.5 text-[10.5px] text-[var(--ink-3)]">
                        <span title="Raised by · owner (account manager if the practice has one)">
                          {nameOf(t.createdBy)} · owner {ownerOf(t)}
                        </span>
                        <span className="ml-auto font-mono tabular-nums">{timeOf(t.createdAt)}</span>
                      </div>

                      {(!readOnly || tComments.length > 0) && (
                        <button
                          onClick={() => {
                            setDraft("");
                            setOpenComments(openComments === t.id ? null : t.id);
                          }}
                          className="mt-1.5 text-[10.5px] font-medium text-[var(--ink-3)] transition-colors duration-150 hover:text-[var(--accent-ink)]"
                        >
                          {openComments === t.id
                            ? "▾ hide comments"
                            : tComments.length
                              ? `▸ ${tComments.length} comment${tComments.length === 1 ? "" : "s"}`
                              : "▸ comment"}
                        </button>
                      )}

                      {openComments === t.id && (
                        <div className="fade-up mt-1.5 flex flex-col gap-1 border-t border-dashed border-[var(--line)] pt-1.5">
                          {tComments.map((c) => (
                            <div key={c.id} className="text-[10.5px] leading-snug">
                              <span className="font-semibold text-[var(--ink-2)]">{c.byName}</span>{" "}
                              <span className="font-mono text-[9px] text-[var(--ink-3)]">
                                {timeOf(c.ts)}
                              </span>
                              <div className="text-[var(--ink)]">{c.text}</div>
                            </div>
                          ))}
                          {!readOnly && (
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
                                className="min-w-0 flex-1 rounded-md border border-[var(--line)] px-1.5 py-1 text-[10.5px] outline-none transition-colors duration-150 placeholder:text-[var(--ink-3)] focus:border-[var(--accent)]"
                              />
                              <button
                                type="submit"
                                disabled={!draft.trim()}
                                className="rounded-md bg-[var(--accent)] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
                              >
                                Post
                              </button>
                            </form>
                          )}
                        </div>
                      )}

                      {note?.ticketId === t.id && (
                        <div
                          className={`fade-up mt-1.5 rounded-md px-2 py-1 text-[10px] font-medium ${
                            note.kind === "learned"
                              ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                              : note.kind === "retired"
                                ? "bg-[var(--warn-soft)] text-[var(--warn)]"
                                : "bg-[var(--surface-2)] text-[var(--ink-2)]"
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
