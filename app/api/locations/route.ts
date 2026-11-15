import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { lookupLocationMatches } from "@/lib/locations";

export async function GET(request: NextRequest) {
  await requireAdmin("appointments:manage");
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const suggestions = (await lookupLocationMatches(query)).map(match => match.label);
    return NextResponse.json({ suggestions }, { headers });
  } catch {
    return NextResponse.json({ suggestions: [], unavailable: true }, { headers });
  }
}
