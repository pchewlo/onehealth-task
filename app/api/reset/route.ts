import { NextResponse } from "next/server";
import { reset } from "@/lib/core/store";

export async function POST() {
  reset();
  return NextResponse.json({ ok: true });
}
