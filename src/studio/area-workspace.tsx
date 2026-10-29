import { useState, type ReactNode } from "react";
import { z } from "zod";
import { Region } from "../content";
import type { Document } from "./documents";
import { AuthorNote, SectionCard, OptionalChip, Field, type FieldProps } from "./form";
import { getAt, whereUsed, deletionReferences, referenceLabel } from "./references";
import { initialValue, unwrap, type Schema } from "./schema";
import { replaceAt } from "./rename";
import { MapGrid } from "./map-cells";
import { hintFor, humanize } from "./hints";
import { summarize } from "./summary";

export function AreaWorkspace(props: FieldProps & { open: (file: string, path: string) => void; newActivity: () => void }) {
  const raw = props.value as Record<string, unknown>;
  const shape = Region.shape;
  const [link, setLink] = useState("");
  const [blocked, setBlocked] = useState<{ file: string; path: string }[]>([]);
  const field = (schema: Schema, path: string, hideLabel = false) => <Field key={path} {...props} schema={schema} path={path} hideLabel={hideLabel} value={getAt(raw, path)} presentation={{ schema, path, hint: hintFor(Region, path) }} onChange={value => {
    if (value === undefined) {
      const next = replaceAt(raw, path, undefined) as Record<string, unknown>;
      // JSON serialization omits optional undefined fields, preserving all other raw keys.
      props.onChange(next);
    } else props.onChange(replaceAt(raw, path, value));
  }} />;
  const notes = Object.keys(raw).filter(key => key.startsWith("_") && typeof raw[key] === "string");
  const note = (key: string) => <AuthorNote key={key} name={key} value={raw[key] as string} change={value => props.onChange({ ...raw, [key]: value })} />;
  const before = (key: string) => notes.includes(`_${key}`) ? note(`_${key}`) : null;
  const fields = (keys: string[]) => keys.filter(key => raw[key] !== undefined || !shape[key as keyof typeof shape].isOptional()).map(key => <div className="field-with-note" key={key}>{before(key)}{field(shape[key as keyof typeof shape], key)}</div>);
  const properties = Object.keys(shape).filter(key => !["map", "unlockWhen", "hintWhen", "description", "firstVisit", "arrive", "explore", "activities"].includes(key));
  const inPath = (path: string, key: string) => path === key || path.startsWith(`${key}.`);
  const card = (title: string, keys: string[], children: ReactNode, preview = summarize(Region, raw, keys, props.documents)) => {
    const count = title === "Used by" ? 0 : props.problems.filter(problem => keys.some(key => inPath(problem.path, key)) && (title !== "Text and exploration" || !inPath(problem.path, "explore.landmarks"))).length;
    const optionalKeys = title === "Text and exploration" && explore ? [...keys.filter(key => key !== "explore"), ...Object.keys(exploreShape).filter(key => key !== "landmarks").map(key => `explore.${key}`)] : keys;
    const optional = optionalKeys.filter(path => getAt(raw, path) === undefined && (path.startsWith("explore.") ? exploreShape[path.slice(8)] : shape[path as keyof typeof shape])?.isOptional());
    return <SectionCard name="Region" title={title} preview={preview} count={count}><section>{children}{optional.length > 0 && <div className="optional-fields"><span>Optional:</span>{optional.map(path => {
      const schema = path.startsWith("explore.") ? exploreShape[path.slice(8)] : shape[path as keyof typeof shape];
      const key = path.split(".").at(-1)!;
      const chip = <OptionalChip key={path} name={key} label={hintFor(Region, path)?.label ?? humanize(key)} add={() => props.onChange(replaceAt(raw, path, initialValue(schema)))} />;
      return !path.includes(".") && notes.includes(`_${key}`) ? <span className="optional-with-note" key={path}>{before(key)}{chip}</span> : chip;
    })}</div>}</section></SectionCard>;
  };
  const explore = raw.explore as { landmarks?: unknown[] } | undefined;
  const exploreShape = (unwrap(shape.explore) as z.AnyZodObject).shape;
  const landmarks = Array.isArray(explore?.landmarks) ? explore.landmarks : [];
  const landmarkSchema = (exploreShape.landmarks as z.ZodArray<Schema>).element;
  const links = Array.isArray(raw.activities) ? raw.activities as string[] : [];
  const activities = props.documents.filter(d => d.kind === "activities");
  const updateLinks = (next: string[]) => props.onChange({ ...raw, activities: next });
  const used = (path: string, title: string) => <section aria-label={`Used by ${title}`}><h3>{title}</h3>{whereUsed(props.documents, props.owner, path).map(ref => <button type="button" key={`${ref.file}:${ref.path}`} onClick={() => props.open(ref.file, ref.path)}>{ref.file} › {ref.path}</button>)}</section>;
  return <section className="area-workspace" aria-label="Area workspace">
    {card("Properties", properties, <>
      {notes.filter(key => !(key.slice(1) in shape)).map(note)}{fields(properties)}
      {Object.keys(raw).filter(key => !(key in shape) && !notes.includes(key)).map(key => <details key={key}><summary>{key}</summary><pre>{JSON.stringify(raw[key], null, 2)}</pre></details>)}
    </>)}
    {card("Map and unlock", ["map", "unlockWhen", "hintWhen"], <><MapCells documents={props.documents} owner={props.owner} choose={map => props.onChange({ ...raw, map })} />{fields(["map", "unlockWhen", "hintWhen"])}</>)}
    {card("Text and exploration", ["description", "firstVisit", "arrive", "explore"], <>{fields(["description", "firstVisit", "arrive"])}
      {explore && <>{before("explore")}{Object.keys(exploreShape).filter(key => key !== "landmarks" && (getAt(raw, `explore.${key}`) !== undefined || !exploreShape[key].isOptional())).map(key => field(exploreShape[key], `explore.${key}`))}</>}
    </>)}
    {explore && card("Landmarks", ["explore.landmarks"], <>{landmarks.map((landmark, index) => {
      const path = `explore.landmarks.${index}`, id = (landmark as { id?: string })?.id ?? String(index);
      const remove = () => {
        const refs = deletionReferences(props.documents, props.owner, path);
        setBlocked(refs); if (!refs.length) props.onChange(replaceAt(raw, "explore.landmarks", landmarks.filter((_, i) => i !== index)));
      };
      return <section data-field={path} tabIndex={-1} className="workspace-object-entry" key={index} aria-label={`Landmark ${id}`}><h3>{id || "New landmark"}</h3>{field(landmarkSchema, path, true)}
        <div className="entry-actions"><button type="button" aria-label={`Remove landmark ${id}`} onClick={remove}>×</button>{[-1, 1].map(delta => <button type="button" key={delta} disabled={index + delta < 0 || index + delta >= landmarks.length} aria-label={`Move ${delta < 0 ? "up" : "down"} landmark ${id}`} onClick={() => { const next = [...landmarks]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; props.onChange(replaceAt(raw, "explore.landmarks", next)); }}>{delta < 0 ? "↑" : "↓"}</button>)}</div>
      </section>;
    })}
      <button className="add-link" type="button" aria-label="Add landmark" onClick={() => props.onChange(replaceAt(raw, "explore.landmarks", [...landmarks, initialValue(landmarkSchema)]))}>+ add landmark</button>
      {!!blocked.length && <div role="alert" className="error">Removal blocked: this landmark is referenced.{blocked.map(ref => <button type="button" key={`${ref.file}:${ref.path}`} onClick={() => props.open(ref.file, ref.path)}>{ref.file} › {ref.path}</button>)}</div>}
    </>, `landmarks: ${landmarks.length}`)}
    {card("Linked activities", ["activities"], <>{before("activities")}{links.map((id, index) => <div className="linked-activity" key={`${id}:${index}`}><button type="button" onClick={() => { const activity = activities.find(d => d.id === id); if (activity) props.open(activity.path, ""); }}>{referenceLabel("activity", id, props.documents)}</button><div className="entry-actions">{[-1, 1].map(delta => <button type="button" key={delta} aria-label={`Move ${delta < 0 ? "up" : "down"} activity ${id}`} disabled={index + delta < 0 || index + delta >= links.length} onClick={() => { const next = [...links]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; updateLinks(next); }}>{delta < 0 ? "↑" : "↓"}</button>)}<button type="button" aria-label={`Unlink ${id}`} onClick={() => updateLinks(links.filter((_, i) => i !== index))}>×</button></div></div>)}
      <div className="row-actions"><select aria-label="Existing activity" value={link} onChange={e => setLink(e.target.value)}><option value="">Choose an activity…</option>{activities.filter(d => !links.includes(d.id)).map(d => <option value={d.id} key={d.id}>{referenceLabel("activity", d.id, props.documents)}</option>)}</select><button type="button" disabled={!link || links.includes(link)} onClick={() => { updateLinks([...links, link]); setLink(""); }}>Link existing</button><button type="button" onClick={props.newActivity}>New activity in this area</button></div>
      <h3>Global activities offered here</h3><ul>{activities.filter(d => (d.raw as { global?: boolean })?.global).map(d => <li key={d.path}>{d.id}{links.includes(d.id) ? " (at linked position)" : " (after linked activities)"}</li>)}</ul>
    </>, `activities: ${links.length}`)}
    {card("Used by", [], <div className="used-by">{used("id", `Area ${props.owner.id}`)}{landmarks.map((entry, index) => <div key={index}>{used(`explore.landmarks.${index}.id`, `Landmark ${(entry as { id?: string })?.id ?? index}`)}</div>)}</div>, `references: ${whereUsed(props.documents, props.owner, "id").length + landmarks.reduce<number>((count, _, index) => count + whereUsed(props.documents, props.owner, `explore.landmarks.${index}.id`).length, 0)}`)}
  </section>;
}
function MapCells({ documents, owner, choose }: { documents: Document[]; owner: Document; choose: (map: { x: number; y: number }) => void }) {
  const areas = documents.filter(d => d.kind === "regions").map(d => {
    const area = (d.raw ?? {}) as { map?: { x: number; y: number }; travelHours?: number };
    return { id: d.id, path: d.path, at: area.map && Number.isInteger(area.map.x) && Number.isInteger(area.map.y) ? area.map : undefined, travelHours: area.travelHours };
  });
  const current = (owner.raw as { map?: { x: number; y: number } }).map;
  const occupied = areas.filter(d => d.path !== owner.path && current && d.at?.x === current.x && d.at?.y === current.y);
  return <><p className="hint">Travel from camp: {String((owner.raw as { travelHours?: number }).travelHours ?? "unset")} h. Camp = travelHours 0. Areas without map cells use the game’s default placement.</p>
    <MapGrid areas={areas} current={current} pick={choose} />
    {occupied.length > 0 && <p role="alert" className="warning">Occupied cell: {occupied.map(d => d.id).join(", ")}</p>}</>;
}
