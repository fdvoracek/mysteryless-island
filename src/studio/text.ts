/** The only field-name classification: prose channel, not widget selection. */
export const textChannels: { kind?: string; path: RegExp; channel: "modal" | "journal" }[] = [
  { kind: "events", path: /^scenes\.[^.]+\.text$/, channel: "modal" },
  { kind: "events", path: /^scenes\.[^.]+\.journal$/, channel: "journal" },
  { kind: "regions", path: /^explore\.landmarks\.\d+\.text$/, channel: "modal" },
  { kind: "regions", path: /^explore\.landmarks\.\d+\.journal$/, channel: "journal" },
  { kind: "regions", path: /^explore\.(view\.\d+\.text|nothingLeft)$/, channel: "modal" },
  { kind: "regions", path: /^(description|firstVisit\.log|arrive\.\d+\.text)$/, channel: "journal" },
  { path: /(^|\.)(log|\w*Log)$/, channel: "journal" },
  { path: /(^|\.)(outcomes|roll)\.\d+\.text$/, channel: "journal" },
  { path: /(^|\.)(thoughts|afterwards)\.\d+\.(intro|otherwise|lines\.\d+\.text)$/, channel: "journal" },
  { kind: "settings", path: /^(journal\.[^.]+|start\.log|sleep\.(newDay|midnight|exhausted|recovery\.[^.]+\.text))$/, channel: "journal" },
  { kind: "settings", path: /^(newPlace\.text|ending\.(survived|cause)|provisions\.(hunger|thirst|both|preparation\.text)|sleep\.collapse\.text)$/, channel: "modal" },
];
export function textChannel(kind: string, path: string): "modal" | "journal" | "text" {
  return textChannels.find(rule => (!rule.kind || rule.kind === kind) && rule.path.test(path))?.channel ?? "text";
}
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]))].sort();
}
export function placeholderMismatch(variants: string[]): boolean {
  return new Set(variants.map(text => JSON.stringify(placeholders(text)))).size > 1;
}
