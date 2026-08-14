import { NextRequest, NextResponse } from "next/server";
import { auditVisibleTo, getPrincipal } from "@/lib/core/store";

export async function GET(req: NextRequest) {
  const principalId = req.nextUrl.searchParams.get("principalId");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 60), 200);
  const principal = principalId ? getPrincipal(principalId) : undefined;
  if (!principal) {
    return NextResponse.json({ error: "principalId required" }, { status: 400 });
  }
  // Scoped: your own calls, plus — for internal staff — your managed dentists'.
  return NextResponse.json({ audit: auditVisibleTo(principal, limit) });
}
