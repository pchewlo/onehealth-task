import { record } from "./audit";
import { authorize, visibleDentistIds } from "./policy";
import { project, projectMany } from "./redact";
import { extractTokens, isLearnable, resolveTeam } from "./router";
import {
  addLearnedRule,
  addTicket,
  appendEvent,
  casesForDentists,
  casesForPatient,
  nextId,
  patientsById,
  patientsForDentists,
  rawCase,
  rawPatient,
  reassignTicket,
  retireLearnedRule,
  searchKb,
  ticketsBy,
} from "./store";
import type { Decision, LearnedRule, Principal, Team, Ticket } from "./types";

/**
 * The seven governed operations.
 *
 * Every one of them follows the same three steps, in this order:
 *   1. authorize()  — one choke point, fails closed
 *   2. project()    — pick allowlisted fields, never delete unwanted ones
 *   3. record()     — audit the call, allow or deny
 *
 * The MCP server and the agent both call these. Neither reimplements any part
 * of the security model; they are transport and orchestration only.
 */

export type OpResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; reason: string } };

function denied(d: Decision & { allow: false }): OpResult {
  return { ok: false, error: { code: d.code, reason: d.reason } };
}

const ALLOW: Decision = { allow: true };

/* ---------------- 1. list_my_patients ---------------- */

export function listMyPatients(p: Principal): OpResult {
  const t0 = Date.now();

  if (p.type === "patient") {
    // A patient has no patient list. The operation itself is unavailable to
    // this principal type, so it is refused by type rather than by scope —
    // and refused rather than quietly returning a one-element list, which
    // would teach the model the tool "works" for patients.
    const d: Decision = {
      allow: false,
      code: "FORBIDDEN_TYPE",
      reason: "A patient principal has no patient list; use get_patient on your own record.",
    };
    record(p, "list_my_patients", {}, d, t0);
    return denied(d);
  }

  const dentistIds = visibleDentistIds(p);
  // Re-run the ownership check per row. The filter below is a query
  // convenience; this loop is the actual authorisation.
  const rows = patientsForDentists(dentistIds).filter(
    (r) => authorize(p, { kind: "patient", op: "read", resource: { dentistId: r.dentistId } }).allow,
  );

  record(p, "list_my_patients", {}, ALLOW, t0);
  return { ok: true, data: { patients: projectMany("patient", p.type, rows), count: rows.length } };
}

/* ---------------- 2. get_patient ---------------- */

export function getPatient(p: Principal, patientId: string): OpResult {
  const t0 = Date.now();
  const raw = rawPatient(patientId);

  // Scope is evaluated against what the caller *could* own, using the record
  // when it exists and the request itself when it does not. An unknown id and
  // an out-of-scope id therefore produce the same OUT_OF_SCOPE answer, so the
  // error cannot be used to probe which patient ids exist.
  const ref = raw
    ? { dentistId: raw.dentistId, patientId: raw.id }
    : { dentistId: "__unknown__", patientId };

  const d = authorize(p, { kind: "patient", op: "read", resource: ref });
  if (!d.allow) {
    record(p, "get_patient", { patientId }, d, t0);
    return denied(d);
  }

  if (!raw) {
    const nf: Decision = {
      allow: false,
      code: "UNKNOWN_RESOURCE",
      reason: `No patient ${patientId} in your scope.`,
    };
    record(p, "get_patient", { patientId }, nf, t0);
    return denied(nf);
  }

  record(p, "get_patient", { patientId }, ALLOW, t0);
  return { ok: true, data: { patient: project("patient", p.type, raw) } };
}

/* ---------------- 3. list_cases ---------------- */

