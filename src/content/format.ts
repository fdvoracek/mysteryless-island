/** Canonical JSON layout shared by authoring tools and content validation. */
export function formatContent(value: unknown): string {
  const compact = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(compact).join(", ")}]`;
    if (v !== null && typeof v === "object") {
      const entries = Object.entries(v).map(([key, child]) => `${JSON.stringify(key)}: ${compact(child)}`);
      return entries.length ? `{ ${entries.join(", ")} }` : "{}";
    }
    const json = JSON.stringify(v);
    if (json === undefined) throw new TypeError("Content must be a JSON value");
    return json;
  };
  const print = (v: unknown, depth: number, column: number): string => {
    const line = compact(v);
    if (column + line.length <= 110 || v === null || typeof v !== "object" || !Object.keys(v).length) return line;
    const indent = "  ".repeat(depth + 1);
    const children = Array.isArray(v)
      ? v.map((child) => indent + print(child, depth + 1, indent.length))
      : Object.entries(v).map(([key, child]) => {
        const prefix = `${indent}${JSON.stringify(key)}: `;
        return prefix + print(child, depth + 1, prefix.length);
      });
    const [open, close] = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
    return `${open}\n${children.join(",\n")}\n${"  ".repeat(depth)}${close}`;
  };
  return print(value, 0, 0) + "\n";
}

export function isFormattedContent(source: string): boolean {
  return source === formatContent(JSON.parse(source));
}
