"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHIPS,
  PILL_NEUTRAL,
  type UiMessage,
  type UiPrincipal,
  type UiToolCall,
} from "../lib/ui-types";

function stamp(ts?: string): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Machine tokens the model echoes from tool results, rendered as quiet mono
 * pills (never coloured — near-monochrome system). Only unambiguous tokens
 * are treated; words like "refinement" also occur as prose and stay text.
 */
const TOKEN_LABEL: Record<string, string> = {
  in_treatment: "In treatment",
  aligners_in_production: "Aligners in production",
  treatment_planning: "Treatment planning",
  SOLO: "SOLO",
  DUO: "DUO",
};

const TOKEN_RE = /\b(in_treatment|aligners_in_production|treatment_planning|SOLO|DUO)\b/g;

function renderPlain(text: string, keyBase: string): React.ReactNode[] {
  return text.split(TOKEN_RE).map((seg, i) => {
    const label = TOKEN_LABEL[seg];
    if (!label) return seg;
    return (
      <span
        key={`${keyBase}_${i}`}
        className="mx-0.5 inline-block rounded-full bg-[var(--surface-2)] px-2 py-px align-baseline font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]"
      >
        {label}
      </span>
    );
  });
}

/** Markdown-lite: bold, inline code and pipe tables — the model emits nothing
 * fancier here. Newlines are preserved by the surrounding whitespace-pre-wrap. */
