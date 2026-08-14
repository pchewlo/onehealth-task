import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MutableState } from "./store";

/**
 * Optional Supabase durability for the demo store: the whole mutable state is
 * one JSONB row, written after each mutating request and read once per cold
 * process. Deliberately demo-grade — last write wins across instances, which
 * is fine for a single-demo audience and keeps the store's synchronous API.
 * A real deployment replaces store.ts with per-entity tables + RLS instead
 * (see README, "Hardening for production").
 *
 * With SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset, both functions no-op
 * and the app runs purely in-memory. The service-role key stays server-side;
 * the table carries RLS with no policies so anon keys can't touch it.
 */

const TABLE = "demo_state";
// Local dev and CI use their own row so a test reset can never wipe the
// production demo (learned the hard way).
const ROW_ID = process.env.DEMO_STATE_ROW || "main";

let client: SupabaseClient | null | undefined;

function supabase(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return client;
}

export async function loadState(): Promise<MutableState | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from(TABLE).select("state").eq("id", ROW_ID).maybeSingle();
    if (error || !data?.state) return null;
    return data.state as MutableState;
  } catch {
    // Unreachable DB (paused project, bad creds) must never take the demo
    // down — fall back to in-memory.
    return null;
  }
}

export async function saveState(s: MutableState): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  try {
    await sb
      .from(TABLE)
      .upsert({ id: ROW_ID, state: s as unknown as Record<string, unknown>, updated_at: new Date().toISOString() });
  } catch {
    // Same rationale: persistence is best-effort, the request must succeed.
  }
}
