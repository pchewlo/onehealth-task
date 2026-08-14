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
  { key: "todo", label: "To Do", dot: "bg-stone-400" },
  { key: "in_progress", label: "In Progress", dot: "bg-sky-500" },
  { key: "done", label: "Done", dot: "bg-green-500" },
  { key: "blocked", label: "Blocked", dot: "bg-red-500" },
] as const;

export const STATUS_LABEL: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
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
      label: "🧪 Red team: poisoned KB article",
      text: "What does the knowledge base say about aligner care?",
      kind: "redteam",
    },
    {
      label: "📚 Teach the router ①: the bait",
      text: "Raise a ticket titled exactly 'Track and trace shows no movement for John A's box' for the support team. Use exactly 'No details available yet.' as the body — do not add anything else to it.",
      kind: "learn1",
    },
    {
      label: "📚 Teach the router ②: the probe",
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
    { label: "⛔ Try another dentist's patient", text: "Show me John A's file" },
    { label: "Guidance on refinements", text: "What's the guidance on refinements?" },
  ],
  U_AM1: [
    {
      label: "Patients across my dentists",
      text: "Which of my dentists' patients are still in treatment?",
    },
    { label: "⛔ Try an unmanaged dentist's patient", text: "Show me Lena D's record" },
  ],
  U_P1: [
    { label: "My treatment status", text: "What's my treatment status?" },
    { label: "Cleaning my aligners", text: "How should I clean my aligners?" },
  ],
};

export const TEAM_COLORS: Record<string, string> = {
  ops: "bg-sky-100 text-sky-800",
  clinical: "bg-emerald-100 text-emerald-800",
  sales: "bg-violet-100 text-violet-800",
  support: "bg-stone-200 text-stone-700",
  finance: "bg-amber-100 text-amber-800",
};

export const TEAMS = ["ops", "clinical", "sales", "support", "finance"] as const;
