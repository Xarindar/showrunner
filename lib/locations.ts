import { z } from "zod";

const photonResponse = z.object({ features: z.array(z.object({ properties: z.object({
  name: z.string().optional(), housenumber: z.string().optional(), street: z.string().optional(),
  city: z.string().optional(), district: z.string().optional(), state: z.string().optional(),
  postcode: z.string().optional(), country: z.string().optional()
}) })).max(20) });

export function locationMatches(response: unknown) {
  const parsed = photonResponse.safeParse(response);
  if (!parsed.success) return [];
  const matches = new Map<string, { label: string; address: string; city: string; state: string; zip: string }>();
  for (const { properties: p } of parsed.data.features) {
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const city = p.city || p.district || "";
    const label = [...new Set([p.name, street, city, p.state, p.postcode, p.country].filter(Boolean))].join(", ");
    if (label && label.length <= 500) matches.set(label, { label, address: street || p.name || "", city, state: p.state || "", zip: p.postcode || "" });
  }
  return [...matches.values()].slice(0, 5);
}

export function locationSuggestions(response: unknown): string[] {
  return locationMatches(response).map(match => match.label);
}

export async function lookupLocationMatches(query: string) {
  if (query.length < 3 || query.length > 200) return [];
  // shortcut: public Photon is for low-volume use; use a hosted instance when beta traffic grows.
  const url = new URL("https://photon.komoot.io/api/");
  url.search = new URLSearchParams({ q: query, limit: "5", lang: "en" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
  if (!response.ok) throw new Error("Location search unavailable");
  return locationMatches(await response.json());
}

export function locationMapHref(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
