import { NextResponse } from "next/server";
import { buildBackfill, foldMetrics } from "@/lib/core/metrics";
import {
  appendEvent,
  ensureHydrated,
  isBackfilled,
  markBackfilled,
  persistNow,
  readEvents,
} from "@/lib/core/store";

export async function GET() {
  await ensureHydrated();
  // Seed the synthetic history on first read, honestly labelled downstream.
  if (!isBackfilled()) {
    for (const e of buildBackfill(new Date())) appendEvent(e);
    markBackfilled();
    await persistNow();
  }
  const events = readEvents();
  return NextResponse.json({
    metrics: foldMetrics(events),
    liveEvents: events.filter((e) => !e.synthetic).length,
    syntheticEvents: events.filter((e) => e.synthetic).length,
  });
}
