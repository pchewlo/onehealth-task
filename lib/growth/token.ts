import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed booking tokens — the principal-at-the-edge idea, third appearance.
 * The web app binds identity via the switcher, WhatsApp via the SIM, and the
 * booking link via this token: it encodes WHICH patient the page is for,
 * signed server-side, so the booking screen is scoped without a login. The
 * patient can only book as themselves because the link can only BE themselves.
 *
 * Demo-grade: HMAC over patientId, no expiry. Hardening: short TTL + single
 * use + rotate secret.
 */

const secret = () => process.env.BOOKING_SECRET || "demo-booking-secret";

function sig(patientId: string): string {
  return createHmac("sha256", secret()).update(patientId).digest("hex").slice(0, 16);
}

export function makeBookingToken(patientId: string): string {
  return Buffer.from(`${patientId}:${sig(patientId)}`).toString("base64url");
}

export function verifyBookingToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [patientId, provided] = raw.split(":");
    if (!patientId || !provided) return null;
    const expected = sig(patientId);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return patientId;
  } catch {
    return null;
  }
}
