import { useMemo, useState } from "react";
import type { Document } from "./documents";
import { Dialog } from "./dialogs";
import { GraphView } from "./graph";
import { identities, referenceLabel, type Identity } from "./references";
import {
  addBranch, addParent, branchIdProblem, branchUsers, isTreeShape, nextOrder, placeNode, removeBranch, removeParent, setNode, treeDocument, treeGraph, treeKinds, unplaced, updateBranch,
  type TreeRaw,
} from "./tree";

interface Props {
  documents: Document[];
  edit: (path: string, raw: unknown) => void;
  open: (file: string, path: string) => void;
  rename: (target: Identity) => void;
  newHere: (kind: string, tree: { branch: string; after: string[] }) => void;
}
export function TreeEditor(props: Props) {
  const [kind, setKind] = useState<"craft" | "build">("craft");
  return <section className="tree-workspace" aria-label="Creation tree editor"><h1>Creation trees</h1>
    <div className="row-actions">{(Object.keys(treeKinds) as ("craft" | "build")[]).map(k => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{treeKinds[k].label}</button>)}</div>
    <TreeWorkspace key={kind} kind={kind} {...props} />
  </section>;
}
function TreeWorkspace({ kind, documents, edit, open, rename, newHere }: Props & { kind: "craft" | "build" }) {
  const owner = treeDocument(documents, kind);
  const [selected, setSelected] = useState<string>(), [edge, setEdge] = useState<string>();
  const [error, setError] = useState(""), [placing, setPlacing] = useState<string>(), [candidate, setCandidate] = useState("");
  const graph = useMemo(() => owner && isTreeShape(owner.raw) ? treeGraph(owner, documents) : { nodes: [], edges: [] }, [owner, documents]);
  if (!owner || !isTreeShape(owner.raw)) return <p className="warning" role="alert">The {treeKinds[kind].label.toLowerCase()} is missing or damaged. Repair <code>content/trees</code> in the JSON view.</p>;
  const tree = owner.raw, noun = treeKinds[kind].noun, entities = treeKinds[kind].entities;
  const node = tree.nodes.find(n => n.target === selected);
  const entity = documents.find(d => d.kind === entities && d.id === selected);
  const change = (make: () => TreeRaw) => {
    try { edit(owner.path, make()); setError(""); } catch (failure) { setError((failure as Error).message); }
  };
  const missing = unplaced(documents, owner);
  const selectedEdge = graph.edges.find(e => e.id === edge);
  const candidates = node ? tree.nodes.filter(n => n.target !== node.target && !node.after.includes(n.target)) : [];
  const label = (id: string) => referenceLabel(noun, id, documents);
  const branchIdentity = (index: number) => identities(documents).find(i => i.file === owner.path && i.path === `branches.${index}.id`);
  return <>
    <p className="hint">The game draws the tree with its own layout; only the prerequisites are authoritative. This view is arranged automatically and nothing about it is saved.</p>
    <p className="warning">Changing prerequisites changes progression for new games; existing saves keep their earned unlocks.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <GraphView graph={graph} title={`${treeKinds[kind].label} graph`}
      node={n => { setSelected(n.id); setEdge(undefined); setError(""); }}
      edge={e => { setEdge(e.id); setSelected(undefined); setError(""); }}
      connect={(parent, child) => change(() => addParent(tree, child, parent))} />
    <div className="tree-panels">
      <aside className="workspace-card" aria-label="Selection">
        {node ? <><h2>{label(node.target)}</h2>
          <div className="row-actions"><button type="button" disabled={!entity} onClick={() => entity && open(entity.path, "")}>Open {noun} {node.target}</button></div>
          <label>Branch<select aria-label={`branch of ${node.target}`} value={node.branch} onChange={e => change(() => setNode(tree, node.target, { branch: e.target.value }))}>{tree.branches.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}</select></label>
          <label>Order<input type="number" aria-label={`order of ${node.target}`} value={node.order} onChange={e => e.target.value !== "" && change(() => setNode(tree, node.target, { order: Number(e.target.value) }))} /></label>
          <h3>Prerequisites</h3>
          {node.after.length ? <ul>{node.after.map(p => <li key={p}>{label(p)} <button type="button" aria-label={`Remove prerequisite ${p} from ${node.target}`} onClick={() => change(() => removeParent(tree, node.target, p))}>Remove</button></li>)}</ul> : <p>None (a starting node).</p>}
          <div className="row-actions"><select aria-label="Prerequisite to add" value={candidate} onChange={e => setCandidate(e.target.value)}><option value="">Choose a node in this tree…</option>{candidates.map(n => <option key={n.target} value={n.target}>{label(n.target)}</option>)}</select>
            <button type="button" disabled={!candidate} onClick={() => { change(() => addParent(tree, node.target, candidate)); setCandidate(""); }}>Add prerequisite</button></div>
          <h3>Unlocks</h3><p>{tree.nodes.filter(n => n.after.includes(node.target)).map(n => n.target).join(", ") || "Nothing depends on it."}</p>
        </> : selectedEdge ? <><h2>Prerequisite</h2><p>{selectedEdge.source} → {selectedEdge.target}</p>
          <button type="button" onClick={() => { change(() => removeParent(tree, selectedEdge.target, selectedEdge.source)); setEdge(undefined); }}>Remove this prerequisite</button>
        </> : <p>Select a node or a prerequisite in the graph or list to edit it.</p>}
        <div className="row-actions"><button type="button" onClick={() => newHere(entities, { branch: node?.branch ?? tree.branches[0].id, after: node ? [node.target] : [] })}>New {noun} here</button></div>
        <p className="hint">{node ? `Creates a draft ${noun} placed after ${node.target} in branch ${node.branch}.` : `Creates a draft ${noun} as a starting node in branch ${tree.branches[0].id}.`} Stored with its tree node on Save all.</p>
      </aside>
      <section className="workspace-card" aria-label="Branches"><h2>Branches</h2>
        {tree.branches.map((b, index) => { const users = branchUsers(tree, b.id), identity = branchIdentity(index); return <div className="branch-row" key={b.id}>
          <code>{b.id}</code>
          <label>Name<input aria-label={`name of branch ${b.id}`} value={b.name} onChange={e => change(() => updateBranch(tree, b.id, { name: e.target.value }))} /></label>
          <label>Order<input type="number" aria-label={`order of branch ${b.id}`} value={b.order} onChange={e => e.target.value !== "" && change(() => updateBranch(tree, b.id, { order: Number(e.target.value) }))} /></label>
          <button type="button" disabled={!identity} onClick={() => identity && rename(identity)}>Rename {b.id}…</button>
          <button type="button" disabled={users.length > 0 || tree.branches.length === 1} title={users.length ? `Used by ${users.join(", ")}` : undefined} onClick={() => change(() => removeBranch(tree, b.id))}>Delete branch {b.id}</button>
          {users.length > 0 && <small>Used by {users.length} {users.length === 1 ? "node" : "nodes"}; move them first.</small>}
        </div>; })}
        <AddBranch tree={tree} documents={documents} add={branch => change(() => addBranch(tree, branch))} />
      </section>
      <section className="workspace-card" aria-label="Not placed yet"><h2>Not placed yet</h2>
        {missing.length ? <><p className="warning">Saving is blocked until every {noun} has exactly one node.</p><ul>{missing.map(d => <li key={d.id}>{label(d.id)} <button type="button" onClick={() => setPlacing(d.id)}>Place {d.id} in tree</button></li>)}</ul></> : <p>Every {noun} has a node.</p>}
      </section>
    </div>
    {placing && <PlaceDialog tree={tree} id={placing} label={label} close={() => setPlacing(undefined)} place={(branch, after) => { change(() => placeNode(tree, placing, branch, after)); setPlacing(undefined); setSelected(placing); }} />}
  </>;
}
function AddBranch({ tree, documents, add }: { tree: TreeRaw; documents: Document[]; add: (branch: { id: string; name: string; order: number }) => void }) {
  const [id, setId] = useState(""), [name, setName] = useState("");
  const problem = id ? branchIdProblem(documents, id) : undefined;
  return <div className="row-actions"><label>New branch ID<input aria-label="New branch ID" value={id} onChange={e => setId(e.target.value)} /></label><label>New branch name<input aria-label="New branch name" value={name} onChange={e => setName(e.target.value)} /></label>
    <button type="button" disabled={!id || !name.trim() || !!problem} onClick={() => { add({ id, name: name.trim(), order: Math.max(-1, ...tree.branches.map(b => b.order)) + 1 }); setId(""); setName(""); }}>Add branch</button>
    {problem && <span role="alert" className="error">{problem}</span>}</div>;
}
function PlaceDialog({ tree, id, label, close, place }: { tree: TreeRaw; id: string; label: (id: string) => string; close: () => void; place: (branch: string, after: string[]) => void }) {
  const [branch, setBranch] = useState(tree.branches[0].id), [after, setAfter] = useState<string[]>([]);
  return <Dialog title="Place in tree" close={close}><p>{label(id)} gets order {nextOrder(tree)}.</p>
    <label>Branch<select aria-label="Branch" value={branch} onChange={e => setBranch(e.target.value)}>{tree.branches.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}</select></label>
    <fieldset><legend>Prerequisites</legend>{tree.nodes.map(n => <label key={n.target}><input type="checkbox" checked={after.includes(n.target)} onChange={e => setAfter(e.target.checked ? [...after, n.target] : after.filter(p => p !== n.target))} />{label(n.target)}</label>)}</fieldset>
    <div className="dialog-actions"><button onClick={close}>Cancel</button><button className="primary" onClick={() => place(branch, after)}>Place in tree</button></div></Dialog>;
}
