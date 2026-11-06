export function normalizeMediaFolder(value = "") {
  return value.split("/").map(part => part.trim()).filter(Boolean).join("/");
}

export function validMediaFolderPath(value: string) {
  return value.length <= 200 && !/[\\\u0000-\u001f\u007f]/.test(value) &&
    value.split("/").every(part => part.trim() !== "." && part.trim() !== "..");
}

export function childMediaFolders(folders: { name: string; count: number }[], parent: string) {
  const prefix = parent ? `${parent}/` : "";
  const children = new Map<string, { name: string; label: string; count: number }>();
  for (const folder of folders) {
    if (!folder.name.startsWith(prefix) || folder.name === parent) continue;
    const label = folder.name.slice(prefix.length).split("/")[0];
    if (!label) continue;
    const name = `${prefix}${label}`;
    const child = children.get(name) || { name, label, count: 0 };
    child.count += folder.count;
    children.set(name, child);
  }
  return [...children.values()].sort((a, b) => a.label.localeCompare(b.label));
}
