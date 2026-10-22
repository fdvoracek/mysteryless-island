import { useCallback, useEffect, useMemo, useState } from "react";
import type { Document } from "./documents";
import { StoryGraphView } from "./story-graph";
import { continuation, deriveStory, filterEdges, filterStory, type GraphNode } from "./story";
import { neighbourhood, searchNodes, type StoryOptions } from "./story-layout";
import { readPrefs, writePrefs, type Viewport } from "./story-prefs";
import { flagUsedBy } from "./references";
import type { StudioStore } from "./store";
const KINDS = ["discovery", "quest", "event", "region", "flag"];
export function StoryView({ store, documents, open, create }: { store: StudioStore; documents: Document[]; open: (file: string, path: string) => void; create: (kind: string, prefill: Record<string, unknown>) => void }) {
  const story = useMemo(() => deriveStory(documents), [documents]);
  const [area, setArea] = useState(""), [kinds, setKinds] = useState(KINDS), [selected, setSelected] = useState<string>();
  const [prefs, setPrefs] = useState(() => readPrefs());
  const [focusId, setFocusId] = useState<string>(), [query, setQuery] = useState(""), [arranged, setArranged] = useState(0);
  const [centre, setCentre] = useState<{ id: string; seq: number }>(), [confirmReset, setConfirmReset] = useState(false);
  const { options } = prefs;
  const setOptions = (change: Partial<StoryOptions>) => setPrefs(p => { const next = { ...p, options: { ...p.options, ...change } }; writePrefs(next); return next; });
  const moved = useCallback((viewport: Viewport) => setPrefs(p => { const next = { ...p, viewport }; writePrefs(next); return next; }), []);
  const layoutOptions = useMemo(() => ({ direction: options.direction, spacing: options.spacing, group: options.group }), [options.direction, options.spacing, options.group]);
  const graph = useMemo(() => filterEdges(filterStory(story, area, kinds), options.allReferences), [story, area, kinds, options.allReferences]);
  const current = graph.nodes.find(n => n.id === selected);
  const focus = useMemo(() => focusId && graph.nodes.some(n => n.id === focusId) ? neighbourhood(graph, focusId, options.depth) : undefined, [graph, focusId, options.depth]);
  const activate = useCallback((node: GraphNode) => { if (node.file) open(node.file, node.path ?? ""); }, [open]);
  const inspect = useCallback((node: GraphNode) => setSelected(node.id), []);
  const choose = useCallback((node: GraphNode) => { setSelected(node.id); setFocusId(node.id); }, []);
  const areaLabel = useCallback((id: string) => { const d = documents.find(doc => doc.kind === "regions" && doc.id === id); return d && d.label !== id ? `${id} · ${d.label}` : id; }, [documents]);
  const pins = store.pinned;
  const unpin = useCallback((id: string) => store.unpin(id), [store]);
  const pin = useCallback((id: string, pos: { x: number; y: number }) => store.pin(id, pos), [store]);
  const pinCount = Object.keys(pins).filter(id => story.nodes.some(n => n.id === id)).length;
  const hits = useMemo(() => searchNodes(story.nodes, query).slice(0, 8), [story, query]);
  const find = (node: GraphNode) => {
    // A hit hidden by the area or kind filter reveals itself rather than failing silently.
    if (area && !node.areas?.includes(area)) setArea("");
    if (!kinds.includes(node.kind)) setKinds(k => [...k, node.kind]);
    choose(node); setCentre(c => ({ id: node.id, seq: (c?.seq ?? 0) + 1 })); setQuery("");
  };
  useEffect(() => {
    const leave = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !focusId || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest("dialog, [role=dialog], input:not([type=checkbox]), textarea, .cm-editor")) return;
      setFocusId(undefined);
    };
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, [focusId]);
  const status = { idle: "", pending: "Saving layout…", saving: "Saving layout…", saved: "Layout saved", failed: "Layout save failed – retry" }[store.layoutStatus];
  return <section className="story-workspace" aria-label="Story workspace"><h1>Story</h1><p>Derived from existing conditions and effects. Select a node to focus its neighbourhood; open it to edit its entity. Drag a node to pin it where you want it.</p>
    <div className="row-actions"><label>Area filter<select aria-label="Story area filter" value={area} onChange={e => setArea(e.target.value)}><option value="">All areas</option>{documents.filter(d => d.kind === "regions").map(d => <option key={d.id}>{d.id}</option>)}</select></label>{KINDS.map(kind => <label key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={e => setKinds(e.target.checked ? [...kinds, kind] : kinds.filter(k => k !== kind))} />{kind}</label>)}</div>
    <fieldset className="story-controls"><legend>View</legend>
      <label><input type="checkbox" checked={options.allReferences} onChange={e => setOptions({ allReferences: e.target.checked })} />Show all references</label>
      <label>Direction<select aria-label="Story direction" value={options.direction} onChange={e => setOptions({ direction: e.target.value as StoryOptions["direction"] })}><option value="LR">Left to right</option><option value="TB">Top to bottom</option></select></label>
      <label>Spacing<select aria-label="Story spacing" value={options.spacing} onChange={e => setOptions({ spacing: e.target.value as StoryOptions["spacing"] })}><option value="compact">Compact</option><option value="normal">Normal</option><option value="wide">Wide</option></select></label>
      <label><input type="checkbox" checked={options.group} onChange={e => setOptions({ group: e.target.checked })} />Group by area</label>
      <button type="button" onClick={() => setArranged(n => n + 1)}>Re-arrange</button>
      {confirmReset
        ? <span role="group" aria-label="Confirm reset layout">Clear {pinCount} pinned position{pinCount === 1 ? "" : "s"}? <button type="button" onClick={() => { store.resetPins(); setConfirmReset(false); setArranged(n => n + 1); }}>Clear pins</button><button type="button" onClick={() => setConfirmReset(false)}>Cancel</button></span>
        : <button type="button" disabled={!pinCount} onClick={() => setConfirmReset(true)}>Reset layout</button>}
    </fieldset>
    <fieldset className="story-controls"><legend>Focus and search</legend>
      <label>Find a node<input type="search" aria-label="Find a node" value={query} placeholder="name or ID" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && hits[0]) find(hits[0]); if (e.key === "Escape") setQuery(""); }} /></label>
      {!!query.trim() && <ul className="story-hits" aria-label="Search results">{hits.length ? hits.map(n => <li key={n.id}><button type="button" onClick={() => find(n)}>{n.kind}: {n.label}</button></li>) : <li>No match</li>}</ul>}
      <label>Depth<select aria-label="Focus depth" value={options.depth} onChange={e => setOptions({ depth: e.target.value === "2" ? 2 : 1 })}><option value="1">1 hop</option><option value="2">2 hops</option></select></label>
      {focus ? <><span role="status">Focus: {focusId} · {focus.size} nodes</span><button type="button" onClick={() => setFocusId(undefined)}>Show all</button></> : <span>Select a node to focus it.</span>}
    </fieldset>
    <StoryGraphView graph={graph} options={layoutOptions} pins={pins} focus={focus} selected={selected} select={choose} open={activate} inspect={inspect} pin={pin} unpin={unpin}
      viewport={prefs.viewport} moved={moved} arranged={arranged} centre={centre} areaLabel={areaLabel}
      toolbar={<>{status && <span role="status" className="layout-status">{store.layoutStatus === "failed" ? <button type="button" className="layout-failed" onClick={() => { void store.flushLayout(); }}>{status}</button> : status}</span>}{store.layoutProblem && <span className="warning"> {store.layoutProblem} Dragging a node replaces the file.</span>}</>} />
    <aside className="workspace-card" aria-label="Continue the story"><h2>Continue the story</h2><label>Story node<select aria-label="Story node" value={current?.id ?? ""} onChange={e => { const n = graph.nodes.find(v => v.id === e.target.value); if (n) choose(n); else setSelected(undefined); }}><option value="">Choose a node…</option>{graph.nodes.map(n => <option value={n.id} key={n.id}>{n.kind}: {n.label}</option>)}</select></label>
      {current && <><h3>{current.label}</h3>{current.note && <p>{current.note}</p>}<div className="row-actions">{current.file && <button type="button" onClick={() => activate(current)}>Open entity</button>}{pins[current.id] && <button type="button" onClick={() => unpin(current.id)}>Unpin</button>}</div>{["discovery", "quest"].includes(current.kind) && <div className="row-actions">{[["quests", "New task when this happens"], ["events", "New event when this happens"], ["regions", "New area unlocked by this"]].map(([kind, label]) => <button type="button" key={kind} onClick={() => create(kind, continuation(current, kind))}>{label}</button>)}</div>}{current.kind === "flag" && <section aria-label="Flag used by"><h3>Used by</h3>{flagUsedBy(documents, current.label).map(ref => <button type="button" key={`${ref.file}:${ref.path}`} onClick={() => open(ref.file, ref.path)}>{ref.file} › {ref.path}</button>)}</section>}</>}
    </aside>
    {!!story.warnings.length && <section aria-label="Story warnings"><h2>Warnings (do not block saving)</h2>{story.warnings.map(w => <p className="warning" key={`${w.file}:${w.path}`}><button type="button" onClick={() => open(w.file, w.path)}>{w.file} › {w.path}</button> {w.message}</p>)}</section>}
  </section>;
}
