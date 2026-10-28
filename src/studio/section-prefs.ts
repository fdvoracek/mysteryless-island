type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const browserStorage = (): Storage | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };
const key = (name: string) => `studio.sections:${name}`;

export function readSections(name: string, storage: Storage | undefined = browserStorage()): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key(name)) ?? "[]");
    return Array.isArray(value) && value.every(title => typeof title === "string") ? value : [];
  } catch { return []; }
}
export function rememberSection(name: string, title: string, collapsed: boolean, storage: Storage | undefined = browserStorage()) {
  try {
    const titles = readSections(name, storage).filter(value => value !== title);
    if (collapsed) titles.push(title);
    storage?.setItem(key(name), JSON.stringify(titles));
  } catch { /* remembering is optional */ }
}
