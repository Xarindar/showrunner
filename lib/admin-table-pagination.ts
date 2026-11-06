export const defaultTablePageSize = 25;

export function tablePageSize(value?: string) {
  const size = Number(value);
  return Number.isInteger(size) && size >= 1 && size <= 100 ? size : defaultTablePageSize;
}

export function tablePageHref(href: string | undefined, pageSize?: number) {
  if (!href || !pageSize) return href;
  const [pathAndQuery, hash] = href.split("#");
  const [path, query] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  params.set("pageSize", String(pageSize));
  return `${path}?${params}${hash ? `#${hash}` : ""}`;
}
