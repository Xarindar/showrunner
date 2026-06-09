export function cssBackgroundImage(url: string) {
  if (!url) return undefined;
  return `url("${url.replaceAll('"', "%22")}")`;
}
