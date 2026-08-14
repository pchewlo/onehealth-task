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
  /** Bumped by reset(). A higher epoch wins wholesale — a wipe cannot be
   * resurrected by another instance merging its old memory back in. */
  epoch: number;
  tickets: Ticket[];
  notifications: TicketNotification[];
  comments: TicketComment[];
  /** Tombstones so a retired learned rule stays retired across merges. */
  retiredRuleIds: string[];
  audit: AuditEntry[];
  events: MetricEvent[];
  learnedRules: LearnedRule[];
  seq: number;
  backfilled: boolean;
}

const g = globalThis as unknown as { __ohState?: MutableState };

function state(): MutableState {
  if (!g.__ohState) {
    g.__ohState = { epoch: 0, tickets: [], notifications: [], comments: [], audit: [], events: [], learnedRules: [], retiredRuleIds: [], seq: 0, backfilled: false };
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
let inflight: Promise<void> | null = null;

function normalize(s: MutableState): MutableState {
  s.epoch ??= 0;
  s.notifications ??= [];
  s.comments ??= [];
  s.retiredRuleIds ??= [];
  for (const t of s.tickets ?? []) {
    if ((t.status as string) === "open" || !t.status) t.status = "todo";
    t.updatedAt ??= t.createdAt;
  }
  return s;
}

function unionById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>();
  for (const x of a) byId.set(x.id, x);
  for (const x of b) if (!byId.has(x.id)) byId.set(x.id, x);
  return [...byId.values()];
}

/**
 * Convergent merge of two divergent snapshots. Semantics per collection:
 *  - tickets: by id, newer updatedAt wins (moves are never rolled back)
 *  - audit / events / comments / notifications / learnedRules: append-only →
 *    union by id
 *  - retiredRuleIds: union — a retirement survives any merge, and
 *    learnedRules are filtered through it
 *  - epoch: a strictly higher epoch wins WHOLESALE (that side is a reset)
 * Merging is idempotent and commutative, which is what makes repeated
 * cross-instance syncs converge instead of ping-pong.
 */
function mergeStates(local: MutableState, remote: MutableState): MutableState {
  if (remote.epoch > local.epoch) return remote;
  if (local.epoch > remote.epoch) return local;

  const tickets = new Map<string, Ticket>();
  for (const t of remote.tickets) tickets.set(t.id, t);
  for (const t of local.tickets) {
    const other = tickets.get(t.id);
    if (!other || (t.updatedAt ?? "") >= (other.updatedAt ?? "")) tickets.set(t.id, t);
  }

  const retiredRuleIds = [...new Set([...local.retiredRuleIds, ...remote.retiredRuleIds])];

  const merged: MutableState = {
    epoch: local.epoch,
    tickets: [...tickets.values()],
    notifications: unionById(local.notifications, remote.notifications)
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 100),
    comments: unionById(local.comments, remote.comments).sort((a, b) => a.ts.localeCompare(b.ts)),
    audit: unionById(local.audit, remote.audit)
      .sort((a, b) => (a.ts === b.ts ? b.id.localeCompare(a.id) : b.ts.localeCompare(a.ts)))
      .slice(0, 500),
    events: unionById(local.events, remote.events).sort((a, b) => a.ts.localeCompare(b.ts)),
    learnedRules: unionById(local.learnedRules, remote.learnedRules).filter(
      (r) => !retiredRuleIds.includes(r.id),
    ),
    retiredRuleIds,
    seq: Math.max(local.seq, remote.seq),
    backfilled: local.backfilled || remote.backfilled,
  };
  return merged;
}

async function syncWithRemote(): Promise<void> {
  const loaded = await loadState();
  if (loaded) {
    const remote = normalize(loaded);
    g.__ohState = g.__ohState ? mergeStates(state(), remote) : remote;
  }
  lastSyncAt = Date.now();
}

/**
 * Freshness. Reads may ride a 1s throttle (merge makes staleness harmless —
 * it can only briefly show less, never roll anything back). WRITE PATHS MUST
 * PASS {force:true}: mutating on a stale base and then persisting is how a
 * lagging instance erases another's work.
 */
