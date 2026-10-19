// Preview paths use array positions; inspector IDs use stable row IDs.
export function contentFieldId(blockId: string, payload: Record<string, unknown>, path: unknown, editableFields: string[]) {
  if (typeof path !== "string" || path.length > 240) return null;
  const parts = path.split(".");
  if (!editableFields.includes(parts[0]) || parts.some(part => !/^[\w-]+$/.test(part) || ["__proto__", "constructor", "prototype"].includes(part))) return null;
  let value: unknown = payload;
  const ids = [blockId];
  for (const part of parts) {
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(part)) return null;
      const row = value[Number(part)];
      if (!row || typeof row.id !== "string") return null;
      ids.push(row.id);
      value = row;
    } else {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return null;
      ids.push(part);
      value = (value as Record<string, unknown>)[part];
    }
  }
  return typeof value === "string" || typeof value === "boolean" ? ids.join("-") : null;
}

export function focusContentFieldWhenReady(inspector: HTMLElement, id: string) {
  const focus = () => {
    const document = inspector.ownerDocument;
    const field = document.getElementById(id) || document.getElementById(`${id}-field`)?.querySelector<HTMLElement>("button");
    if (!field || !inspector.contains(field)) return false;
    observer.disconnect();
    for (let node = field.parentElement; node && node !== inspector; node = node.parentElement) {
      if (node.tagName === "DETAILS") (node as HTMLDetailsElement).open = true;
    }
    field.focus({ preventScroll: true });
    if (field.matches('input[type="text"], textarea')) (field as HTMLInputElement | HTMLTextAreaElement).select();
    field.scrollIntoView({ block: "center", inline: "nearest" });
    return true;
  };
  // Puck mounts its fields after the section selection reaches the workspace.
  const observer = new MutationObserver(focus);
  if (!focus()) observer.observe(inspector, { childList: true, subtree: true });
  return () => observer.disconnect();
}
