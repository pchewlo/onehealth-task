import { NextResponse } from "next/server";
import { PRINCIPALS } from "@/lib/core/store";

export async function GET() {
  // Names, types and titles only — enough for the switcher, nothing more.
  // Managed dentist ids are resolved to practice names here so the UI never
  // shows raw internal ids like "D1".
  const practiceOf = (dentistId: string): string =>
    PRINCIPALS.find((u) => u.dentistId === dentistId)?.practice ?? dentistId;

  return NextResponse.json({
    principals: PRINCIPALS.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      title: p.title,
      manages: p.manages,
      managesNames: p.manages?.map(practiceOf),
    })),
  });
}
