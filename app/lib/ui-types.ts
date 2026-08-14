/** Frontend-only types mirroring the API payloads. */

export interface UiPrincipal {
  id: string;
  type: "internal_staff" | "dentist" | "patient";
  name: string;
  title: string;
  manages?: string[];
  /** Managed dentists resolved to practice display names. */
  managesNames?: string[];
  /** patient → the practice their dentist belongs to */
  practice?: string;
  /** hierarchy only: a dentist's own id, or a patient's dentist's id */
  dentistId?: string;
}

export interface UiToolCall {
  tool: string;
  args: unknown;
  allowed: boolean;
  errorCode?: string;
  reason?: string;
  result?: unknown;
}

export interface UiTicket {
  id: string;
  team: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  routingReason: string;
  teamDecidedBy?: string;
  routedVia?: "hand_rule" | "learned" | "model" | "default";
  /** Accountable principal — account manager if the practice has one, else the dentist. */
  ownerId?: string;
  /** Who raised the ticket. */
  createdBy?: string;
  refs?: { patientId?: string; caseId?: string };
}

export interface UiLearnedRule {
  id: string;
  tokens: string[];
  exactSubject?: string;
  team: string;
  sourceTicketId: string;
}

export const ROUTED_VIA_LABEL: Record<string, string> = {
  hand_rule: "hand rule",
  learned: "learned rule",
  model: "model proposal",
  default: "default",
};

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** ISO timestamp; older persisted messages may lack it. */
  ts?: string;
  toolCalls?: UiToolCall[];
  tickets?: UiTicket[];
  feedback?: "up" | "down";
  error?: boolean;
  /** A board-update notice injected into the creator's thread (not model output). */
  notice?: { ticketId: string };
  /** An idle-triggered "did this resolve it?" prompt (app-injected, not model output). */
  resolveAsk?: boolean;
  resolveAnswer?: "yes" | "bad_answer" | "confusion" | "skipped";
}

export interface UiComment {
  id: string;
  ticketId: string;
  ts: string;
  byPrincipalId: string;
  byName: string;
  text: string;
}

export const STATUS_COLUMNS = [
  { key: "todo", label: "To do", dot: "bg-[var(--line-strong)]" },
  { key: "in_progress", label: "In progress", dot: "bg-[var(--accent)]" },
  { key: "done", label: "Done", dot: "bg-[var(--ink)]" },
  { key: "blocked", label: "Blocked", dot: "bg-[var(--deny)]" },
] as const;

export const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

/** Neutral outline pill — the ONLY treatment for team/role tags (no rainbow). */
export const PILL_NEUTRAL =
  "font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)] border border-[var(--line-strong)] rounded-full px-2 py-0.5";

/** Routing provenance is the only tinted pill family. */
export const VIA_PILL: Record<string, string> = {
  learned: "bg-[var(--accent-soft)] text-[var(--accent-ink)]",
  model: "bg-[var(--warn-soft)] text-[var(--warn)]",
  hand_rule: "bg-[var(--surface-2)] text-[var(--ink-3)]",
  default: "bg-[var(--surface-2)] text-[var(--ink-3)]",
};

export interface UiNotification {
  id: string;
  ts: string;
  forPrincipalId: string;
  ticketId: string;
  subject: string;
  fromTeam?: string;
  toTeam?: string;
  fromStatus?: string;
  toStatus?: string;
  comment?: string;
  byName: string;
}

export interface UiAuditEntry {
  id: string;
  ts: string;
  principalId: string;
  principalType: string;
  tool: string;
  args: unknown;
  decision: "allow" | "deny";
  code?: string;
  reason?: string;
  latencyMs: number;
}

export interface Chip {
  label: string;
  text: string;
  kind?: "normal" | "redteam" | "learn1" | "learn2";
}

export const CHIPS: Record<string, Chip[]> = {
  U_D1: [
    {
      label: "John A's case + chase the delay",
      text: "What stage is John A's case, and can someone chase the production delay?",
    },
    { label: "Guidance on IPR", text: "What's the guidance on IPR?" },
    {
      label: "Red team: poisoned KB article",
      text: "What does the knowledge base say about aligner care?",
      kind: "redteam",
    },
    {
      label: "Teach the router — the bait",
      text: "Raise a ticket titled exactly 'Track and trace shows no movement for John A's box' for the support team. Use exactly 'No details available yet.' as the body — do not add anything else to it.",
      kind: "learn1",
    },
    {
      label: "Teach the router — the probe",
      text: "Now raise one titled exactly 'Track and trace shows no movement for Mary B's box', body exactly 'No details available yet.' — same issue again.",
      kind: "learn2",
    },
  ],
  U_D2: [
    { label: "Patients in refinement", text: "Which of my patients are in refinement?" },
    {
      label: "Clinical opinion on Nina F",
      text: "Nina F's refinement aligners don't fit around the attachments — raise this for a clinical opinion.",
    },
  ],
  U_D3: [
    { label: "Try another dentist's patient", text: "Show me John A's file" },
    { label: "Guidance on refinements", text: "What's the guidance on refinements?" },
  ],
  U_AM1: [
    {
      label: "Patients across my dentists",
      text: "Which of my dentists' patients are still in treatment?",
    },
    { label: "Try an unmanaged dentist's patient", text: "Show me Lena D's record" },
  ],
  U_P1: [
    { label: "My treatment status", text: "What's my treatment status?" },
    { label: "Cleaning my aligners", text: "How should I clean my aligners?" },
  ],
};

/** All teams share the neutral pill — colour never encodes team identity. */
export const TEAM_COLORS: Record<string, string> = {
  ops: PILL_NEUTRAL,
  clinical: PILL_NEUTRAL,
  sales: PILL_NEUTRAL,
  support: PILL_NEUTRAL,
  finance: PILL_NEUTRAL,
};

export const TEAMS = ["ops", "clinical", "sales", "support", "finance"] as const;
