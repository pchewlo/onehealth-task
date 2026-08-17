"use client";

import { useCallback, useEffect, useState } from "react";
import { PILL_NEUTRAL, type UiPrincipal } from "../lib/ui-types";

interface GrowthPatient {
  id: string;
  name: string;
  status: string;
  practice: string;
  hasPhone: boolean;
}

interface UiBooking {
  id: string;
  ts: string;
  patientName: string;
  practice: string;
  slot: string;
  treatment: string;
}

interface RemindResult {
  patientId: string;
  sent: boolean;
  sendError?: string;
  link: string;
}

/**
 * M10 — the growth surface (staff only). One button per patient starts the
 * loop: reminder over WhatsApp → signed booking link → slot → the booking
 * lands back here. Demo props, real thread.
 */
export function GrowthTab({ principal }: { principal: UiPrincipal }) {
  const [patients, setPatients] = useState<GrowthPatient[]>([]);
  const [bookings, setBookings] = useState<UiBooking[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RemindResult>>({});

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/growth?principalId=${principal.id}`);
    if (!r.ok) return;
    const j = await r.json();
    setPatients(j.patients ?? []);
    setBookings(j.bookings ?? []);
  }, [principal.id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const remind = async (patientId: string, action: "checkup" | "whitening" = "checkup") => {
    setSending(patientId + action);
    try {
      const r = await fetch("/api/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ principalId: principal.id, patientId, action }),
      });
      const j = await r.json();
      if (r.ok) setResults((m) => ({ ...m, [patientId]: { patientId, ...j } }));
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-[680px] flex-col gap-3.5">
        <div>
          <h2 className="text-[13px] font-semibold">Growth</h2>
          <p className="text-[11px] text-[var(--ink-3)]">
            one button → WhatsApp reminder → signed booking link → the booking lands below · same
            doorway, pointed at revenue
          </p>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-white">
          <div className="label px-4 pb-1 pt-3">Outreach — check-up reminders · whitening offers</div>
          {patients.map((p) => {
            const res = results[p.id];
            return (
              <div key={p.id} className="border-t border-[var(--surface-2)] px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-[13px] font-medium">{p.name}</span>
                  <span className="text-[11px] text-[var(--ink-3)]">{p.practice}</span>
                  {!p.hasPhone && (
                    <span className="text-[10px] text-[var(--ink-3)]" title="Demo maps one WhatsApp number">
                      no mapped phone
                    </span>
                  )}
                  <div className="ml-auto flex gap-1.5">
                    <button
                      onClick={() => remind(p.id, "whitening")}
                      disabled={sending === p.id + "whitening"}
                      className="rounded-md border border-[var(--accent)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
                    >
                      {sending === p.id + "whitening" ? "Sending…" : "Whitening offer"}
                    </button>
                    <button
                      onClick={() => remind(p.id, "checkup")}
                      disabled={sending === p.id + "checkup"}
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {sending === p.id + "checkup" ? "Sending…" : "Check-up reminder"}
                    </button>
                  </div>
                </div>
                {res && (
                  <div className="fade-up mt-1.5 text-[11px] leading-relaxed text-[var(--ink-2)]">
                    {res.sent ? (
                      <>✓ Sent over WhatsApp — booking link live.</>
                    ) : (
                      <>
                        Reminder created; WhatsApp send unavailable
                        {res.sendError ? ` (${res.sendError.slice(0, 90)})` : ""} — use the link
                        directly:
                      </>
                    )}{" "}
                    <a
                      href={res.link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--accent-ink)] underline decoration-[var(--line-strong)] underline-offset-2"
                    >
                      open booking page →
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-white">
          <div className="flex items-baseline px-4 pb-1 pt-3">
            <span className="label">Bookings</span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
              {bookings.length}
            </span>
          </div>
          {bookings.length === 0 && (
            <p className="border-t border-[var(--surface-2)] px-4 py-3 text-[11.5px] text-[var(--ink-3)]">
              None yet — when a patient books from the link, it appears here.
            </p>
          )}
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 border-t border-[var(--surface-2)] px-4 py-2.5">
              <span className="text-[13px] font-medium">{b.patientName}</span>
              <span className={PILL_NEUTRAL}>{b.treatment}</span>
              <span className="text-[12px] text-[var(--ink-2)]">{b.slot}</span>
              <span className="ml-auto text-[11px] text-[var(--ink-3)]">{b.practice}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-dashed border-[var(--line)] px-4 py-2.5 text-[11px] text-[var(--ink-3)]">
          Demo props: slots are fixed, the deposit is a button, and the whitening preview is a
          canned pair — the thread (button → WhatsApp → link → book → here) is real.
        </div>
      </div>
    </div>
  );
}