function mdLite(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{renderPlain(p.slice(2, -2), `b${i}`)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-[var(--surface-2)] px-1 py-px font-mono text-[12px]">
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{renderPlain(p, `p${i}`)}</span>;
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

/** Message body renderer: pipe-table blocks become real tables (surface-2
 * mono header, hairline rows), everything around them goes through mdLite. */
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
        <div
          key={`table${out.length}`}
          className="my-2.5 overflow-hidden whitespace-normal rounded-lg border border-[var(--line)]"
        >
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[var(--surface-2)]">
                {header.map((h, j) => (
                  <th
                    key={j}
                    className="border-b border-[var(--line)] px-2.5 py-1.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-2)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j} className="border-b border-[var(--surface-2)] last:border-0">
                  {header.map((_, k) => (
                    <td key={k} className="px-2.5 py-[7px]">
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

const callSig = (c: UiToolCall) => {
  const a = summariseArgs(c.args);
  return `${c.tool}(${a})`;
};

/** One quiet mono line for the allowed calls: "✓ get_case(C1) · create_ticket(…)".
 * Denials render separately as deny rows. */
function ToolLine({ calls }: { calls: UiToolCall[] }) {
  const allowed = calls.filter((c) => c.allowed);
  if (!allowed.length) return null;
  return (
    <div className="mt-2.5 font-mono text-[11px] text-[var(--ink-3)]" title="Tool calls this reply made through the governed layer">
      <span className="text-[var(--ok)]">✓</span> {allowed.map(callSig).join(" · ")}
    </div>
  );
}

export function Chat({
  principal,
  messages,
  busy,
  keyMissing,
  onSend,
  onResolve,
  onOpenTicket,
}: {
  principal: UiPrincipal;
  messages: UiMessage[];
  busy: boolean;
  keyMissing: boolean;
  onSend: (text: string) => void;
  onResolve: (messageId: string, verdict: "yes" | "bad_answer" | "confusion") => void;
  onOpenTicket: (ticketId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const chips = CHIPS[principal.id] ?? [];
  // Patients have no ticket board, so nothing in their chat may link to one —
  // ticket cards are a plain confirmation, and routing internals stay hidden.
  const hasBoard = principal.type !== "patient";

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
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-[680px] flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-14 text-center">
              <div className="text-[15px] font-semibold text-[var(--ink)]">
                Ask something as {principal.name}
              </div>
              <div className="mx-auto mt-2 max-w-[440px] text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                The assistant reaches data only through the governed layer, as this user.
                {hasBoard &&
                  " Watch the audit log on the right — every tool call it makes lands there, allowed or denied."}
              </div>
              <div className="mt-3 text-[11.5px] text-[var(--ink-3)]">
                Try a suggestion below — some are supposed to be refused.
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`fade-up flex flex-col ${m.role === "user" ? "items-end self-end" : "items-stretch self-start"} ${m.role === "user" ? "max-w-[78%]" : "max-w-[88%]"}`}
            >
              {m.role === "user" ? (
                <>
                  <div className="rounded-[12px] rounded-br-[4px] bg-[var(--accent)] px-3.5 py-[9px] leading-normal text-white">
                    {m.content}
                  </div>
                  {stamp(m.ts) && (
                    <div className="mt-1 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                      {stamp(m.ts)}
                    </div>
                  )}
                </>
              ) : m.resolveAsk ? (
                <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)]/60 px-3.5 py-3">
                  <div className="text-[12.5px] font-medium text-[var(--ink)]">
                    Did this resolve your query?
                  </div>
                  {m.resolveAnswer ? (
                    <div className="mt-1.5 text-[11.5px] text-[var(--ink-2)]">
                      {m.resolveAnswer === "yes"
                        ? "Thanks — logged as resolved. Your next message starts a fresh conversation."
                        : m.resolveAnswer === "skipped"
                          ? "Skipped — the conversation continued."
                          : "Thanks — logged as unresolved. Your next message starts a fresh conversation."}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(
                        [
                          ["yes", "Yes, resolved"],
                          ["bad_answer", "No — wrong answer"],
                          ["confusion", "No — still need help"],
                        ] as const
                      ).map(([verdict, label]) => (
                        <button
                          key={verdict}
                          onClick={() => onResolve(m.id, verdict)}
                          className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[11.5px] text-[var(--ink-2)] transition-all duration-150 ease-out hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : m.notice ? (
                // Board update for a ticket this user raised — injected by the
                // app, not spoken by the model, styled so the difference shows.
                <button
                  onClick={() => hasBoard && onOpenTicket(m.notice!.ticketId)}
                  disabled={!hasBoard}
                  title={hasBoard ? "Open on the ticket board" : undefined}
                  className={`block w-full rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)]/60 px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-[var(--accent-ink)] transition-all duration-150 ease-out ${hasBoard ? "hover:border-[var(--accent)]" : "cursor-default"}`}
                >
                  {m.content}
                  {hasBoard && <span className="ml-1.5 font-medium">View on board →</span>}
                  {stamp(m.ts) && (
                    <span className="ml-2 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                      {stamp(m.ts)}
                    </span>
                  )}
                </button>
              ) : (
                <div
                  className={`rounded-[12px] rounded-bl-[4px] border px-3.5 py-3 ${
                    m.error
                      ? "border-[var(--deny-line)] bg-[var(--deny-soft)] text-[var(--deny)]"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-[1.55]">{renderContent(m.content)}</div>

                  {m.tickets?.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => hasBoard && onOpenTicket(t.id)}
                      disabled={!hasBoard}
                      title={hasBoard ? "Open on the ticket board" : undefined}
                      className={`group mt-2.5 flex w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-left transition-all duration-150 ease-out ${hasBoard ? "hover:border-[var(--accent)]" : "cursor-default"}`}
                    >
                      <span className={PILL_NEUTRAL}>{t.team}</span>
                      <span className="min-w-0 truncate text-[12px] font-medium" title={t.subject}>
                        {hasBoard ? t.subject : `Ticket raised: ${t.subject}`}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--ink-3)]">
                        {t.id}
                      </span>
                      {hasBoard && (
                        <span className="shrink-0 text-[11px] font-medium text-[var(--accent-ink)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          →
                        </span>
                      )}
                    </button>
                  ))}

                  {m.toolCalls
                    ?.filter((c) => !c.allowed)
                    .map((c, i) => (
                      <div
                        key={i}
                        title={c.reason}
                        className="mt-2.5 flex items-center gap-2 rounded-lg border border-[var(--deny-line)] bg-[var(--deny-soft)] px-3 py-[7px] text-[12px] text-[var(--deny)]"
                      >
                        <span>✕</span>
                        <span className="font-mono text-[11px]">
                          {callSig(c)} · {c.errorCode === "OUT_OF_SCOPE" ? "out of scope" : c.errorCode}
                        </span>
                      </div>
                    ))}

                  {m.toolCalls && <ToolLine calls={m.toolCalls} />}

                  {stamp(m.ts) && (
                    <div className="mt-1.5 text-right font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                      {stamp(m.ts)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="fade-up flex items-center gap-1.5 self-start rounded-[12px] rounded-bl-[4px] border border-[var(--line)] bg-white px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--line)] bg-white px-6 pb-4 pt-3">
        <div className="mx-auto flex max-w-[680px] flex-col gap-2.5">
          {keyMissing && (
            <div className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-3 py-2 text-[12px] text-[var(--warn)]">
              The Anthropic API key on the server has no credit — chat is disabled until it is
              topped up. The proof script and audit trail still work.
            </div>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="label mr-0.5 !text-[var(--ink-3)]">Try</span>
              {chips.map((c) => (
                <button
                  key={c.label}
                  onClick={() => send(c.text)}
                  disabled={busy}
                  title={c.text}
                  className="whitespace-nowrap rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[11.5px] text-[var(--ink-2)] transition-all duration-150 ease-out hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-40"
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
              className="flex-1 rounded-lg border border-[var(--line)] bg-white px-3.5 py-[9px] text-[13px] outline-none transition-all duration-150 ease-out placeholder:text-[var(--ink-3)] focus:border-[var(--accent)] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-lg bg-[var(--accent)] px-[18px] py-[9px] text-[13px] font-semibold text-white transition-all duration-150 ease-out hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