export async function ensureHydrated(opts?: { force?: boolean }): Promise<void> {
  if (!opts?.force && Date.now() - lastSyncAt < 1000) return;
  inflight ??= syncWithRemote().finally(() => {
    inflight = null;
  });
  await inflight;
}

export async function persistNow(): Promise<void> {
  // Read-merge-write: never blind-overwrite the shared snapshot. If the
  // remote carries a higher epoch (someone reset while we worked), our local
  // state is obsolete — adopt theirs and save nothing.
  const loaded = await loadState();
  if (loaded) {
    const remote = normalize(loaded);
    if (remote.epoch > state().epoch) {
      g.__ohState = remote;
      return;
    }
    g.__ohState = mergeStates(state(), remote);
  }
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

/**
 * Who is accountable for a ticket raised by this principal: the practice's
 * account manager when one exists, otherwise the practice's dentist. Staff
 * own their own tickets.
 */
export function ownerIdFor(creator: Principal): string {
  const dentistId =
    creator.dentistId ?? (creator.patientId ? rawPatient(creator.patientId)?.dentistId : undefined);
  if (!dentistId) return creator.id;
  const manager = PRINCIPALS.find(
    (s) => s.type === "internal_staff" && s.manages?.includes(dentistId),
  );
  if (manager) return manager.id;
  return PRINCIPALS.find((d) => d.type === "dentist" && d.dentistId === dentistId)?.id ?? creator.id;
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

/** Ticket visibility follows the same ownership shape as the audit log —
 * except internal tickets (reports on a session, e.g. denied-access
 * escalations), which are hidden from the very principal they report on.
 * Internal staff still see them. */
export function ticketsVisibleTo(p: Principal): Ticket[] {
  return state().tickets.filter((t) => {
    if (!inBookOf(p, t.createdBy)) return false;
    if (t.internal && p.type !== "internal_staff") return false;
    return true;
  });
}

/**
 * Workflow rights (move status, reassign team) follow OWNERSHIP, which is
 * narrower than visibility: the account manager owns her managed practices'
 * boards; a dentist with no account manager owns their own. A managed
 * dentist sees and comments, but the board is their AM's to run. Patients
 * never manage workflow.
 */
export function canManageTicket(p: Principal, t: Ticket): boolean {
  if (t.internal && p.type !== "internal_staff") return false;
  if (p.type === "internal_staff") return inBookOf(p, t.createdBy);
  if (p.type === "dentist") {
    if (t.createdBy !== p.id) return false;
    const hasManager = PRINCIPALS.some(
      (s) => s.type === "internal_staff" && s.manages?.includes(p.dentistId ?? ""),
    );
    return !hasManager;
  }
  return false;
}

export function allTickets(): Ticket[] {
  return state().tickets;
}

export function reassignTicket(
  id: string,
  principalId: string,
  toTeam: Ticket["team"],
): { ok: true; from: Ticket["team"]; ticket: Ticket } | { ok: false } {
  // Reassignment requires workflow OWNERSHIP, not mere visibility — the AM
  // correcting a managed practice's routing is exactly the signal the router
  // learns from; a managed dentist flags via comments instead.
  const p = getPrincipal(principalId);
  const t = p ? state().tickets.find((x) => x.id === id && canManageTicket(p, x)) : undefined;
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

/** Move a ticket across the board. Same rule as reassignment: workflow
 * ownership, not mere visibility. */
export function setTicketStatus(
  id: string,
  principalId: string,
  toStatus: TicketStatus,
): { ok: true; from: TicketStatus; ticket: Ticket } | { ok: false } {
  const p = getPrincipal(principalId);
  const t = p ? state().tickets.find((x) => x.id === id && canManageTicket(p, x)) : undefined;
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
  if (!s.retiredRuleIds.includes(id)) s.retiredRuleIds.push(id);
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
  s.epoch += 1; // outranks every other instance's memory of the old world
  s.tickets = [];
  s.notifications = [];
  s.comments = [];
  s.audit = [];
  s.events = [];
  s.learnedRules = [];
  s.retiredRuleIds = [];
  s.seq = 0;
  s.backfilled = false;
}
