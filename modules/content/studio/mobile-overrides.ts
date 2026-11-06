export type MobileOverride = { path: string[]; value: unknown };

export function desktopPayload(payload: Record<string, unknown>) {
  const result = { ...payload };
  delete result.mobileOverrides;
  return result;
}

export function resolveMobilePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(desktopPayload(payload));
  for (const override of (payload.mobileOverrides || []) as MobileOverride[]) {
    let node: unknown = result;
    for (const part of override.path.slice(0, -1)) {
      node = Array.isArray(node) ? node.find(row => row.id === part) : node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
    }
    const key = override.path.at(-1)!;
    if (override.path.some(part => ["__proto__", "prototype", "constructor", "mobileOverrides"].includes(part))) continue;
    // Deleted desktop rows must never transfer an override to a different row.
    if (node && !Array.isArray(node) && typeof node === "object") (node as Record<string, unknown>)[key] = structuredClone(override.value);
  }
  return result;
}

export function mobileOverrides(base: Record<string, unknown>, next: Record<string, unknown>): MobileOverride[] {
  const changes: MobileOverride[] = [];
  function visit(before: unknown, after: unknown, path: string[]) {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (Array.isArray(before) && Array.isArray(after) && JSON.stringify(before.map(row => row.id)) === JSON.stringify(after.map(row => row.id))) {
      after.forEach((row, index) => visit(before[index], row, [...path, row.id]));
    } else if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === "object" && typeof after === "object") {
      const previous = before as Record<string, unknown>;
      const current = after as Record<string, unknown>;
      const imageKey = "imageUrl" in current ? "imageUrl" : "url" in current && "alt" in current ? "url" : null;
      const photoKeys = imageKey ? [imageKey, "imagePositionX", "imagePositionY", "imageZoom", "imageSource", "useServiceFraming"].filter(key => key in current) : [];
      const photoChanged = photoKeys.some(key => JSON.stringify(previous[key]) !== JSON.stringify(current[key]));
      for (const [key, value] of Object.entries(current)) {
        if (key === "mobileOverrides") continue;
        if (photoChanged && photoKeys.includes(key)) changes.push({ path: [...path, key], value });
        else visit(previous[key], value, [...path, key]);
      }
    } else changes.push({ path, value: after });
  }
  visit(desktopPayload(base), desktopPayload(next), []);
  return changes;
}

export function updateMobileOverrides(payload: Record<string, unknown>, next: Record<string, unknown>): MobileOverride[] {
  let overrides = [...(payload.mobileOverrides || []) as MobileOverride[]];
  for (const change of mobileOverrides(resolveMobilePayload(payload), next)) {
    overrides = overrides.filter(existing => !change.path.every((part, index) => existing.path[index] === part));
    overrides.push(change);
  }
  return overrides;
}
