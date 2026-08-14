"use client";

import type { UiPrincipal } from "../lib/ui-types";

/**
 * Sidebar — redesigned per design_handoff_dashboard_redesign.
 * Flat white cards; nesting is padding only (no connector lines); the type
 * badge is a quiet mono word, not a coloured pill; the active card carries
 * the one accent. The tree still IS the scoping story.
 */

const TYPE_BADGE_LABEL: Record<UiPrincipal["type"], string> = {
  internal_staff: "staff",
  dentist: "dentist",
  patient: "patient",
};

function roleLine(p: UiPrincipal): string {
  if (p.type === "internal_staff") {
    const names = p.managesNames ?? p.manages ?? [];
    return `${p.title} · manages ${names.join(", ")}`;
  }
  if (p.type === "patient") return `Patient${p.practice ? ` · ${p.practice}` : ""}`;
  return p.practice ?? p.title;
}

function Card({
  p,
  active,
  pad,
  onSwitch,
}: {
  p: UiPrincipal;
  active: boolean;
  pad: number;
  onSwitch: (id: string) => void;
}) {
  return (
    <div style={{ paddingLeft: pad }}>
      <button
        onClick={() => onSwitch(p.id)}
        className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-150 ease-out ${
          active
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--line)] bg-white hover:border-[var(--line-strong)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--ink)]">{p.name}</span>
          <span
            className={`ml-auto font-mono text-[9px] uppercase tracking-[0.06em] ${
              active ? "text-[var(--accent-ink)]" : "text-[var(--ink-3)]"
            }`}
          >
            {TYPE_BADGE_LABEL[p.type]}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] leading-snug text-[var(--ink-2)]">{roleLine(p)}</div>
      </button>
    </div>
  );
}

export function PrincipalSwitcher({
  principals,
  activeId,
  onSwitch,
  onReset,
  resetting,
  onDevAskResolve,
  devAskNote,
}: {
  principals: UiPrincipal[];
  activeId: string;
  onSwitch: (id: string) => void;
  onReset: () => void;
  resetting: boolean;
  onDevAskResolve: () => void;
  devAskNote: string | null;
}) {
  const staff = principals.filter((p) => p.type === "internal_staff");
  const dentists = principals.filter((p) => p.type === "dentist");
  const patients = principals.filter((p) => p.type === "patient");

  const managedIds = new Set(staff.flatMap((s) => s.manages ?? []));
  const patientsOf = (dentistId?: string) => patients.filter((p) => p.dentistId === dentistId);
  const unmanagedDentists = dentists.filter((d) => !d.dentistId || !managedIds.has(d.dentistId));
  const dentistIds = new Set(dentists.map((d) => d.dentistId));
  const orphanPatients = patients.filter((p) => !dentistIds.has(p.dentistId));

  const isActive = (id: string) => id === activeId;

  const dentistWithPatients = (d: UiPrincipal, basePad: number) => (
    <div key={d.id} className="flex flex-col gap-1.5">
      <Card p={d} active={isActive(d.id)} pad={basePad} onSwitch={onSwitch} />
      {patientsOf(d.dentistId).map((pt) => (
        <Card key={pt.id} p={pt} active={isActive(pt.id)} pad={basePad + 14} onSwitch={onSwitch} />
      ))}
    </div>
  );

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-[var(--line)] bg-white">
      <div className="flex flex-col gap-3.5 px-4 pb-3.5 pt-[18px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/onehealth-logo.svg" alt="01Health" className="h-4 self-start" />
        <div className="label">Signed in as</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3">
        {staff.map((s) => (
          <div key={s.id} className="flex flex-col gap-1.5">
            <Card p={s} active={isActive(s.id)} pad={0} onSwitch={onSwitch} />
            {dentists
              .filter((d) => d.dentistId && (s.manages ?? []).includes(d.dentistId))
              .map((d) => dentistWithPatients(d, 14))}
          </div>
        ))}

        {unmanagedDentists.length > 0 && (
          <>
            <div className="label px-1 pt-2 !text-[var(--ink-3)]">No account manager</div>
            {unmanagedDentists.map((d) => dentistWithPatients(d, 0))}
          </>
        )}

        {orphanPatients.map((pt) => (
          <Card key={pt.id} p={pt} active={isActive(pt.id)} pad={0} onSwitch={onSwitch} />
        ))}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-[var(--line)] px-4 py-3.5">
        <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
          Principal is bound server-side — the model cannot change it.
        </p>
        <button
          onClick={onReset}
          disabled={resetting}
          className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--ink-2)] transition-all duration-150 ease-out hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset demo"}
        </button>
        <button
          onClick={onDevAskResolve}
          title="Dev: trigger the idle resolve-prompt immediately instead of waiting 30s"
          className="rounded-md border border-dashed border-[var(--line)] bg-white px-3 py-1.5 text-[11px] text-[var(--ink-3)] transition-all duration-150 ease-out hover:border-[var(--line-strong)] hover:text-[var(--ink-2)]"
        >
          Trigger &ldquo;did this resolve?&rdquo;
        </button>
        {devAskNote && (
          <p className="fade-up text-[10.5px] leading-snug text-[var(--warn)]">{devAskNote}</p>
        )}
      </div>
    </aside>
  );
}
