import { z } from "zod";

const photonResponse = z.object({ features: z.array(z.object({ properties: z.object({
  name: z.string().optional(), housenumber: z.string().optional(), street: z.string().optional(),
  city: z.string().optional(), district: z.string().optional(), state: z.string().optional(),
  postcode: z.string().optional(), country: z.string().optional()
}) })).max(20) });

export function locationSuggestions(response: unknown): string[] {
  const parsed = photonResponse.safeParse(response);
  if (!parsed.success) return [];
  return [...new Set(parsed.data.features.map(({ properties: p }) => {
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    return [...new Set([p.name, street, p.city || p.district, p.state, p.postcode, p.country].filter(Boolean))].join(", ");
  }).filter(label => label && label.length <= 500))].slice(0, 5);
}

export function locationMapHref(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
