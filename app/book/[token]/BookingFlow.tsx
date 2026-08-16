"use client";

import { useState } from "react";

const SLOTS = ["Tue 10:00", "Wed 14:00", "Thu 16:00"];

/** Mobile-first mini flow: slot → (fake) deposit → confirmed. Slots are
 * hardcoded and the deposit button is a prop, not a payment — the demo point
 * is the chain completing, not the calendar. */
export function BookingFlow({
  token,
  firstName,
  practice,
  treatment,
}: {
  token: string;
  firstName: string;
  practice: string;
  treatment: "check-up" | "whitening";
}) {
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "pay" | "done">("pick");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const r = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, slot, treatment }),
      });
      if (r.ok) setStep("done");
    } finally {
      setBusy(false);
    }
  };

  const label = treatment === "whitening" ? "Whitening session" : "6-month check-up";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-6 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/onehealth-logo.svg" alt="01Health" className="h-4 self-start" />

      {step === "done" ? (
        <div className="fade-up mt-16 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[22px] text-[var(--ok)]">
            ✓
          </div>
          <div className="text-[17px] font-semibold">Booked! See you {slot}</div>
          <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
            {label} at {practice}. We&rsquo;ve let the practice know — you&rsquo;ll get a
            reminder the day before.
          </p>
        </div>
      ) : (
        <>
          <h1 className="mt-10 text-[19px] font-semibold leading-snug">
            Hi {firstName} — book your {label.toLowerCase()}
          </h1>
          <p className="mt-1 text-[12.5px] text-[var(--ink-2)]">{practice}</p>

          <div className="label mt-8">Available times</div>
          <div className="mt-2 flex flex-col gap-2">
            {SLOTS.map((s) => (
              <button
                key={s}
                onClick={() => setSlot(s)}
                className={`rounded-lg border px-4 py-3 text-left text-[14px] font-medium transition-all duration-150 ease-out ${
                  slot === s
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] bg-white hover:border-[var(--line-strong)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {step === "pick" ? (
            <button
              onClick={() => slot && setStep("pay")}
              disabled={!slot}
              className="mt-8 rounded-lg bg-[var(--accent)] px-5 py-3 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <div className="fade-up mt-8 flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-white px-4 py-3">
                <span className="text-[13px]">Booking deposit</span>
                <span className="text-[14px] font-semibold tabular-nums">£30</span>
              </div>
              <button
                onClick={confirm}
                disabled={busy}
                className="rounded-lg bg-[var(--accent)] px-5 py-3 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Confirming…" : "Pay £30 deposit · confirm"}
              </button>
              <p className="text-center text-[10.5px] text-[var(--ink-3)]">
                Demo — no payment is taken.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
