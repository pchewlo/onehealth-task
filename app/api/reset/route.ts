import { NextResponse } from "next/server";
import { ensureHydrated, persistNow, reset } from "@/lib/core/store";

export async function POST() {
  // Hydrate first so the reset overwrites the durable snapshot too, rather
  // than leaving a stale one to resurrect on the next cold start.
  await ensureHydrated();
  reset();
  await persistNow();
  return NextResponse.json({ ok: true });
}
