/**
 * Minimal Twilio REST sender for the growth demo. Free-form outbound works
 * only inside WhatsApp's 24h session window (opened by any inbound message
 * from the recipient); outside it, Twilio rejects with a template-required
 * error — the caller surfaces that honestly and the demo falls back to the
 * booking link on screen.
 */

const SANDBOX_FROM = "whatsapp:+14155238886";

export async function sendWhatsApp(
  to: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: "Twilio credentials not configured" };

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: SANDBOX_FROM, To: to, Body: body }),
      },
    );
    const j = (await res.json()) as { status?: string; message?: string; error_message?: string };
    if (!res.ok) {
      return { ok: false, error: j.message || j.error_message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
