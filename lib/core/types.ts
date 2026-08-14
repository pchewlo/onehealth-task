/**
 * Core types for the governed layer.
 *
 * `lib/core` is deliberately transport-free: it imports nothing from MCP, Next,
 * Express or React. MCP is one way to expose these rules; the rules themselves
 * do not know MCP exists. That separation is the point — swap the transport and
 * the security model is untouched.
 */

export type PrincipalType = "internal_staff" | "dentist" | "patient";

export interface Principal {
  id: string;
  type: PrincipalType;
  name: string;
  title: string;
  /** internal_staff → the dentistIds they manage */
  manages?: string[];
  /** dentist → their own dentistId */
  dentistId?: string;
  /** dentist → their practice's display name */
  practice?: string;
  /** patient → their own patientId */
  patientId?: string;
}

export type ResourceKind = "patient" | "case" | "kb" | "ticket";
export type Op = "read" | "create";

export interface ResourceRef {
  dentistId?: string;
  patientId?: string;
}

export interface Action {
  kind: ResourceKind;
  op: Op;
  resource?: ResourceRef;
}

export type DenyCode = "OUT_OF_SCOPE" | "UNKNOWN_RESOURCE" | "FORBIDDEN_TYPE";

export type Decision =
  | { allow: true }
  | { allow: false; code: DenyCode; reason: string };

export type Team = "ops" | "clinical" | "sales" | "support" | "finance";

export interface Ticket {
  id: string;
  createdBy: string;
  principalType: PrincipalType;
  team: Team;
  /** What the model asked for, recorded even when the server overrode it. */
  teamProposedByModel?: string;
  teamDecidedBy: "rules" | "model_confirmed" | "learned" | "model";
  /** Which tier of the routing precedence actually decided the team. */
  routedVia: "hand_rule" | "learned" | "model" | "default";
  /** The team the router chose at creation — a correction back to this is an
   * undo, not a lesson. */
  routedTeam?: Team;
  /** Set when a learned rule fired, so a correction can retire it. */
  learnedRuleId?: string;
  routingReason: string;
  subject: string;
  body: string;
  refs?: { patientId?: string; caseId?: string };
  createdAt: string;
  /** Bumped on every team/status change — lets clients keep the newest. */
  updatedAt?: string;
  status: TicketStatus;
}

/** Kanban lifecycle. New tickets start in "todo". */
export type TicketStatus = "todo" | "in_progress" | "done" | "blocked";

/** A lightweight note on a ticket, by anyone allowed to see that ticket. */
export interface TicketComment {
  id: string;
  ticketId: string;
  ts: string;
  byPrincipalId: string;
  byName: string;
  text: string;
}

/**
 * M7 — a rule the router learned from a human correction.
 * Learned rules exist ONLY to fill the default-fallthrough gap; they are never
 * consulted when a hand rule matches (see resolveTeam).
 */
export interface LearnedRule {
  id: string;
  /** Content tokens extracted from the corrected ticket's subject. */
  tokens: string[];
  /** Fallback when token extraction yields nothing: exact subject match. */
  exactSubject?: string;
  team: Team;
  /** The ticket whose correction taught this rule. */
  sourceTicketId: string;
  createdAt: string;
}

/**
 * A live update about someone's ticket, delivered only to its creator.
 * Carries nothing the creator cannot already see: their own ticket's subject
 * and teams, plus the display name of the person who moved it (names are
 * switcher-grade metadata, not restricted data).
 */
export interface TicketNotification {
  id: string;
  ts: string;
  /** The only principal allowed to receive it — the ticket's creator. */
  forPrincipalId: string;
  ticketId: string;
  subject: string;
  /** Set on a routing correction. */
  fromTeam?: Team;
  toTeam?: Team;
  /** Set on a board (status) move. */
  fromStatus?: TicketStatus;
  toStatus?: TicketStatus;
  /** Set on a comment (preview, truncated). */
  comment?: string;
  /** Display name of who moved it, resolved server-side. */
  byName: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  principalId: string;
  principalType: PrincipalType;
  tool: string;
  args: unknown;
  decision: "allow" | "deny";
  code?: DenyCode;
  reason?: string;
  latencyMs: number;
}

/* ---------- Raw records as they exist in the store (never returned as-is) ---------- */

export interface PatientRecord {
  id: string;
  dentistId: string;
  name: string;
  status: string;
  dob: string;
  email: string;
}

export interface CaseRecord {
  id: string;
  dentistId: string;
  patientId: string;
  type: string;
  stage: string;
}

export interface KbRecord {
  id: string;
  topic: string;
  title: string;
  body: string;
}

/* ---------- Metrics event stream (M5) ---------- */

export type MetricEventType =
  | "message"
  | "feedback"
  | "ticket_created"
  | "ticket_reassigned"
  | "denial"
  | "conversation_end";

export interface MetricEvent {
  id: string;
  ts: string;
  type: MetricEventType;
  principalId: string;
  conversationId: string;
  /** feedback */
  rating?: "up" | "down";
  /** ticket_created / ticket_reassigned */
  team?: Team;
  fromTeam?: Team;
  toTeam?: Team;
  routedBy?: "rules" | "model_confirmed" | "learned" | "model";
  /** conversation_end */
  resolved?: boolean;
  reason?: UnresolvedReason;
  /** true when the user answered the resolve prompt themselves — a gold
   * label, vs the inferred label from the end-of-conversation heuristic. */
  explicit?: boolean;
  /** message */
  text?: string;
  role?: "user" | "assistant";
  /** simulator provenance */
  synthetic?: boolean;
  fixtureId?: string;
  expected?: string;
  actual?: string;
  pass?: boolean;
}

export type UnresolvedReason =
  | "bad_answer"
  | "mis_route"
  | "confusion"
  | "abandoned";
