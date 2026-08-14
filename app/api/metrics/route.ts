import { NextResponse } from "next/server";
import { buildBackfill, foldMetrics } from "@/lib/core/metrics";
import { appendEvent, isBackfilled, markBackfilled, readEvents } from "@/lib/core/store";

export async function GET() {
  // Seed the synthetic history on first read, honestly labelled downstream.
  if (!isBackfilled()) {
    for (const e of buildBackfill(new Date())) appendEvent(e);
    markBackfilled();
  }
  const events = readEvents();
  return NextResponse.json({
    metrics: foldMetrics(events),
    liveEvents: events.filter((e) => !e.synthetic).length,
    syntheticEvents: events.filter((e) => e.synthetic).length,
  });
}
