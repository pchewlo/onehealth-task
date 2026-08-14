import seed from "../../data/seed.json";
import { loadState, saveState } from "./persist";
import type {
  AuditEntry,
  CaseRecord,
  KbRecord,
  LearnedRule,
  MetricEvent,
  PatientRecord,
  Principal,
  Ticket,
  TicketComment,
  TicketNotification,
  TicketStatus,
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

export interface MutableState {
  tickets: Ticket[];
  notifications: TicketNotification[];
  comments: TicketComment[];
  audit: AuditEntry[];
  events: MetricEvent[];
  learnedRules: LearnedRule[];
  seq: number;
  backfilled: boolean;
}

const g = globalThis as unknown as { __ohState?: MutableState };

function state(): MutableState {
  if (!g.__ohState) {
    g.__ohState = { tickets: [], notifications: [], comments: [], audit: [], events: [], learnedRules: [], seq: 0, backfilled: false };
  }
  return g.__ohState;
}

/* ---------------- Durability (optional Supabase, see persist.ts) ----------------
 *
 * The in-memory state above stays the single source of truth for a running
 * process — everything in the layer remains synchronous. Durability is bolted
 * on at the edges: API routes await ensureHydrated() before touching state and
 * persistNow() after mutating it. With no Supabase credentials both are no-ops
 * and the store behaves exactly as before (prove.ts stays keyless).
 */

let lastSyncAt = 0;
let hydration: Promise<void> | null = null;

/**
 * Freshness-aware hydration. Serverless runs many warm instances, each with
 * its own memory; a cold-only hydrate leaves warm instances serving stale
 * state forever, and the UI visibly bounces between instances' private
 * worlds. So: every request re-reads the shared snapshot (one small row,
 * throttled to once a second) and adopts it whenever it is strictly NEWER
 * than local memory — the mutation counter `seq` is the clock. An instance
 * that just wrote has the higher seq and keeps its memory; everyone else
 * converges to it on their next request.
 */
export async function ensureHydrated(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncAt < 1000) return;
  hydration ??= loadState()
    .then((loaded) => {
      if (loaded) {
        // Normalise snapshots written by older code versions.
        for (const t of loaded.tickets ?? []) {
          if ((t.status as string) === "open" || !t.status) t.status = "todo";
          t.updatedAt ??= t.createdAt;
        }
        loaded.notifications ??= [];
        loaded.comments ??= [];
        if (!g.__ohState || loaded.seq > g.__ohState.seq) g.__ohState = loaded;
      }
      lastSyncAt = Date.now();
    })
    .finally(() => {
      hydration = null;
    });
  await hydration;
}

export async function persistNow(): Promise<void> {
  await saveState(state());
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

/**
 * Ownership shape shared by tickets and audit: you always see your own;
 * internal staff additionally see actors attached to the dentists they manage
 * (the dentists themselves, and those dentists' patients). Fail closed —
 * unknown actors are nobody's.
 */
function inBookOf(p: Principal, actorId: string): boolean {
  if (actorId === p.id) return true;
  if (p.type !== "internal_staff") return false;
  const actor = getPrincipal(actorId);
  if (!actor) return false;
  const dentistId =
    actor.dentistId ?? (actor.patientId ? rawPatient(actor.patientId)?.dentistId : undefined);
  return Boolean(dentistId && p.manages?.includes(dentistId));
}

/** Ticket visibility follows the same ownership shape as the audit log. */
export function ticketsVisibleTo(p: Principal): Ticket[] {
  return state().tickets.filter((t) => inBookOf(p, t.createdBy));
}

export function allTickets(): Ticket[] {
  return state().tickets;
}

export function reassignTicket(
  id: string,
  principalId: string,
  toTeam: Ticket["team"],
): { ok: true; from: Ticket["team"]; ticket: Ticket } | { ok: false } {
  // Reassignment scope = visibility scope: an account manager correcting a
  // managed dentist's ticket is exactly the correction signal the router
  // learns from.
  const p = getPrincipal(principalId);
  const t = p ? state().tickets.find((x) => x.id === id && inBookOf(p, x.createdBy)) : undefined;
  if (!t) return { ok: false };
  const from = t.team;
  t.team = toTeam;
  t.updatedAt = new Date().toISOString();
  t.routingReason = `${t.routingReason} · reassigned by human to ${toTeam}`;
  return { ok: true, from, ticket: t };
}

/* ---------------- Ticket notifications ---------------- */

/**
 * Delivery is scoped harder than visibility: a notification is addressed to
 * exactly one principal (the ticket's creator) and notificationsFor() returns
 * only that principal's. Staff already see the board move; the creator is the
 * one who was elsewhere when it happened.
 */
export function addNotification(n: TicketNotification): void {
  const s = state();
  s.notifications.unshift(n);
  if (s.notifications.length > 100) s.notifications.length = 100;
}

export function notificationsFor(p: Principal): TicketNotification[] {
  return state().notifications.filter((n) => n.forPrincipalId === p.id);
}

/** Move a ticket across the board. Same scope as reassignment: your own
 * tickets, or — for staff — your managed book's. */
export function setTicketStatus(
  id: string,
  principalId: string,
  toStatus: TicketStatus,
): { ok: true; from: TicketStatus; ticket: Ticket } | { ok: false } {
  const p = getPrincipal(principalId);
  const t = p ? state().tickets.find((x) => x.id === id && inBookOf(p, x.createdBy)) : undefined;
  if (!t) return { ok: false };
  const from = t.status;
  t.status = toStatus;
  t.updatedAt = new Date().toISOString();
  return { ok: true, from, ticket: t };
}

/** The ticket, if it is in this principal's visibility scope. */
export function ticketInScopeOf(principalId: string, ticketId: string): Ticket | undefined {
  const p = getPrincipal(principalId);
  return p ? state().tickets.find((x) => x.id === ticketId && inBookOf(p, x.createdBy)) : undefined;
}

export function addComment(c: TicketComment): void {
  state().comments.push(c);
}

/** Comments only for tickets the principal can see — scope rides the ticket. */
export function commentsVisibleTo(p: Principal): TicketComment[] {
  const visible = new Set(ticketsVisibleTo(p).map((t) => t.id));
  return state().comments.filter((c) => visible.has(c.ticketId));
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
  s.notifications = [];
  s.comments = [];
  s.audit = [];
  s.events = [];
  s.learnedRules = [];
  s.seq = 0;
  s.backfilled = false;
}
