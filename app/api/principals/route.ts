import { NextResponse } from "next/server";
import { PRINCIPALS, rawPatient } from "@/lib/core/store";

export async function GET() {
  // Names, types and titles only — enough for the switcher, nothing more.
  // Managed dentist ids are resolved to practice names here so the UI never
  // shows raw internal ids like "D1".
  const practiceOf = (dentistId: string): string =>
    PRINCIPALS.find((u) => u.dentistId === dentistId)?.practice ?? dentistId;

  // A patient's practice comes via their own record's dentistId — the same
  // switcher-grade metadata as the dentists' practice names, nothing clinical.
  const patientPractice = (patientId?: string): string | undefined => {
    const dentistId = patientId ? rawPatient(patientId)?.dentistId : undefined;
    return dentistId ? practiceOf(dentistId) : undefined;
  };

  return NextResponse.json({
    principals: PRINCIPALS.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      title: p.title,
      manages: p.manages,
      managesNames: p.manages?.map(practiceOf),
      practice: p.type === "patient" ? patientPractice(p.patientId) : undefined,
      // For the switcher's hierarchy only: which dentist a card hangs off.
      dentistId:
        p.type === "dentist"
          ? p.dentistId
          : p.type === "patient" && p.patientId
            ? rawPatient(p.patientId)?.dentistId
            : undefined,
    })),
  });
}
