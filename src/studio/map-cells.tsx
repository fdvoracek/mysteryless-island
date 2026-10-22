import { useState } from "react";
import { formatHours, windowFor, type Cell } from "./map";

export interface GridArea { id: string; path: string; at?: Cell; travelHours?: number; isDefault?: boolean; camp?: boolean }
export interface MapEdit {
  /** Returns a refusal message, or nothing when the move was staged. */
  move: (id: string, cell: Cell) => string | undefined;
  open: (path: string) => void;
}
const CELL_W = 124, CELL_H = 88;
/** The one map cell grid: a cell picker (PR-07) or, with `edit`, the movable all-areas map (PR-09). */
export function MapGrid({ areas, current, pick, edit }: { areas: GridArea[]; current?: Cell; pick?: (cell: Cell) => void; edit?: MapEdit }) {
  const win = windowFor(areas.flatMap(a => a.at ? [a.at] : []));
  const [origin, setOrigin] = useState<Cell>();
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number }>();
  const x0 = origin?.x ?? win.minX, y0 = origin?.y ?? win.minY, { width, height } = win;
  const pan = <div className="row-actions">{[["←", -1, 0], ["→", 1, 0], ["↑", 0, -1], ["↓", 0, 1]].map(([label, dx, dy]) => <button type="button" aria-label={`Pan map ${label}`} key={label} onClick={() => setOrigin({ x: x0 + Number(dx), y: y0 + Number(dy) })}>{label}</button>)}</div>;
  const cells = Array.from({ length: height * width }, (_, index) => ({ x: x0 + index % width, y: y0 + Math.floor(index / width) }));
  const at = (cell: Cell) => areas.filter(a => a.at?.x === cell.x && a.at?.y === cell.y);
  if (!edit) return <>{pan}
    <div className="map-cells" style={{ gridTemplateColumns: `repeat(${width}, minmax(75px, 1fr))` }} aria-label="Map cell picker">{cells.map(cell => <button type="button" key={`${cell.x}:${cell.y}`} aria-label={`Map cell ${cell.x}, ${cell.y}`} aria-pressed={current?.x === cell.x && current?.y === cell.y} onClick={() => pick?.(cell)}><code>{cell.x}, {cell.y}</code>{at(cell).map(a => <span key={a.path}>{a.id} · {a.travelHours === 0 ? "camp" : `${a.travelHours} h`}</span>)}</button>)}</div></>;
  const centre = (cell: Cell) => ({ x: (cell.x - x0 + 0.5) * CELL_W, y: (cell.y - y0 + 0.5) * CELL_H });
  const camp = areas.find(a => a.camp && a.at);
  const clamp = (cell: Cell) => ({ x: Math.min(x0 + width - 1, Math.max(x0, cell.x)), y: Math.min(y0 + height - 1, Math.max(y0, cell.y)) });
  const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const onKey = (area: GridArea, event: React.KeyboardEvent) => {
    const delta = keys[event.key];
    if (delta && area.at) {
      event.preventDefault();
      const from = ghost?.id === area.id ? ghost : area.at;
      setGhost({ id: area.id, ...clamp({ x: from.x + delta[0], y: from.y + delta[1] }) });
    } else if (event.key === "Escape" && ghost) { event.preventDefault(); setGhost(undefined); }
    else if (event.key === "Enter" && ghost?.id === area.id) {
      event.preventDefault();
      const target = ghost; setGhost(undefined);
      if (target.x !== area.at?.x || target.y !== area.at?.y) edit.move(area.id, { x: target.x, y: target.y });
    }
  };
  return <>{pan}
    <p className="hint" id="map-keys">Drag an area to a cell, or focus it, press the arrow keys, then Enter to move it (Escape cancels). Click an area to open its workspace.</p>
    <div className="map-editor-grid" role="group" aria-label="Area map" style={{ width: width * CELL_W, height: height * CELL_H, gridTemplateColumns: `repeat(${width}, ${CELL_W}px)`, gridAutoRows: `${CELL_H}px` }}>
      {cells.map(cell => <div key={`${cell.x}:${cell.y}`} role="group" className="map-cell" aria-label={`Map cell ${cell.x}, ${cell.y}`} data-cell={`${cell.x},${cell.y}`}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); const moving = areas.find(a => a.id === id); if (moving && (moving.at?.x !== cell.x || moving.at?.y !== cell.y)) edit.move(id, cell); }}>
        <code>{cell.x}, {cell.y}</code>
        {at(cell).map(a => <button type="button" key={a.path} className={a.camp ? "map-area is-camp" : "map-area"} draggable aria-describedby="map-keys" aria-label={`Area ${a.id}`}
          onDragStart={event => { event.dataTransfer.setData("text/plain", a.id); event.dataTransfer.effectAllowed = "move"; }}
          onKeyDown={event => onKey(a, event)} onBlur={() => setGhost(g => g?.id === a.id ? undefined : g)} onClick={() => edit.open(a.path)}>
          {a.id}<small>{a.camp ? "camp" : formatHours(a.travelHours)}{a.isDefault ? " · default cell" : ""}</small></button>)}
        {ghost && ghost.x === cell.x && ghost.y === cell.y && <span className="map-ghost" role="status">Move {ghost.id} here — Enter to confirm, Escape to cancel</span>}
      </div>)}
      {camp?.at && <svg className="map-paths" width={width * CELL_W} height={height * CELL_H} aria-hidden="true">
        {areas.filter(a => a !== camp && a.at).map(a => { const from = centre(camp.at!), to = centre(a.at!); return <g key={a.id}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} /><text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2}>{formatHours(a.travelHours)}</text></g>; })}
      </svg>}
    </div></>;
}
