import { useMemo, useState } from "react";
import type { Document } from "./documents";
import { GraphView } from "./graph";
import { continuation, deriveStory, filterStory, type GraphNode } from "./story";
import { flagUsedBy } from "./references";
export function StoryView({ documents, open, create }: { documents: Document[]; open: (file: string, path: string) => void; create: (kind: string, prefill: Record<string, unknown>) => void }) {
  const story = useMemo(() => deriveStory(documents), [documents]);
  const [area, setArea] = useState(""), [kinds, setKinds] = useState(["discovery", "quest", "event", "region", "flag"]), [selected, setSelected] = useState<string>();
  const graph = useMemo(() => filterStory(story, area, kinds), [story, area, kinds]);
  const current = graph.nodes.find(n => n.id === selected);
  const activate = (node: GraphNode) => { if (node.file) open(node.file, node.path ?? ""); else setSelected(node.id); };
  return <section className="story-workspace" aria-label="Story workspace"><h1>Story</h1><p>Derived from existing conditions and effects. Open a node to edit its entity; select a landmark or task below to continue its story.</p>
    <div className="row-actions"><label>Area filter<select aria-label="Story area filter" value={area} onChange={e => setArea(e.target.value)}><option value="">All areas</option>{documents.filter(d => d.kind === "regions").map(d => <option key={d.id}>{d.id}</option>)}</select></label>{["discovery", "quest", "event", "region", "flag"].map(kind => <label key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={e => setKinds(e.target.checked ? [...kinds, kind] : kinds.filter(k => k !== kind))} />{kind}</label>)}</div>
    <GraphView graph={graph} node={activate} inspect={n => setSelected(n.id)} title="Story graph" />
    <aside className="workspace-card" aria-label="Continue the story"><h2>Continue the story</h2><label>Story node<select aria-label="Story node" value={current?.id ?? ""} onChange={e => setSelected(e.target.value)}><option value="">Choose a node…</option>{graph.nodes.map(n => <option value={n.id} key={n.id}>{n.kind}: {n.label}</option>)}</select></label>
      {current && <><h3>{current.label}</h3>{current.note && <p>{current.note}</p>}{current.file && <button type="button" onClick={() => activate(current)}>Open entity</button>}{["discovery", "quest"].includes(current.kind) && <div className="row-actions">{[["quests", "New task when this happens"], ["events", "New event when this happens"], ["regions", "New area unlocked by this"]].map(([kind, label]) => <button type="button" key={kind} onClick={() => create(kind, continuation(current, kind))}>{label}</button>)}</div>}{current.kind === "flag" && <section aria-label="Flag used by"><h3>Used by</h3>{flagUsedBy(documents, current.label).map(ref => <button type="button" key={`${ref.file}:${ref.path}`} onClick={() => open(ref.file, ref.path)}>{ref.file} › {ref.path}</button>)}</section>}</>}
    </aside>
    {!!story.warnings.length && <section aria-label="Story warnings"><h2>Warnings (do not block saving)</h2>{story.warnings.map(w => <p className="warning" key={`${w.file}:${w.path}`}><button type="button" onClick={() => open(w.file, w.path)}>{w.file} › {w.path}</button> {w.message}</p>)}</section>}
  </section>;
}
