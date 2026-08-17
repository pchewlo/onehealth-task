"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * M10 Feature B — whitening preview, Option 2 (canned). The upload is real,
 * the "analysis" is a spinner, the after-image is a pre-baked illustration —
 * and the demo says so out loud. Live, this step calls an image-edit model
 * with a tightly constrained prompt; the governance point stands either way:
 * the output carries a visible "indicative only" caption, and whether the
 * offer appears at all is the kind of per-practice commercial setting the
 * doorway governs.
 */

function WhiteningInner() {
  const params = useSearchParams();
  const token = params.get("t");
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [phase, setPhase] = useState<"upload" | "analysing" | "result">("upload");

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setPhoto(URL.createObjectURL(f));
    setPhase("analysing");
    setTimeout(() => setPhase("result"), 2500);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-6 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/onehealth-logo.svg" alt="01Health" className="h-4 self-start" />
      <h1 className="mt-10 text-[19px] font-semibold leading-snug">Whitening preview</h1>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
        Upload a quick photo and see a realistic preview of what a few whitening sessions could
        achieve.
      </p>

      {phase === "upload" && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-8 rounded-lg border border-dashed border-[var(--line-strong)] bg-white px-4 py-10 text-center text-[13px] text-[var(--ink-2)] transition hover:border-[var(--accent)]"
          >
            Tap to upload a photo of your smile
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </>
      )}

      {phase === "analysing" && (
        <div className="fade-up mt-10 flex flex-col items-center gap-3">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Your photo" className="max-h-40 rounded-lg border border-[var(--line)] object-cover opacity-60" />
          )}
          <div className="flex items-center gap-1.5 text-[12.5px] text-[var(--ink-2)]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" />
            ))}
            <span className="ml-1">Analysing your smile…</span>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="fade-up mt-8 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label mb-1.5">Now</div>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Your photo" className="w-full rounded-lg border border-[var(--line)]" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/whitening-before.jpg" alt="Before" className="w-full rounded-lg border border-[var(--line)]" />
              )}
            </div>
            <div>
              <div className="label mb-1.5 !text-[var(--accent-ink)]">After 3 sessions</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/whitening-after.jpg" alt="After" className="w-full rounded-lg border border-[var(--accent)]/40" />
            </div>
          </div>
          <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--ink-2)]">
            Indicative preview only — individual results vary. This is not a clinical guarantee;
            your dentist will advise what&rsquo;s achievable for you.
          </p>
          {token ? (
            <a
              href={`/book/${token}?type=whitening`}
              className="rounded-lg bg-[var(--accent)] px-5 py-3 text-center text-[14px] font-semibold text-white transition hover:opacity-90"
            >
              Book a whitening session
            </a>
          ) : (
            <p className="text-center text-[11px] text-[var(--ink-3)]">
              Ask your practice for a booking link to go ahead.
            </p>
          )}
          <p className="text-center text-[10px] text-[var(--ink-3)]">
            Demo note: preview is a mocked illustration — live, this calls an image model.
          </p>
        </div>
      )}
    </main>
  );
}

export default function WhiteningPage() {
  return (
    <Suspense>
      <WhiteningInner />
    </Suspense>
  );
}
