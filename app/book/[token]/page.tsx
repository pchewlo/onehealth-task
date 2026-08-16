import { verifyBookingToken } from "@/lib/growth/token";
import { PRINCIPALS, rawPatient } from "@/lib/core/store";
import { BookingFlow } from "./BookingFlow";

/**
 * M10 — the booking page a patient lands on from the WhatsApp link. The token
 * scopes the page to one patient without a login: same principal-at-the-edge
 * idea as the switcher and the SIM. Server-verified before anything renders.
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { token } = await params;
  const { type } = await searchParams;
  const patientId = verifyBookingToken(token);
  const patient = patientId ? rawPatient(patientId) : undefined;

  if (!patient) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="text-[15px] font-semibold">This booking link isn&rsquo;t valid</div>
        <p className="text-[12.5px] text-[var(--ink-2)]">
          It may have been mistyped. Please use the link from your message, or contact your
          practice.
        </p>
      </main>
    );
  }

  const practice =
    PRINCIPALS.find((u) => u.dentistId === patient.dentistId)?.practice ?? "your practice";

  return (
    <BookingFlow
      token={token}
      firstName={patient.name.split(" ")[0]}
      practice={practice}
      treatment={type === "whitening" ? "whitening" : "check-up"}
    />
  );
}
