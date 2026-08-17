import { NextRequest, NextResponse } from "next/server";
import { makeBookingToken } from "@/lib/growth/token";
import { principalToPhone } from "@/lib/channels/whatsapp-map";
import { sendWhatsApp } from "@/lib/channels/twilio";
import { projectMany } from "@/lib/core/redact";
import {
  PRINCIPALS,
  bookingsVisibleTo,
  ensureHydrated,
  getPrincipal,
  patientsForDentists,
  persistNow,
  rawPatient,
} from "@/lib/core/store";

export const maxDuration = 30;

/**
 * M10 — growth surface (staff only). GET lists the patients in scope (through
 * the same allowlist projection as everything else — no dob/email here
 * either) plus bookings. POST sends a check-up reminder over WhatsApp with a
 * signed booking link; if the 24h session window is closed or the patient has
 * no mapped phone, the link comes back for on-screen use instead.
 */

function staffOnly(principalId: string | null) {
  const p = principalId ? getPrincipal(principalId) : undefined;
  return p && p.type === "internal_staff" ? p : undefined;
}

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const staff = staffOnly(req.nextUrl.searchParams.get("principalId"));
  if (!staff) return NextResponse.json({ error: "staff only" }, { status: 403 });

  const rows = patientsForDentists(staff.manages ?? []);
  const patients = projectMany("patient", "internal_staff", rows).map((p) => ({
    ...p,
    // Which patients can actually receive the WhatsApp (demo: only Tom's).
    hasPhone: Boolean(
      PRINCIPALS.find((u) => u.patientId === p.id)?.id &&
        principalToPhone(PRINCIPALS.find((u) => u.patientId === p.id)!.id),
    ),
    practice: PRINCIPALS.find((u) => u.dentistId === p.dentistId)?.practice ?? p.dentistId,
  }));

  return NextResponse.json({ patients, bookings: bookingsVisibleTo(staff) });
}

export async function POST(req: NextRequest) {
  await ensureHydrated({ force: true });
  const body = (await req.json()) as {
    principalId?: string;
    patientId?: string;
    action?: "checkup" | "whitening";
  };
  const staff = staffOnly(body.principalId ?? null);
  if (!staff) return NextResponse.json({ error: "staff only" }, { status: 403 });

  const patient = body.patientId ? rawPatient(body.patientId) : undefined;
  if (!patient || !(staff.manages ?? []).includes(patient.dentistId)) {
    return NextResponse.json({ error: "Patient not in your book" }, { status: 404 });
  }

  const token = makeBookingToken(patient.id);
  const origin = req.nextUrl.origin.includes("localhost")
    ? req.nextUrl.origin
    : "https://onehealth-task.vercel.app";
  const link = `${origin}/book/${token}`;

  const firstName = patient.name.split(" ")[0];
  const practice =
    PRINCIPALS.find((u) => u.dentistId === patient.dentistId)?.practice ?? "your practice";
  const whitening = body.action === "whitening";
  const message = whitening
    ? `*${practice}*\nHi ${firstName}, if you've been considering teeth whitening — we're running an offer at the moment. Upload a quick photo of your teeth and see what you could look like: ${origin}/whitening?t=${token}`
    : `*${practice}*\nHi ${firstName}, it's been 6 months since your last visit — time for a check-up. Book here: ${link}`;

  // Patient record → their login principal → mapped phone (demo: Tom's).
  const patientPrincipal = PRINCIPALS.find((u) => u.patientId === patient.id);
  const phone = patientPrincipal ? principalToPhone(patientPrincipal.id) : undefined;

  let sent = false;
  let sendError: string | undefined;
  if (phone) {
    const res = await sendWhatsApp(phone, message);
    sent = res.ok;
    sendError = res.error;
  } else {
    sendError = "No WhatsApp number mapped for this patient (demo maps one number)";
  }

  await persistNow();
  return NextResponse.json({
    ok: true,
    sent,
    sendError,
    link: whitening ? `${origin}/whitening?t=${token}` : link,
    message,
  });
}
