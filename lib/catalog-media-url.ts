// Legacy catalog images live on the client website. API media routes remain on Showrunner.
export function catalogMediaUrl(value: string, websiteUrl?: string) {
  if (!value || /^https?:\/\//i.test(value) || value.startsWith("/api/")) return value;
  if (!websiteUrl) return value;
  try { return new URL(value, new URL("/", websiteUrl)).toString(); }
  catch { return value; }
}
