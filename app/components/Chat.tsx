"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHIPS,
  TEAM_COLORS,
  type UiMessage,
  type UiPrincipal,
  type UiToolCall,
} from "../lib/ui-types";

/** Markdown-lite: bold, inline code and pipe tables — the model emits nothing
 * fancier here. Newlines are preserved by the surrounding whitespace-pre-wrap. */
function mdLite(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-stone-100 px-1 py-px font-mono text-[12px]">
          {p.slice(1, -1)}
        </code>
      );
    }
    return p;
  });
}

const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
const isTableDivider = (s: string) => /^\s*\|[\s:|-]+\|\s*$/.test(s);
const splitRow = (s: string) =>
  s
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Message body renderer: pipe-table blocks become real tables, everything
 * around them goes through mdLite. */
function renderContent(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let buf: string[] = [];
  const flushText = () => {
    const chunk = buf.join("\n").replace(/^\n+|\n+$/g, "");
    if (chunk) out.push(<span key={`t${out.length}`}>{mdLite(chunk)}</span>);
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i]) && isTableDivider(lines[i + 1] ?? "")) {
      flushText();
      const header = splitRow(lines[i]);
      i += 1; // skip the divider
      const rows: string[][] = [];
      while (i + 1 < lines.length && isTableRow(lines[i + 1]) && !isTableDivider(lines[i + 1])) {
        rows.push(splitRow(lines[++i]));
      }
      out.push(
        <div key={`table${out.length}`} className="my-2 overflow-x-auto whitespace-normal">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th
                    key={j}
                    className="border border-[var(--line)] bg-stone-50 px-2.5 py-1.5 text-left font-semibold"
                  >
                    {mdLite(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j}>
                  {header.map((_, k) => (
                    <td key={k} className="border border-[var(--line)] px-2.5 py-1.5">
                      {mdLite(r[k] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else {
      buf.push(lines[i]);
    }
  }
  flushText();
  return out;
}

function ToolChip({ c }: { c: UiToolCall }) {
  const argsSummary = summariseArgs(c.args);
  return (
    <span
      title={c.allowed ? undefined : `${c.errorCode}: ${c.reason ?? ""}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        c.allowed
          ? "border-green-200 bg-[var(--allow-soft)] text-[var(--allow)]"
          : "border-red-200 bg-[var(--deny-soft)] text-[var(--deny)]"
      }`}
    >
      <span>{c.allowed ? "✓" : "⛔"}</span>
      <span className="font-mono">
        {c.tool}
        {argsSummary ? `(${argsSummary})` : "()"}
      </span>
    </span>
  );
}

function summariseArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const o = args as Record<string, unknown>;
  const bits: string[] = [];
  for (const k of ["patientId", "caseId", "query", "subject", "team_suggestion"]) {
    if (typeof o[k] === "string") {
      const v = o[k] as string;
      bits.push(v.length > 24 ? `${v.slice(0, 24)}…` : v);
    }
  }
  return bits.join(", ");
}

function ToolStrip({ calls }: { calls: UiToolCall[] }) {
  const [open, setOpen] = useState(false);
  if (!calls.length) return null;
  const denies = calls.filter((c) => !c.allowed).length;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-medium text-[var(--muted)] transition hover:text-stone-700"
      >
        {open ? "▾" : "▸"} {calls.length} tool call{calls.length === 1 ? "" : "s"}
        {denies > 0 && <span className="text-[var(--deny)]"> · {denies} denied</span>}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {calls.map((c, i) => (
            <ToolChip key={i} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Chat({
  principal,
  messages,
  busy,
  keyMissing,
  onSend,
  onFeedback,
  onOpenTicket,
}: {
  principal: UiPrincipal;
  messages: UiMessage[];
  busy: boolean;
  keyMissing: boolean;
  onSend: (text: string) => void;
  onFeedback: (messageId: string, rating: "up" | "down") => void;
  onOpenTicket: (ticketId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const chips = CHIPS[principal.id] ?? [];

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    onSend(t);
  };

  return (
    // min-h-0 at every level: without it a long thread grows this column past
    // the viewport and pushes the composer off-screen instead of scrolling.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-14 text-center">
              <div className="text-[15px] font-medium text-stone-600">
                Ask something as {principal.name}
              </div>
              <div className="mx-auto mt-2 max-w-[440px] text-[12.5px] leading-relaxed text-[var(--muted)]">
                The assistant reaches data only through the governed layer, as this user. Watch the
                audit log on the right — every tool call it makes lands there, allowed or denied.
              </div>
              <div className="mt-3 text-[11.5px] text-stone-400">
                Try a suggestion below — the ⛔ ones are supposed to be refused.
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`fade-up ${m.role === "user" ? "self-end" : "self-start"} max-w-[92%]`}>
              {m.role === "user" ? (
                <div className="rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-2.5 text-[13.5px] leading-relaxed text-white shadow-sm">
                  {m.content}
                </div>
              ) : m.notice ? (
                // Board update for a ticket this user raised — injected by the
                // app, not spoken by the model, and styled so the difference
                // is visible.
                <button
                  onClick={() => onOpenTicket(m.notice!.ticketId)}
                  title="Open on the ticket board"
                  className="block w-full rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-indigo-900 shadow-sm transition hover:border-indigo-400"
                >
                  <span className="mr-1.5">📣</span>
                  {m.content}{" "}
                  <span className="ml-1 text-[11px] font-medium text-indigo-500">
                    View on board →
                  </span>
                </button>
              ) : (
                <div
                  className={`rounded-2xl rounded-bl-md border px-4 py-3 text-[13.5px] leading-relaxed shadow-sm ${
                    m.error
                      ? "border-red-200 bg-[var(--deny-soft)] text-[var(--deny)]"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{renderContent(m.content)}</div>

                  {m.toolCalls?.some((c) => !c.allowed) && (
                    <div className="mt-2.5 space-y-1">
                      {m.toolCalls
                        .filter((c) => !c.allowed)
                        .map((c, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-amber-200 bg-[var(--warn-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--warn)]"
                          >
                            ⛔ <span className="font-mono">{c.tool}({summariseArgs(c.args)})</span>{" "}
                            — {c.errorCode === "OUT_OF_SCOPE" ? "out of scope" : c.errorCode}
                          </div>
                        ))}
                    </div>
                  )}

                  {m.tickets?.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onOpenTicket(t.id)}
                      title="Open on the ticket board"
                      className="group mt-2.5 block w-full rounded-xl border border-[var(--line)] bg-stone-50 px-3 py-2.5 text-left transition hover:border-[var(--accent)] hover:bg-white"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${TEAM_COLORS[t.team] ?? "bg-stone-200"}`}
                        >
                          {t.team}
                        </span>
                        <span className="text-[12.5px] font-medium">{t.subject}</span>
                        <span className="ml-auto font-mono text-[10.5px] text-[var(--muted)]">
                          {t.id}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
                        {t.routingReason}
                      </div>
                      <div className="mt-1 text-[10.5px] font-medium text-[var(--accent)] opacity-0 transition group-hover:opacity-100">
                        View on board →
                      </div>
                    </button>
                  ))}

                  {m.toolCalls && <ToolStrip calls={m.toolCalls} />}

                  {!m.error && (
                    <div className="mt-2 flex gap-1.5">
                      {(["up", "down"] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => onFeedback(m.id, r)}
                          disabled={Boolean(m.feedback)}
                          className={`rounded-md px-1.5 py-0.5 text-[13px] transition ${
                            m.feedback === r
                              ? "bg-stone-200"
                              : m.feedback
                                ? "opacity-25"
                                : "opacity-40 hover:bg-stone-100 hover:opacity-100"
                          }`}
                          title={r === "up" ? "Helpful" : "Not helpful"}
                        >
                          {r === "up" ? "👍" : "👎"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="fade-up flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-[var(--line)] bg-white px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="thinking-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--line)] bg-white/70 px-6 py-4">
        <div className="mx-auto max-w-[720px]">
          {keyMissing && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-[var(--warn-soft)] px-3 py-2 text-[12px] text-[var(--warn)]">
              The Anthropic API key on the server has no credit — chat is disabled until it is
              topped up. The proof script and audit trail still work.
            </div>
          )}
          {chips.length > 0 && (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">
                try
              </span>
              {chips.map((c) => (
                <button
                  key={c.label}
                  onClick={() => send(c.text)}
                  disabled={busy}
                  title={c.text}
                  className={`rounded-full border px-3 py-1 text-[11.5px] transition disabled:opacity-40 ${
                    c.kind === "redteam"
                      ? "border-red-200 bg-red-50/60 text-red-700 hover:border-red-400"
                      : c.kind === "learn1" || c.kind === "learn2"
                        ? "border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:border-indigo-400"
                        : "border-[var(--line)] bg-white text-stone-600 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message as ${principal.name}…`}
              disabled={busy}
              className="flex-1 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-[13.5px] outline-none transition placeholder:text-stone-400 focus:border-[var(--accent)] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
