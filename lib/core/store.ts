import seed from "../../data/seed.json";
import type {
  AuditEntry,
  CaseRecord,
  KbRecord,
  LearnedRule,
  MetricEvent,
  PatientRecord,
  Principal,
  Ticket,
} from "./types";

/**
 * Storage. Deliberately boring.
 *
 * Reference data (users, patients, cases, kb) is immutable and loaded from
 * data/seed.json. Mutable state (tickets, audit, metric events) lives in a
 * process-global so it survives Next's module reloading in dev and warm lambda
 * reuse in production.
 *
 * This is the one place a real deployment would change: swap the arrays below
 * for a Postgres client and the rest of the layer — policy, redaction, routing,
 * audit — is untouched, because nothing above this file knows how rows are
 * stored. The scope filters here are a convenience, not the security boundary;
 * authorize() is.
 */

interface MutableState {
  tickets: Ticket[];
  audit: AuditEntry[];
  events: MetricEvent[];
  learnedRules: LearnedRule[];
  seq: number;
  backfilled: boolean;
}

const g = globalThis as unknown as { __ohState?: MutableState };

function state(): MutableState {
  if (!g.__ohState) {
    g.__ohState = { tickets: [], audit: [], events: [], learnedRules: [], seq: 0, backfilled: false };
  }
  return g.__ohState;
}

export function nextId(prefix: string): string {
  const s = state();
  s.seq += 1;
  return `${prefix}_${s.seq.toString().padStart(4, "0")}`;
}

/* ---------------- Reference data ---------------- */

export const PRINCIPALS: Principal[] = seed.users as Principal[];
const PATIENTS = seed.patients as PatientRecord[];
const CASES = seed.cases as CaseRecord[];
const KB = seed.knowledge_base as KbRecord[];
export const TEAMS = seed.teams as string[];

export function getPrincipal(id: string): Principal | undefined {
  return PRINCIPALS.find((u) => u.id === id);
}

export function rawPatient(id: string): PatientRecord | undefined {
  return PATIENTS.find((p) => p.id === id);
}

export function rawCase(id: string): CaseRecord | undefined {
  return CASES.find((c) => c.id === id);
}

export function patientsForDentists(dentistIds: string[]): PatientRecord[] {
  return PATIENTS.filter((p) => dentistIds.includes(p.dentistId));
}

export function patientsById(ids: string[]): PatientRecord[] {
  return PATIENTS.filter((p) => ids.includes(p.id));
}

/** For the learner's token filter — person names must never become rules. */
export function allPatientNames(): string[] {
  return PATIENTS.map((p) => p.name);
}

export function casesForDentists(dentistIds: string[], patientId?: string): CaseRecord[] {
  return CASES.filter(
    (c) => dentistIds.includes(c.dentistId) && (!patientId || c.patientId === patientId),
  );
}

export function casesForPatient(patientId: string): CaseRecord[] {
  return CASES.filter((c) => c.patientId === patientId);
}

export function searchKb(query: string): KbRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return KB;
  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  const scored = KB.map((k) => {
    const hay = `${k.topic} ${k.title} ${k.body}`.toLowerCase();
    const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
    return { k, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return hits.length ? hits.map((s) => s.k) : [];
}

/* ---------------- Tickets ---------------- */

export function addTicket(t: Ticket): void {
  state().tickets.unshift(t);
}

export function ticketsBy(principalId: string): Ticket[] {
  return state().tickets.filter((t) => t.createdBy === principalId);
}

export function allTickets(): Ticket[] {
  return state().tickets;
}

export function reassignTicket(
  id: string,
  principalId: string,
  toTeam: Ticket["team"],
): { ok: true; from: Ticket["team"]; ticket: Ticket } | { ok: false } {
  const t = state().tickets.find((x) => x.id === id && x.createdBy === principalId);
  if (!t) return { ok: false };
  const from = t.team;
  t.team = toTeam;
  t.routingReason = `${t.routingReason} · reassigned by human to ${toTeam}`;
  return { ok: true, from, ticket: t };
}

/* ---------------- Learned rules (M7) ---------------- */

export function addLearnedRule(r: LearnedRule): void {
  state().learnedRules.push(r);
}

export function learnedRules(): LearnedRule[] {
  return state().learnedRules;
}

export function retireLearnedRule(id: string): void {
  const s = state();
  s.learnedRules = s.learnedRules.filter((r) => r.id !== id);
}

/* ---------------- Audit ---------------- */

export function appendAudit(e: AuditEntry): void {
  state().audit.unshift(e);
  if (state().audit.length > 500) state().audit.length = 500;
}

export function readAudit(limit = 50): AuditEntry[] {
  return state().audit.slice(0, limit);
}

/**
 * Audit visibility follows the same ownership shape as the data itself:
 * everyone sees the calls made as themselves; internal staff additionally see
 * the calls made by the dentists they manage. Nobody sees a stranger's trail.
 */
export function auditVisibleTo(p: Principal, limit = 60): AuditEntry[] {
  return state()
    .audit.filter((e) => {
      if (e.principalId === p.id) return true;
      if (p.type === "internal_staff") {
        const actor = getPrincipal(e.principalId);
        return Boolean(actor?.dentistId && p.manages?.includes(actor.dentistId));
      }
      return false;
    })
    .slice(0, limit);
}

/* ---------------- Metric events ---------------- */

export function appendEvent(e: MetricEvent): void {
  state().events.push(e);
}

export function readEvents(): MetricEvent[] {
  return state().events;
}

export function markBackfilled(): void {
  state().backfilled = true;
}

export function isBackfilled(): boolean {
  return state().backfilled;
}

/** Restore a clean demo state. Reference data is immutable so nothing to reload. */
export function reset(): void {
  const s = state();
  s.tickets = [];
  s.audit = [];
  s.events = [];
  s.learnedRules = [];
  s.seq = 0;
  s.backfilled = false;
}
