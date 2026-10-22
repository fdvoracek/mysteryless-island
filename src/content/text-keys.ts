/** Stable paths for legacy inline variants; explicit IDs can survive moves between entities. */
export function indexTextKeys(roots: Record<string, unknown>, onDuplicate?: (value: object, id: string) => never): Map<object, string> {
  const keys = new Map<object, string>();
  const explicit = new Set<string>();
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === "string")) keys.set(value, path);
      else value.forEach((v, i) => visit(v, `${path}.${v && typeof v === "object" && "id" in v ? v.id : i}`));
    } else {
      const v = value as Record<string, unknown>;
      if (typeof v.id === "string" && Array.isArray(v.variants)) {
        if (explicit.has(v.id)) {
          if (onDuplicate) onDuplicate(value, v.id);
          throw new Error(`duplicate text id "${v.id}"`);
        }
        explicit.add(v.id);
        keys.set(value, `text:${v.id}`);
      } else for (const [key, child] of Object.entries(v)) visit(child, `${path}.${key}`);
    }
  };
  for (const [key, value] of Object.entries(roots)) visit(value, key);
  return keys;
}
