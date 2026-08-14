/** Frontend-only types mirroring the API payloads. */

export interface UiPrincipal {
  id: string;
  type: "internal_staff" | "dentist" | "patient";
  name: string;
  title: string;
  manages?: string[];
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
  routingReason: string;
  teamDecidedBy?: string;
  refs?: { patientId?: string; caseId?: string };
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: UiToolCall[];
  tickets?: UiTicket[];
  feedback?: "up" | "down";
  error?: boolean;
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

export const CHIPS: Record<string, string[]> = {
  U_D1: [
    "What stage is John A's case, and can someone chase the production delay?",
    "What's the guidance on IPR?",
    "What does the knowledge base say about aligner care?",
  ],
  U_D2: [
    "Which of my patients are in refinement?",
    "Nina F's refinement aligners don't fit around the attachments — raise this for a clinical opinion.",
  ],
  U_D3: ["Show me John A's file", "What's the guidance on refinements?"],
  U_AM1: [
    "Which of my dentists' patients are still in treatment?",
    "Show me Lena D's record",
  ],
  U_P1: ["What's my treatment status?", "How should I clean my aligners?"],
};

export const TEAM_COLORS: Record<string, string> = {
  ops: "bg-sky-100 text-sky-800",
  clinical: "bg-emerald-100 text-emerald-800",
  sales: "bg-violet-100 text-violet-800",
  support: "bg-stone-200 text-stone-700",
  finance: "bg-amber-100 text-amber-800",
};

export const TEAMS = ["ops", "clinical", "sales", "support", "finance"] as const;
