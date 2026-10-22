import { useMemo, useState } from "react";
import type { ContentProblem } from "../content";
import type { Document } from "./documents";
import { mapAreas, moveArea, overlaps, formatHours, type Cell } from "./map";
import { MapGrid } from "./map-cells";
import { replaceAt } from "./rename";

/** All areas on the route map. Only `region.map` and `travelHours` are written; routes are always camp-centred. */
export function MapEditor({ documents, problems, edit, open }: { documents: Document[]; problems: ContentProblem[]; edit: (path: string, raw: unknown) => void; open: (path: string) => void }) {
  const areas = useMemo(() => mapAreas(documents), [documents]);
  const grid = useMemo(() => areas.map(a => ({ id: a.id, path: a.path, at: a.placed, travelHours: a.travelHours, isDefault: a.isDefault, camp: a.camp })), [areas]);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const stepMinutes = (documents.find(d => d.path === "content/game.json")?.raw as { stepMinutes?: number } | undefined)?.stepMinutes;
  const step = stepMinutes && stepMinutes > 0 ? stepMinutes / 60 : "any";
  const move = (id: string, cell: Cell) => {
    try {
      const moved = moveArea(documents, id, cell);
      edit(moved.path, moved.raw);
      setMessage({ error: false, text: `Moved ${id} to cell ${cell.x}, ${cell.y} (staged).` });
      return undefined;
    } catch (failure) { const text = (failure as Error).message; setMessage({ error: true, text }); return text; }
  };
  const setHours = (path: string, value: string) => {
    const doc = documents.find(d => d.path === path), hours = Number(value);
    if (doc?.raw && value !== "" && Number.isFinite(hours)) edit(path, replaceAt(doc.raw, "travelHours", hours));
  };
  const camp = areas.find(a => a.camp);
  return <section className="map-workspace" aria-label="Map editor"><h1>Map</h1>
    <p>Every area at its map cell; areas without one sit at the game’s default cell (their place in area order, row 0). Moving an area writes its <code>map</code> explicitly. The game draws a path from the camp to each area, labelled with its travel time. Locked and hinted states are not shown.</p>
    {overlaps(grid).map(o => <p role="alert" className="warning" key={`${o.cell.x},${o.cell.y}`}>Occupied cell: {o.ids.join(", ")} share {o.cell.x}, {o.cell.y}.</p>)}
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "error" : "hint"}>{message.text}</p>}
    <div className="map-editor-layout">
      <div><MapGrid areas={grid} edit={{ move, open }} /></div>
      <aside className="workspace-card" aria-label="Area travel times"><h2>Areas</h2>
        <ul className="map-area-list">{areas.map(a => <li key={a.id}>
          <button type="button" onClick={() => open(a.path)}>Open workspace: {a.id}</button>
          <label>travelHours of {a.id}<input type="number" min={0} step={step} aria-label={`travelHours ${a.id}`} value={a.travelHours ?? ""} onChange={event => setHours(a.path, event.target.value)} /></label>
          <small>cell {a.placed.x}, {a.placed.y}{a.isDefault ? " (default)" : ""}</small>
          {problems.filter(p => p.file === a.path && p.path.startsWith("travelHours")).map((p, i) => <p className="error" role="alert" key={i}>{p.message}</p>)}
        </li>)}</ul>
        <section aria-label="Paths from camp"><h3>Paths from camp</h3>{camp ? <ul>{areas.filter(a => a !== camp).map(a => <li key={a.id}>{camp.id} → {a.id}: {formatHours(a.travelHours)}</li>)}</ul> : <p className="warning">No area has travelHours 0, so there is no camp.</p>}</section>
      </aside>
    </div></section>;
}
