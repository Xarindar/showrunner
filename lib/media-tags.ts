import { nonEmptyStringArrayFromUnknown } from "@/lib/format";

export type MediaTagSummary = {
  count: number;
  name: string;
};

/** Builds an asset count for each tag while counting a duplicated tag only once per asset. */
export function summarizeMediaTags(rows: ReadonlyArray<{ tags?: unknown }>, limit = 20): MediaTagSummary[] {
  const counts = new Map<string, MediaTagSummary>();

  rows.forEach((row) => {
    const uniqueTags = new Map(
      nonEmptyStringArrayFromUnknown(row.tags).map((tag) => {
        const name = tag.trim();
        return [name.toLocaleLowerCase(), name] as const;
      })
    );

    uniqueTags.forEach((name, key) => {
      const current = counts.get(key);
      counts.set(key, { count: (current?.count || 0) + 1, name: current?.name || name });
    });
  });

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}