export function listCases(p: Principal, patientId?: string): OpResult {
  const t0 = Date.now();

  let rows;
  if (p.type === "patient") {
    if (patientId && patientId !== p.patientId) {
      const d: Decision = {
        allow: false,
        code: "OUT_OF_SCOPE",
        reason: "A patient may only read their own cases.",
      };
      record(p, "list_cases", { patientId }, d, t0);
      return denied(d);
    }
    rows = casesForPatient(p.patientId ?? "");
  } else {
    rows = casesForDentists(visibleDentistIds(p), patientId);
  }

  rows = rows.filter(
    (c) =>
      authorize(p, {
        kind: "case",
        op: "read",
        resource: { dentistId: c.dentistId, patientId: c.patientId },
      }).allow,
  );

  record(p, "list_cases", { patientId }, ALLOW, t0);
  return { ok: true, data: { cases: projectMany("case", p.type, rows), count: rows.length } };
}

/* ---------------- 4. get_case ---------------- */

export function getCase(p: Principal, caseId: string): OpResult {
  const t0 = Date.now();
  const raw = rawCase(caseId);
  const ref = raw
    ? { dentistId: raw.dentistId, patientId: raw.patientId }
    : { dentistId: "__unknown__", patientId: "__unknown__" };

  const d = authorize(p, { kind: "case", op: "read", resource: ref });
  if (!d.allow) {
    record(p, "get_case", { caseId }, d, t0);
    return denied(d);
  }
  if (!raw) {
    const nf: Decision = {
      allow: false,
      code: "UNKNOWN_RESOURCE",
      reason: `No case ${caseId} in your scope.`,
    };
    record(p, "get_case", { caseId }, nf, t0);
    return denied(nf);
  }

  record(p, "get_case", { caseId }, ALLOW, t0);
  return { ok: true, data: { case: project("case", p.type, raw) } };
}

/* ---------------- 5. search_kb ---------------- */

export function searchKnowledgeBase(p: Principal, query: string): OpResult {
  const t0 = Date.now();
  const d = authorize(p, { kind: "kb", op: "read" });
  if (!d.allow) {
    record(p, "search_kb", { query }, d, t0);
    return denied(d);
  }
  const rows = searchKb(query);
  record(p, "search_kb", { query }, ALLOW, t0);
  return { ok: true, data: { articles: projectMany("kb", p.type, rows), count: rows.length } };
}

/* ---------------- 6. create_ticket ---------------- */

export interface CreateTicketInput {
  subject: string;
  body: string;
  team_suggestion?: string;
  patientId?: string;
  caseId?: string;
}

export function createTicket(p: Principal, input: CreateTicketInput): OpResult {
  const t0 = Date.now();
  const args = {
    subject: input.subject,
    body: input.body,
    team_suggestion: input.team_suggestion,
    patientId: input.patientId,
    caseId: input.caseId,
  };

  // Referenced records are scope-checked before anything is written. A dentist
  // cannot open a ticket about another practice's patient, even though the
  // ticket itself would be their own.
  const refs: { patientId?: string; caseId?: string } = {};

  if (input.patientId) {
    const raw = rawPatient(input.patientId);
    const ref = raw
      ? { dentistId: raw.dentistId, patientId: raw.id }
      : { dentistId: "__unknown__", patientId: input.patientId };
    const d = authorize(p, { kind: "ticket", op: "create", resource: ref });
    const scoped = d.allow
      ? authorize(p, { kind: "patient", op: "read", resource: ref })
      : d;
    if (!scoped.allow) {
      record(p, "create_ticket", args, scoped, t0);
      return denied(scoped);
    }
    refs.patientId = input.patientId;
  }

  if (input.caseId) {
    const raw = rawCase(input.caseId);
    const ref = raw
      ? { dentistId: raw.dentistId, patientId: raw.patientId }
      : { dentistId: "__unknown__", patientId: "__unknown__" };
    const d = authorize(p, { kind: "case", op: "read", resource: ref });
    if (!d.allow) {
      record(p, "create_ticket", args, d, t0);
      return denied(d);
    }
    refs.caseId = input.caseId;
  }

  const base = authorize(p, { kind: "ticket", op: "create", resource: {} });
  if (!base.allow) {
    record(p, "create_ticket", args, base, t0);
    return denied(base);
  }

  const routing = resolveTeam(input.subject, input.body, input.team_suggestion);
  const ticket: Ticket = {
    id: nextId("T"),
    createdBy: p.id,
    principalType: p.type,
    team: routing.team,
    teamProposedByModel: routing.teamProposedByModel,
    teamDecidedBy: routing.teamDecidedBy,
    routedVia: routing.routedVia,
    learnedRuleId: routing.learnedRuleId,
    routingReason: routing.routingReason,
    subject: input.subject,
    body: input.body,
    refs: Object.keys(refs).length ? refs : undefined,
    createdAt: new Date().toISOString(),
    status: "open",
  };
  addTicket(ticket);

  appendEvent({
    id: nextId("ev"),
    ts: ticket.createdAt,
    type: "ticket_created",
    principalId: p.id,
    conversationId: "",
    team: ticket.team,
    routedBy: ticket.teamDecidedBy,
  });

  record(p, "create_ticket", args, ALLOW, t0);
  return { ok: true, data: { ticket: project("ticket", p.type, ticket as unknown as Record<string, unknown>) } };
}

