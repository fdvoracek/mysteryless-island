import { useState } from "react";
import { z } from "zod";
import { Region } from "../content";
import type { Document } from "./documents";
import { Field, type FieldProps } from "./form";
import { getAt, whereUsed, deletionReferences, referenceLabel } from "./references";
import { initialValue, unwrap, type Schema } from "./schema";
import { replaceAt } from "./rename";

export function AreaWorkspace(props: FieldProps & { open: (file: string, path: string) => void; newActivity: () => void }) {
  const raw = props.value as Record<string, unknown>;
  const shape = Region.shape;
  const [link, setLink] = useState("");
  const [blocked, setBlocked] = useState<{ file: string; path: string }[]>([]);
  const field = (schema: Schema, path: string) => <Field key={path} {...props} schema={schema} path={path} value={getAt(raw, path)} onChange={value => {
    if (value === undefined) {
      const next = replaceAt(raw, path, undefined) as Record<string, unknown>;
      // JSON serialization omits optional undefined fields, preserving all other raw keys.
      props.onChange(next);
    } else props.onChange(replaceAt(raw, path, value));
  }} />;
  const fields = (keys: string[]) => keys.map(key => field(shape[key as keyof typeof shape], key));
  const explore = raw.explore as { landmarks?: unknown[] } | undefined;
  const exploreShape = (unwrap(shape.explore) as z.AnyZodObject).shape;
  const landmarks = Array.isArray(explore?.landmarks) ? explore.landmarks : [];
  const landmarkSchema = (exploreShape.landmarks as z.ZodArray<Schema>).element;
  const links = Array.isArray(raw.activities) ? raw.activities as string[] : [];
  const activities = props.documents.filter(d => d.kind === "activities");
  const updateLinks = (next: string[]) => props.onChange({ ...raw, activities: next });
  const used = (path: string, title: string) => <section aria-label={`Used by ${title}`}><h3>{title}</h3>{whereUsed(props.documents, props.owner, path).map(ref => <button type="button" key={`${ref.file}:${ref.path}`} onClick={() => props.open(ref.file, ref.path)}>{ref.file} › {ref.path}</button>)}</section>;
  return <div className="area-workspace" aria-label="Area workspace">
    <section className="workspace-card"><h2>Properties</h2>{fields(Object.keys(shape).filter(key => !["map", "unlockWhen", "hintWhen", "description", "firstVisit", "arrive", "explore", "activities"].includes(key)))}
      {Object.keys(raw).filter(key => !(key in shape)).map(key => <details key={key}><summary>{key}</summary><pre>{JSON.stringify(raw[key], null, 2)}</pre></details>)}
    </section>
    <section className="workspace-card"><h2>Map and unlock</h2><MapCells documents={props.documents} owner={props.owner} choose={map => props.onChange({ ...raw, map })} />{fields(["map", "unlockWhen", "hintWhen"])}</section>
    <section className="workspace-card"><h2>Text and exploration</h2>{fields(["description", "firstVisit", "arrive"])}
      {explore ? Object.keys(exploreShape).filter(key => key !== "landmarks").map(key => field(exploreShape[key], `explore.${key}`)) : field(shape.explore, "explore")}
    </section>
    {explore && <section className="workspace-card"><h2>Landmarks</h2>{landmarks.map((landmark, index) => {
      const path = `explore.landmarks.${index}`, id = (landmark as { id?: string })?.id ?? String(index);
      const remove = () => {
        const refs = deletionReferences(props.documents, props.owner, path);
        setBlocked(refs); if (!refs.length) props.onChange(replaceAt(raw, "explore.landmarks", landmarks.filter((_, i) => i !== index)));
      };
      return <section className="landmark-entry" key={index} aria-label={`Landmark ${id}`}><h3>{id || "New landmark"}</h3>{field(landmarkSchema, path)}
        <div className="row-actions"><button type="button" onClick={remove}>Remove landmark {id}</button>{[-1, 1].map(delta => <button type="button" key={delta} disabled={index + delta < 0 || index + delta >= landmarks.length} aria-label={`Move ${delta < 0 ? "up" : "down"} landmark ${id}`} onClick={() => { const next = [...landmarks]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; props.onChange(replaceAt(raw, "explore.landmarks", next)); }}>{delta < 0 ? "↑" : "↓"}</button>)}</div>
      </section>;
    })}
      <button type="button" onClick={() => props.onChange(replaceAt(raw, "explore.landmarks", [...landmarks, initialValue(landmarkSchema)]))}>Add landmark</button>
      {!!blocked.length && <div role="alert" className="error">Removal blocked: this landmark is referenced.{blocked.map(ref => <button type="button" key={`${ref.file}:${ref.path}`} onClick={() => props.open(ref.file, ref.path)}>{ref.file} › {ref.path}</button>)}</div>}
    </section>}
    <section className="workspace-card"><h2>Linked activities</h2>{links.map((id, index) => <div className="linked-activity" key={`${id}:${index}`}><button type="button" onClick={() => { const activity = activities.find(d => d.id === id); if (activity) props.open(activity.path, ""); }}>{referenceLabel("activity", id, props.documents)}</button><button type="button" onClick={() => updateLinks(links.filter((_, i) => i !== index))}>Unlink {id}</button>{[-1, 1].map(delta => <button type="button" key={delta} aria-label={`Move ${delta < 0 ? "up" : "down"} activity ${id}`} disabled={index + delta < 0 || index + delta >= links.length} onClick={() => { const next = [...links]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; updateLinks(next); }}>{delta < 0 ? "↑" : "↓"}</button>)}</div>)}
      <div className="row-actions"><select aria-label="Existing activity" value={link} onChange={e => setLink(e.target.value)}><option value="">Choose an activity…</option>{activities.filter(d => !links.includes(d.id)).map(d => <option value={d.id} key={d.id}>{referenceLabel("activity", d.id, props.documents)}</option>)}</select><button type="button" disabled={!link || links.includes(link)} onClick={() => { updateLinks([...links, link]); setLink(""); }}>Link existing</button><button type="button" onClick={props.newActivity}>New activity in this area</button></div>
      <h3>Global activities offered here</h3><ul>{activities.filter(d => (d.raw as { global?: boolean })?.global).map(d => <li key={d.path}>{d.id}{links.includes(d.id) ? " (at linked position)" : " (after linked activities)"}</li>)}</ul>
    </section>
    <section className="workspace-card used-by"><h2>Used by</h2>{used("id", `Area ${props.owner.id}`)}{landmarks.map((entry, index) => <div key={index}>{used(`explore.landmarks.${index}.id`, `Landmark ${(entry as { id?: string })?.id ?? index}`)}</div>)}</section>
  </div>;
}
function MapCells({ documents, owner, choose }: { documents: Document[]; owner: Document; choose: (map: { x: number; y: number }) => void }) {
  const areas = documents.filter(d => d.kind === "regions").map(d => ({ ...d, area: (d.raw ?? {}) as { map?: { x: number; y: number }; travelHours?: number } }));
  const current = (owner.raw as { map?: { x: number; y: number } }).map;
  const points = areas.flatMap(d => d.area.map && Number.isInteger(d.area.map.x) && Number.isInteger(d.area.map.y) ? [d.area.map] : []);
  const minX = Math.min(-1, ...points.map(p => p.x)) - 1, maxX = Math.max(1, ...points.map(p => p.x)) + 1;
  const minY = Math.min(-1, ...points.map(p => p.y)) - 1, maxY = Math.max(1, ...points.map(p => p.y)) + 1;
  const [origin, setOrigin] = useState<{ x: number; y: number }>();
  const x0 = origin?.x ?? minX, y0 = origin?.y ?? minY;
  const width = Math.min(9, maxX - minX + 1), height = Math.min(9, maxY - minY + 1);
  const occupied = areas.filter(d => d.path !== owner.path && current && d.area.map?.x === current.x && d.area.map?.y === current.y);
  return <><p className="hint">Travel from camp: {String((owner.raw as { travelHours?: number }).travelHours ?? "unset")} h. Camp = travelHours 0. Areas without map cells use the game’s default placement.</p>
    <div className="row-actions">{[["←", -1, 0], ["→", 1, 0], ["↑", 0, -1], ["↓", 0, 1]].map(([label, dx, dy]) => <button type="button" aria-label={`Pan map ${label}`} key={label} onClick={() => setOrigin({ x: x0 + Number(dx), y: y0 + Number(dy) })}>{label}</button>)}</div>
    <div className="map-cells" style={{ gridTemplateColumns: `repeat(${width}, minmax(75px, 1fr))` }} aria-label="Map cell picker">{Array.from({ length: height * width }, (_, index) => {
      const x = x0 + index % width, y = y0 + Math.floor(index / width);
      const at = areas.filter(d => d.area.map?.x === x && d.area.map?.y === y);
      return <button type="button" key={`${x}:${y}`} aria-label={`Map cell ${x}, ${y}`} aria-pressed={current?.x === x && current?.y === y} onClick={() => choose({ x, y })}><code>{x}, {y}</code>{at.map(d => <span key={d.path}>{d.id} · {d.area.travelHours === 0 ? "camp" : `${d.area.travelHours} h`}</span>)}</button>;
    })}</div>{occupied.length > 0 && <p role="alert" className="warning">Occupied cell: {occupied.map(d => d.id).join(", ")}</p>}</>;
}
