/**
 * Phone number (E.164, Twilio "whatsapp:+..." form) → existing principal id.
 *
 * This is the identity edge for the WhatsApp channel: bound server-side,
 * before the model is involved — the same guarantee as the web switcher,
 * just keyed on the SIM instead of a dropdown click. Everything downstream
 * (authorize, redaction, audit) is the untouched governed layer.
 *
 * Configure via the WHATSAPP_PHONE_MAP env var (JSON object), so the demo
 * number never needs a code change:
 *   WHATSAPP_PHONE_MAP={"whatsapp:+447700900123":"U_P1"}
 * Entries below are static fallbacks for local dev.
 */
const STATIC_MAP: Record<string, string> = {
  // "whatsapp:+44XXXXXXXXXX": "U_P1", // Tom's phone → John A (patient) — set via env instead
};

let cached: Record<string, string> | null = null;

export function phoneToPrincipal(from: string): string | undefined {
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
  return cached[from];
}
