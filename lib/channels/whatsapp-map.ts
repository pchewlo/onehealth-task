/**
 * Phone number (E.164, Twilio "whatsapp:+..." form) ↔ existing principal id.
 *
 * This is the identity edge for the WhatsApp channel: bound server-side,
 * before the model is involved — the same guarantee as the web switcher,
 * just keyed on the SIM instead of a dropdown click. Everything downstream
 * (authorize, redaction, audit) is the untouched governed layer.
 *
 * Configure via the WHATSAPP_PHONE_MAP env var (JSON object):
 *   WHATSAPP_PHONE_MAP={"whatsapp:+447700900123":"U_P1"}
 */
const STATIC_MAP: Record<string, string> = {
  // "whatsapp:+44XXXXXXXXXX": "U_P1", // set via env instead
};

let cached: Record<string, string> | null = null;

function map(): Record<string, string> {
  if (!cached) {
    let envMap: Record<string, string> = {};
    try {
      envMap = process.env.WHATSAPP_PHONE_MAP
        ? (JSON.parse(process.env.WHATSAPP_PHONE_MAP) as Record<string, string>)
        : {};
    } catch {
      // A malformed env var must not take the webhook down — fall back to static.
      envMap = {};
    }
    cached = { ...STATIC_MAP, ...envMap };
  }
  return cached;
}

export function phoneToPrincipal(from: string): string | undefined {
  return map()[from];
}

/** Reverse lookup for outbound sends (growth reminders). */
export function principalToPhone(principalId: string): string | undefined {
  return Object.entries(map()).find(([, pid]) => pid === principalId)?.[0];
}
