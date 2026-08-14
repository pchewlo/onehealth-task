"use client";

import type { UiPrincipal } from "../lib/ui-types";

const TYPE_LABEL: Record<UiPrincipal["type"], string> = {
  internal_staff: "Internal staff",
  dentist: "Dentist",
  patient: "Patient",
};

const TYPE_BADGE: Record<UiPrincipal["type"], string> = {
  internal_staff: "bg-violet-100 text-violet-700",
  dentist: "bg-teal-100 text-teal-800",
  patient: "bg-amber-100 text-amber-800",
};

export function PrincipalSwitcher({
  principals,
  activeId,
  onSwitch,
  onReset,
  resetting,
}: {
  principals: UiPrincipal[];
  activeId: string;
  onSwitch: (id: string) => void;
  onReset: () => void;
  resetting: boolean;
}) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--line)] bg-white/60">
      <div className="px-4 pb-2 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Signed in as
        </div>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto px-3 pb-3">
        {principals.map((p) => {
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              onClick={() => onSwitch(p.id)}
              className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                  : "border-[var(--line)] bg-white hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold leading-tight">{p.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE[p.type]}`}
                >
                  {TYPE_LABEL[p.type]}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] leading-snug text-[var(--muted)]">
                {p.title}
                {p.manages && p.manages.length > 0 && (
                  <span> · manages {p.manages.join(", ")}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-auto space-y-3 border-t border-[var(--line)] px-4 py-4">
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Principal is bound server-side per session — the model cannot change it.
        </p>
        <button
          onClick={onReset}
          disabled={resetting}
          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset demo"}
        </button>
      </div>
    </aside>
  );
}
