import type { PrincipalType, ResourceKind } from "./types";

/**
 * Field allowlists — the second half of the guarantee.
 *
 * Output is built by PICKING allowlisted fields off the raw record, never by
 * deleting unwanted ones. The difference matters: a delete-list is only correct
 * for the fields someone remembered to list. A pick-list is correct by
 * construction — add `nhs_number` or `insurance_id` to seed.json tomorrow and
 * it is invisible to every principal and every tool until somebody edits this
 * file. New data is private by default.
 *
 * `dob` and `email` appear in no allowlist. There is no code path that returns
 * them, so no prompt can talk the model into leaking them: the model never
 * receives them in the first place.
 */
const ALLOWLIST: Record<ResourceKind, Partial<Record<PrincipalType | "any", readonly string[]>>> = {
  patient: {
    dentist: ["id", "name", "status", "dentistId"],
    internal_staff: ["id", "name", "status", "dentistId"],
    // A patient does not need to know their record's internal owner key.
    patient: ["id", "name", "status"],
  },
  case: { any: ["id", "dentistId", "patientId", "type", "stage"] },
  kb: { any: ["id", "topic", "title", "body"] },
  ticket: {
    any: ["id", "team", "subject", "status", "createdAt", "routingReason", "teamDecidedBy", "refs"],
  },
} as const;

export function project<T extends Record<string, unknown>>(
  kind: ResourceKind,
  principalType: PrincipalType,
  record: T,
): Record<string, unknown> {
  const table = ALLOWLIST[kind];
  const fields = table[principalType] ?? table.any;
  if (!fields) {
    // No allowlist defined → return nothing rather than everything.
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in record) out[f] = record[f as keyof T];
  }
  return out;
}

export function projectMany<T extends Record<string, unknown>>(
  kind: ResourceKind,
  principalType: PrincipalType,
  records: readonly T[],
): Record<string, unknown>[] {
  return records.map((r) => project(kind, principalType, r));
}

/** Used by the proof script to assert restricted fields never appear anywhere. */
export const RESTRICTED_FIELDS = ["dob", "email"] as const;
