import { NextResponse } from "next/server";
import { PRINCIPALS } from "@/lib/core/store";

export async function GET() {
  // Names, types and titles only — enough for the switcher, nothing more.
  return NextResponse.json({
    principals: PRINCIPALS.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      title: p.title,
      manages: p.manages,
    })),
  });
}
