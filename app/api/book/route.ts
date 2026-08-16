import { NextRequest, NextResponse } from "next/server";
import { verifyBookingToken } from "@/lib/growth/token";
import {
  PRINCIPALS,
  addBooking,
  ensureHydrated,
  nextId,
  persistNow,
  rawPatient,
} from "@/lib/core/store";

/**
 * M10 — confirm a booking. The token IS the authorisation: it was signed
 * server-side for exactly one patient, so the page (and this endpoint) can
 * only ever book as that patient — principal-at-the-edge, no login.
 */
export async function POST(req: NextRequest) {
  await ensureHydrated({ force: true });
  const body = (await req.json()) as { token?: string; slot?: string; treatment?: string };
  const patientId = body.token ? verifyBookingToken(body.token) : null;
  const patient = patientId ? rawPatient(patientId) : undefined;
  if (!patient || !body.slot) {
    return NextResponse.json({ error: "Invalid booking link" }, { status: 400 });
  }

  const booking = {
    id: nextId("B"),
    ts: new Date().toISOString(),
    patientId: patient.id,
    patientName: patient.name,
    practice: PRINCIPALS.find((u) => u.dentistId === patient.dentistId)?.practice ?? patient.dentistId,
    dentistId: patient.dentistId,
    slot: body.slot,
    treatment: (body.treatment === "whitening" ? "whitening" : "check-up") as
      | "check-up"
      | "whitening",
  };
  addBooking(booking);
  await persistNow();
  return NextResponse.json({ ok: true, booking });
}