/* ---------------- 7. list_my_tickets ---------------- */

export function listMyTickets(p: Principal): OpResult {
  const t0 = Date.now();
  const d = authorize(p, { kind: "ticket", op: "read", resource: {} });
  if (!d.allow) {
    record(p, "list_my_tickets", {}, d, t0);
    return denied(d);
  }
  const rows = ticketsBy(p.id) as unknown as Record<string, unknown>[];
  record(p, "list_my_tickets", {}, ALLOW, t0);
  return { ok: true, data: { tickets: projectMany("ticket", p.type, rows), count: rows.length } };
}

/* ---------------- Correction → learning (M7, not a model-facing tool) ---------------- */

export interface CorrectionResult {
  ok: boolean;
  from?: Team;
  /** Present when the correction taught the router something. */
  learned?: LearnedRule;
  /** Present when the correction retired a mis-firing learned rule. */
  retiredRuleId?: string;
  /** Present when policy forbade learning (hand-rule territory). */
  notLearnedBecause?: string;
}

/**
 * A human reassigning a ticket's team is the correction signal. What it is
 * allowed to teach is decided HERE, by policy, not by the learner:
 *
 *  - ticket was routed via default/model  → learn a rule for the gap
 *  - ticket was routed via a learned rule → the rule was wrong; retire it
 *  - ticket was routed via a HAND rule    → record only. Hand rules are
 *    changed by humans editing the table, never by the learner. The stored
 *    disagreement is the evidence for that edit.
 */
export function correctTicket(
  principalId: string,
  ticketId: string,
  toTeam: Team,
  patientNames: string[],
): CorrectionResult {
  const res = reassignTicket(ticketId, principalId, toTeam);
  if (!res.ok) return { ok: false };
  const t = res.ticket;

  appendEvent({
    id: nextId("ev"),
    ts: new Date().toISOString(),
    type: "ticket_reassigned",
    principalId,
    conversationId: "",
    fromTeam: res.from,
    toTeam,
  });

  if (t.routedVia === "learned" && t.learnedRuleId) {
    retireLearnedRule(t.learnedRuleId);
    return { ok: true, from: res.from, retiredRuleId: t.learnedRuleId };
  }

  if (!isLearnable(t.routedVia)) {
    return {
      ok: true,
      from: res.from,
      notLearnedBecause:
        "routed by a hand rule — corrections there are recorded as evidence for editing the hand table, never auto-applied",
    };
  }

  const tokens = extractTokens(t.subject, patientNames);
  const rule: LearnedRule = {
    id: nextId("LR"),
    tokens,
    // Fallback when extraction yields nothing: exact-match the subject line.
    // Crude, but the loop still demos — ship beats elegant.
    exactSubject: tokens.length ? undefined : t.subject.trim().toLowerCase(),
    team: toTeam,
    sourceTicketId: t.id,
    createdAt: new Date().toISOString(),
  };
  addLearnedRule(rule);
  return { ok: true, from: res.from, learned: rule };
}

/** Convenience for the UI, not exposed as a tool. */
export { patientsById };
