import type { Action, Decision, Principal } from "./types";

/**
 * THE choke point.
 *
 * Every tool handler calls authorize() before it touches data. There is no
 * second path to the store that skips this function, and no tool argument by
 * which a caller can name a principal — the principal is bound outside the
 * model's control (see lib/mcp/server.ts).
 *
 * Two properties matter more than the rules themselves:
 *
 *  1. FAIL CLOSED. The function ends in a deny. A resource kind or principal
 *     type nobody has written a rule for is rejected, not waved through. Adding
 *     a new entity to the seed data grants nobody access until someone writes
 *     the rule here.
 *
 *  2. NO EXISTENCE LEAK. Scope is checked before existence. A dentist probing
 *     another dentist's patient gets OUT_OF_SCOPE, and a dentist probing an id
 *     that does not exist at all gets the same OUT_OF_SCOPE — so the error
 *     itself cannot be used to enumerate the database.
 */
export function authorize(p: Principal, action: Action): Decision {
  const ref = action.resource ?? {};

  // The knowledge base is shared clinical reference material. Every principal
  // type may read it; it contains no patient data.
  if (action.kind === "kb") {
    if (action.op !== "read") {
      return deny("FORBIDDEN_TYPE", "The knowledge base is read-only.");
    }
    return { allow: true };
  }

  switch (p.type) {
    case "internal_staff": {
      const manages = p.manages ?? [];
      if (action.kind === "patient" || action.kind === "case") {
        if (action.op !== "read") {
          return deny(
            "FORBIDDEN_TYPE",
            "Internal staff have read-only access to patients and cases.",
          );
        }
        if (!ref.dentistId) {
          // Un-owned resource: nothing to check ownership against.
          return deny("OUT_OF_SCOPE", "Resource has no owning dentist.");
        }
        return manages.includes(ref.dentistId)
          ? { allow: true }
          : deny(
              "OUT_OF_SCOPE",
              `${p.name} manages ${manages.join(", ") || "no dentists"}; this record belongs to ${ref.dentistId}.`,
            );
      }
      if (action.kind === "ticket") {
        // Staff may create tickets about the dentists they manage, and read
        // back only the tickets they created themselves.
        if (action.op === "create" && ref.dentistId && !manages.includes(ref.dentistId)) {
          return deny(
            "OUT_OF_SCOPE",
            `Cannot raise a ticket about ${ref.dentistId} — outside the managed set.`,
          );
        }
        return { allow: true };
      }
      break;
    }

    case "dentist": {
      if (action.kind === "patient" || action.kind === "case") {
        if (action.op !== "read") {
          return deny(
            "FORBIDDEN_TYPE",
            "Dentists have read-only access through this layer.",
          );
        }
        return ref.dentistId === p.dentistId
          ? { allow: true }
          : deny(
              "OUT_OF_SCOPE",
              `This record is not under ${p.name}'s practice (${p.dentistId}).`,
            );
      }
      if (action.kind === "ticket") {
        if (action.op === "create" && ref.dentistId && ref.dentistId !== p.dentistId) {
          return deny(
            "OUT_OF_SCOPE",
            "A ticket may only reference your own patients and cases.",
          );
        }
        return { allow: true };
      }
      break;
    }

    case "patient": {
      if (action.kind === "patient" || action.kind === "case") {
        if (action.op !== "read") {
          return deny("FORBIDDEN_TYPE", "Patients have read-only access.");
        }
        return ref.patientId === p.patientId
          ? { allow: true }
          : deny("OUT_OF_SCOPE", "A patient may only read their own record.");
      }
      if (action.kind === "ticket") {
        if (action.op === "create" && ref.patientId && ref.patientId !== p.patientId) {
          return deny(
            "OUT_OF_SCOPE",
            "A ticket may only reference your own record.",
          );
        }
        return { allow: true };
      }
      break;
    }
  }

  // Nothing matched. Fail closed.
  return deny(
    "FORBIDDEN_TYPE",
    `A ${p.type} principal cannot ${action.op} a ${action.kind}.`,
  );
}

function deny(code: "OUT_OF_SCOPE" | "UNKNOWN_RESOURCE" | "FORBIDDEN_TYPE", reason: string): Decision {
  return { allow: false, code, reason };
}

/** The set of dentistIds a principal can see any data for at all. */
export function visibleDentistIds(p: Principal): string[] {
  if (p.type === "internal_staff") return p.manages ?? [];
  if (p.type === "dentist") return p.dentistId ? [p.dentistId] : [];
  return [];
}
