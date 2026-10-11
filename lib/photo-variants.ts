export function photoVariantKey(assetId: string, type: string) {
  const names: Record<string, string> = { THUMBNAIL: "thumbnail-320", HERO: "header-1920", FULL: "portfolio-2048", CARD: "card-legacy", SOCIAL: "social-1200" };
  if (!names[type] || !/^[a-zA-Z0-9_-]+$/.test(assetId)) throw new Error("Invalid photo variant");
  return `photos/${assetId}/${names[type]}.webp`;
}
