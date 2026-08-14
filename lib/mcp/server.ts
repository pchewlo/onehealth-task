import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import {
  createTicket,
  getCase,
  getPatient,
  listCases,
  listMyPatients,
  listMyTickets,
  searchKnowledgeBase,
  type OpResult,
} from "../core/operations";
import type { Principal } from "../core/types";

/**
 * ── PRINCIPAL BINDING — the architectural centrepiece ──────────────────────
 *
 * The principal is fixed HERE, at server construction, as a closure over every
 * tool handler. It is not a tool argument, not a header the model can set, not
 * anything that appears in the conversation. By the time the model sees a tool
 * schema, "who is asking" has already been decided by the server process.
 *
 * The model literally has no vocabulary to name a different principal — the
 * word does not exist in its tool inputs. In the original spec this binding is
 * a --principal flag on a spawned stdio process; here (serverless) it is a
 * per-request in-memory transport pair. Same property, same place in the
 * architecture: identity is decided by infrastructure, never by inference.
 * ───────────────────────────────────────────────────────────────────────────
 */
export async function connectGovernedServer(principal: Principal): Promise<Client> {
  const server = new McpServer({ name: "governed-dental-layer", version: "1.0.0" });

  // Every handler: delegate to core, wrap the result. On a deny we return a
  // STRUCTURED TOOL ERROR as content — not a protocol failure — so the agent
  // can relay the refusal honestly instead of crashing the loop.
  const wrap = (r: OpResult) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(r.ok ? r.data : { error: r.error }),
      },
    ],
    isError: !r.ok,
  });

  server.tool(
    "list_my_patients",
    "List every patient the signed-in user is allowed to see. For internal staff this spans all the dentists they manage (each row includes dentistId); for a dentist it is their own patients only. The server enforces this scope — results cannot include anyone else's patients.",
    {},
    async () => wrap(listMyPatients(principal)),
  );

  server.tool(
    "get_patient",
    "Fetch one patient record by id, if it is within the signed-in user's scope. Returns id, name and treatment status only — dates of birth and email addresses are never available through this layer, for any caller.",
    { patientId: z.string().describe("Patient id, e.g. P1") },
    async ({ patientId }) => wrap(getPatient(principal, patientId)),
  );

  server.tool(
    "list_cases",
    "List treatment cases in the signed-in user's scope, optionally filtered to one patient. Each case has a type (SOLO/DUO) and a stage such as treatment_planning, aligners_in_production, refinement, retention or complete.",
    { patientId: z.string().optional().describe("Optional patient id filter") },
    async ({ patientId }) => wrap(listCases(principal, patientId)),
  );

  server.tool(
    "get_case",
    "Fetch one treatment case by id, if it is within the signed-in user's scope.",
    { caseId: z.string().describe("Case id, e.g. C1") },
    async ({ caseId }) => wrap(getCase(principal, caseId)),
  );

  server.tool(
    "search_kb",
    "Search the shared clinical knowledge base (IPR, attachments, refinements, aligner care). Available to every user; contains no patient data. Use this for clinical or how-to questions before answering from memory.",
    { query: z.string().describe("Search terms") },
    async ({ query }) => wrap(searchKnowledgeBase(principal, query)),
  );

  server.tool(
    "create_ticket",
    "Raise an internal ticket for a human team (ops, clinical, sales, support, finance). You may suggest a team; the server routes deterministically from the subject and body and will override a wrong suggestion — the final team comes back in the result. Reference a patientId/caseId only from the signed-in user's own scope; out-of-scope references are rejected.",
    {
      subject: z.string().describe("Short summary of the issue"),
      body: z.string().describe("What happened and what the team should do"),
      team_suggestion: z
        .enum(["ops", "clinical", "sales", "support", "finance"])
        .optional()
        .describe("Your best guess at the right team (server decides)"),
      patientId: z.string().optional().describe("Related patient in your scope"),
      caseId: z.string().optional().describe("Related case in your scope"),
      internal: z
        .boolean()
        .optional()
        .describe(
          "Set true when the ticket reports on the current session itself (e.g. repeated denied access attempts, suspected misuse). The signed-in user will not see the ticket — tell them only that the relevant team has been notified.",
        ),
    },
    async (input) => wrap(createTicket(principal, input)),
  );

  server.tool(
    "list_my_tickets",
    "List the tickets the signed-in user has raised, newest first.",
    {},
    async () => wrap(listMyTickets(principal)),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "governed-agent", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}
