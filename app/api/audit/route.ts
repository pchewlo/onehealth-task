import { NextRequest, NextResponse } from "next/server";
import { readAudit } from "@/lib/core/store";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  return NextResponse.json({ audit: readAudit(Math.min(limit, 200)) });
}
