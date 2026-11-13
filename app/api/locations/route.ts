import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { locationSuggestions } from "@/lib/locations";

export async function GET(request: NextRequest) {
  await requireAdmin("appointments:manage");
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  const headers = { "Cache-Control": "private, no-store" };
  if (query.length < 3 || query.length > 200) return NextResponse.json({ suggestions: [] }, { headers });
  try {
    // shortcut: public Photon is for low-volume use; use a hosted instance when beta traffic grows.
    const url = new URL("https://photon.komoot.io/api/");
    url.search = new URLSearchParams({ q: query, limit: "5", lang: "en" }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!response.ok) throw new Error("Location search unavailable");
    return NextResponse.json({ suggestions: locationSuggestions(await response.json()) }, { headers });
  } catch {
    return NextResponse.json({ suggestions: [], unavailable: true }, { headers });
  }
}
