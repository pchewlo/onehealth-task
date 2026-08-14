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

function Card({
  p,
  active,
  onSwitch,
}: {
  p: UiPrincipal;
  active: boolean;
  onSwitch: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSwitch(p.id)}
      className={`w-full rounded-xl border px-3.5 py-3 text-left transition-all ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
          : "border-[var(--line)] bg-white hover:border-stone-300 hover:bg-stone-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-semibold leading-tight">{p.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE[p.type]}`}>
          {TYPE_LABEL[p.type]}
        </span>
      </div>
      <div className="mt-1 text-[11.5px] leading-snug text-[var(--muted)]">
        {p.title}
        {p.practice && <span> · {p.practice}</span>}
      </div>
      {(p.managesNames ?? p.manages) && (p.managesNames ?? p.manages)!.length > 0 && (
        <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
          <span className="text-stone-400">manages</span>
          {(p.managesNames ?? p.manages)!.map((name) => (
            <div key={name} className="pl-2">
              · {name}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/** Indented child group with a connector line, so the ownership tree is
 * visible at a glance: staff → their dentists → those dentists' patients. */
function Children({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-3 mt-2 space-y-2 border-l-2 border-[var(--line)] pl-2.5">{children}</div>
  );
}

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
  const staff = principals.filter((p) => p.type === "internal_staff");
  const dentists = principals.filter((p) => p.type === "dentist");
  const patients = principals.filter((p) => p.type === "patient");

  const managedIds = new Set(staff.flatMap((s) => s.manages ?? []));
  const patientsOf = (dentistId?: string) =>
    patients.filter((p) => p.dentistId === dentistId);
  const unmanagedDentists = dentists.filter(
    (d) => !d.dentistId || !managedIds.has(d.dentistId),
  );
  // Patients whose dentist isn't in the switcher at all still need a home.
  const dentistIds = new Set(dentists.map((d) => d.dentistId));
  const orphanPatients = patients.filter((p) => !dentistIds.has(p.dentistId));

  const dentistWithPatients = (d: UiPrincipal) => (
    <div key={d.id}>
      <Card p={d} active={d.id === activeId} onSwitch={onSwitch} />
      {patientsOf(d.dentistId).length > 0 && (
        <Children>
          {patientsOf(d.dentistId).map((pt) => (
            <Card key={pt.id} p={pt} active={pt.id === activeId} onSwitch={onSwitch} />
          ))}
        </Children>
      )}
    </div>
  );

  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-[var(--line)] bg-white/60">
      <div className="px-4 pb-2 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Signed in as
        </div>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto px-3 pb-3">
        {/* Staff, with their managed dentists (and those dentists' patients) nested */}
        {staff.map((s) => (
          <div key={s.id}>
            <Card p={s} active={s.id === activeId} onSwitch={onSwitch} />
            <Children>
              {dentists
                .filter((d) => d.dentistId && (s.manages ?? []).includes(d.dentistId))
                .map(dentistWithPatients)}
            </Children>
          </div>
        ))}

        {/* Dentists outside any account manager's book — deliberately separate:
            the hierarchy IS the scoping story. */}
        {unmanagedDentists.length > 0 && (
          <>
            <div className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
              No account manager
            </div>
            {unmanagedDentists.map(dentistWithPatients)}
          </>
        )}

        {orphanPatients.map((pt) => (
          <Card key={pt.id} p={pt} active={pt.id === activeId} onSwitch={onSwitch} />
        ))}
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
