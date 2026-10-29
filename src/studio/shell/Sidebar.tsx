import { kindLabels, type Document } from "../documents";

export function Sidebar({ documents, scope, browse, openArea, newArea }: {
  documents: Document[]; scope: string; browse: (scope: string) => void;
  openArea: (area: Document) => void; newArea: () => void;
}) {
  const count = (kind: string) => documents.filter(document => document.kind === kind).length;
  const row = (value: string, label: string, total?: number) => <button key={value}
    aria-current={scope === value ? "page" : undefined} onClick={() => browse(value)}>
    {label}{total !== undefined && <span>{total}</span>}</button>;
  return <nav className="studio-nav" aria-label="Content navigation">
    <h2>World</h2>
    {row("map", "Map")}{row("story", "Story")}{row("trees", "Trees")}
    <h2>Areas</h2>
    {documents.filter(document => document.kind === "regions").map(area => {
      const hours = (area.raw as { travelHours?: number } | undefined)?.travelHours;
      return <button key={area.path} aria-label={area.label}
        aria-current={scope === `area:${area.id}` ? "page" : undefined} onClick={() => openArea(area)}>
        {area.label}<span>{hours === 0 ? "camp" : hours === undefined ? "" : `${hours} h`}</span>
      </button>;
    })}
    <button onClick={newArea}>+ New area</button>
    <h2>Library</h2>
    {row("all", "All files", documents.length)}
    {Object.keys(kindLabels).filter(kind => kind !== "settings")
      .map(kind => row(kind, kindLabels[kind], count(kind)))}
    <h2>Settings</h2>
    {row("settings", kindLabels.settings, count("settings"))}
  </nav>;
}
