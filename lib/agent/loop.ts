import Anthropic from "@anthropic-ai/sdk";
import { connectGovernedServer } from "../mcp/server";
import { PRINCIPALS, appendEvent, getPrincipal, nextId, rawPatient } from "../core/store";

/**
 * The agent loop. Orchestration only — no policy lives here.
 *
 * The model talks to the governed layer through a real MCP client whose server
 * was constructed around the resolved principal (see lib/mcp/server.ts). Tool
 * definitions are bridged mechanically from MCP's listTools() to Anthropic's
 * tool format; nothing is hand-duplicated, so the layer stays the single
 * source of truth for what the model can do.
 */

// Verbatim from the spec — the honest-refusal framing is deliberate: the model
// is told the server enforces scope so it relays denials plainly instead of
// improvising or apologising its way into a hallucination.
const SYSTEM_PROMPT = `You are the assistant for a clear-aligner dental platform. You can only see data the current signed-in user is allowed to see; the server enforces this and you cannot override it. If a tool returns an OUT_OF_SCOPE error, tell the user plainly that this is outside their access and suggest raising a ticket if appropriate. Never guess restricted data (dates of birth, emails are never available). Use knowledge-base search for clinical questions. When something needs a human, create a ticket and tell the user which team will handle it.`;

const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 6;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  allowed: boolean;
  errorCode?: string;
  reason?: string;
  /** parsed result payload when allowed (e.g. the created ticket) */
  result?: unknown;
}

export interface AgentResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  denials: ToolCallRecord[];
}

export async function runAgent(input: {
  principalId: string;
  messages: ChatMessage[];
  conversationId: string;
  /** Which surface the conversation arrives on. Channel shapes TONE and
   * verbosity via the system prompt; it never changes what authorize()
   * allows — scope is principal-based and channel-blind. */
  channel?: "web" | "whatsapp";
}): Promise<AgentResult> {
  // Principal resolution happens HERE, server-side, from the session identity.
  // In production this line reads a verified session cookie / JWT; the demo
  // reads the switcher's id. Either way it is never a model-visible input.
  const principal = getPrincipal(input.principalId);
  if (!principal) throw new Error(`Unknown principal ${input.principalId}`);

  const mcp = await connectGovernedServer(principal);
  const anthropic = new Anthropic();

  // Who-am-I-serving context, appended server-side. This is information, not
  // authority — the model knowing the user's name and id changes which tool it
  // reaches for first; it changes nothing about what authorize() will allow.
  // (Found by the eval harness: a patient asking "what's my status?" tripped a
  // FORBIDDEN_TYPE denial en route because the model had to discover its own id.)
  const identity = `\n\nCurrently signed in: ${principal.name} (${principal.type.replace("_", " ")}${
    principal.dentistId
      ? `, dentist id ${principal.dentistId}`
      : principal.patientId
        ? `, patient id ${principal.patientId} — use get_patient/list_cases with this id for their own records`
        : principal.manages?.length
          ? `, manages dentists ${principal.manages.join(", ")}`
          : ""
  }).`;

  // Over WhatsApp the sandbox header says "Twilio" — so the voice does the
  // branding instead: the assistant speaks as the patient's own practice.
  const patientPractice =
    principal.patientId
      ? PRINCIPALS.find(
          (u) => u.dentistId === rawPatient(principal.patientId!)?.dentistId,
        )?.practice
      : undefined;
  const channelNote =
    input.channel === "whatsapp"
      ? `\n\nThis conversation arrives over WhatsApp: reply in short plain text (no markdown tables or headers; *single asterisks* for bold are fine). You are messaging as the assistant for ${patientPractice ?? "the patient's dental practice"} — open your first reply in a conversation naturally as that practice's assistant. Share the user's own treatment status and simple guidance; for anything detailed or clinical, suggest they open the app or contact the practice.`
      : "";

  // Bridge MCP tool definitions → Anthropic tool definitions, mechanically.
  const { tools: mcpTools } = await mcp.listTools();
  const tools: Anthropic.Tool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: ToolCallRecord[] = [];
  let reply = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // claude-sonnet-5 runs adaptive thinking by default; effort defaults are
    // fine for this workload. The installed SDK's types predate the adaptive
    // literal, so we simply omit the field rather than fight the typings.
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT + identity + channelNote,
      tools,
      messages,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text) reply = text;

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const res = await mcp.callTool({
        name: use.name,
        arguments: use.input as Record<string, unknown>,
      });
      const content = res.content as { type: string; text?: string }[];
      const textOut = content.find((c) => c.type === "text")?.text ?? "{}";

      let parsed: unknown = undefined;
      let errorCode: string | undefined;
      let reason: string | undefined;
      try {
        parsed = JSON.parse(textOut);
        const err = (parsed as { error?: { code?: string; reason?: string } }).error;
        errorCode = err?.code;
        reason = err?.reason;
      } catch {
        /* non-JSON tool output; pass through as-is */
      }

      toolCalls.push({
        tool: use.name,
        args: use.input,
        allowed: !res.isError,
        errorCode,
        reason,
        result: res.isError ? undefined : parsed,
      });

      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: textOut,
        is_error: Boolean(res.isError),
      });
    }
    messages.push({ role: "user", content: results });
  }

  await mcp.close();

  // Metric events: one per user message + assistant reply. Denials feed the
  // dashboard's denial rate.
  const lastUser = input.messages.filter((m) => m.role === "user").at(-1);
  if (lastUser) {
    appendEvent({
      id: nextId("ev"),
      ts: new Date().toISOString(),
      type: "message",
      principalId: input.principalId,
      conversationId: input.conversationId,
      role: "user",
      text: lastUser.content.slice(0, 200),
    });
  }
  for (const d of toolCalls.filter((c) => !c.allowed)) {
    appendEvent({
      id: nextId("ev"),
      ts: new Date().toISOString(),
      type: "denial",
      principalId: input.principalId,
      conversationId: input.conversationId,
      text: `${d.tool}: ${d.errorCode ?? "error"}`,
    });
  }
  appendEvent({
    id: nextId("ev"),
    ts: new Date().toISOString(),
    type: "message",
    principalId: input.principalId,
    conversationId: input.conversationId,
    role: "assistant",
    text: reply.slice(0, 200),
  });

  return {
    reply,
    toolCalls,
    denials: toolCalls.filter((c) => !c.allowed),
  };
}
