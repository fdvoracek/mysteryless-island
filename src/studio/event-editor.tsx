import { useMemo, useState } from "react";
import { EventChoice, EventScene, GameEvent } from "../content";
import { Dialog } from "./dialogs";
import { Field, RawField, type FieldProps } from "./form";
import { GraphView } from "./graph";
import { addChoice, addScene, deleteScene, eventChecks, eventGraph, removeChoice, type EventRaw } from "./event";
import { getAt, whereUsed, type Identity } from "./references";
import { replaceAt } from "./rename";

type EventEditorProps = FieldProps & { rename: (target: Identity) => void };
export function EventEditor(props: EventEditorProps) {
  const raw = props.value as EventRaw | null;
  const scenes = raw?.scenes;
  if (!raw || !scenes || typeof scenes !== "object" || Array.isArray(scenes) || Object.entries(scenes).some(([key, scene]) => !key.startsWith("_") && (!scene || typeof scene !== "object" || (scene.choices !== undefined && (!Array.isArray(scene.choices) || scene.choices.some(choice => !choice || typeof choice !== "object")))))) {
    return <section aria-label="Event editor"><p className="warning">Repair the event shape in JSON; registry diagnostics below identify invalid fields.</p><RawField {...props} /></section>;
  }
  return <EventWorkspace {...props} />;
}
function EventWorkspace(props: EventEditorProps) {
  const raw = props.value as EventRaw;
  const graph = useMemo(() => eventGraph(props.owner), [props.owner]);
  const [scene, setScene] = useState("start"), [choice, setChoice] = useState<number>();
  const [adding, setAdding] = useState<"scene" | "choice">(), [removing, setRemoving] = useState<string>();
  const [retarget, setRetarget] = useState(""), [error, setError] = useState("");
  const selected = raw.scenes?.[scene];
  const fields = (keys: string[]) => keys.map(key => <Field key={key} {...props} schema={GameEvent.shape[key as keyof typeof GameEvent.shape]} path={key} value={getAt(raw, key)} onChange={v => props.onChange(replaceAt(raw, key, v))} />);
  const checks = eventChecks(props.owner, props.problems);
  const incoming = removing ? whereUsed(props.documents, props.owner, `scenes.${removing}`).filter(ref => !ref.path.startsWith(`scenes.${removing}.`)) : [];
  const selection = selected && choice !== undefined && selected.choices?.[choice] ? `scenes.${scene}.choices.${choice}` : `scenes.${scene}`;
  const protectedKey = choice === undefined ? "choices" : "id";
  const selectedRaw = getAt(raw, selection) as Record<string, unknown> | undefined;
  const editable = selectedRaw && Object.fromEntries(Object.entries(selectedRaw).filter(([key]) => key !== protectedKey));
  const updateSelected = (value: unknown) => {
    const next = value as Record<string, unknown>;
    const ordered = Object.fromEntries(Object.keys(selectedRaw ?? {}).filter(key => key === protectedKey || key in next).map(key => [key, key === protectedKey ? selectedRaw![key] : next[key]]));
    props.onChange(replaceAt(raw, selection, { ...ordered, ...next }));
  };
  return <section className="event-workspace" aria-label="Event editor"><section className="workspace-card"><h2>Event properties</h2>{fields(Object.keys(GameEvent.shape).filter(key => key !== "scenes"))}{Object.keys(raw).filter(key => !(key in GameEvent.shape)).map(key => <details key={key}><summary>{key}</summary><pre>{JSON.stringify(raw[key], null, 2)}</pre></details>)}</section>
    <GraphView graph={graph} title="Event scene graph" node={n => { setScene(n.id); setChoice(undefined); }} edge={e => { setScene(e.source); setChoice(Number(e.id.split(":").at(-1))); }} />
    <div className="row-actions"><button type="button" onClick={() => setAdding("scene")}>Add scene</button><button type="button" disabled={!selected} onClick={() => setAdding("choice")}>Add choice</button></div>
    <section className="workspace-card" aria-label="Selected scene or choice"><h2>{choice === undefined ? `Scene ${scene}` : `Choice ${scene} / ${choice + 1}`}</h2><label>Scene<select aria-label="Selected scene" value={selected ? scene : ""} onChange={e => { setScene(e.target.value); setChoice(undefined); }}><option value="">Choose scene…</option>{graph.nodes.filter(n => n.kind === "scene").map(n => <option key={n.id}>{n.id}</option>)}</select></label>
      {selected && <><div className="row-actions"><button type="button" onClick={() => setChoice(undefined)}>Edit scene</button><button type="button" disabled={scene === "start"} title={scene === "start" ? "The engine opens events at start" : undefined} onClick={() => props.rename({ file: props.owner.path, path: `scenes.${scene}`, id: scene, kind: "scene", key: true })}>Rename scene</button><button type="button" disabled={scene === "start"} onClick={() => { setRemoving(scene); setRetarget(""); setError(""); }}>Delete scene</button></div>
        <ul aria-label={`Choices in ${scene}`}>{selected.choices?.map((c, index) => <li key={index}><button type="button" onClick={() => setChoice(index)}>{c.id}: {c.label} → {c.next ?? "close"}</button><button type="button" aria-label={`Remove choice ${c.id}`} onClick={() => { props.onChange(removeChoice(raw, scene, index)); setChoice(undefined); }}>Remove choice</button></li>)}</ul>
        <Field key={selection} {...props} schema={choice === undefined ? EventScene.omit({ choices: true }) : EventChoice.omit({ id: true })} path={selection} value={editable} onChange={updateSelected} />
      </>}
    </section>
    <section className="workspace-card" aria-label="Event graph checks"><h2>Graph checks</h2>{checks.length ? checks.map(c => <p key={c.path} className="warning"><code>{c.path}</code>: {c.message}</p>) : <p className="ok">Start scene present · no dangling next · all scenes reachable</p>}</section>
    {adding && <EventAddDialog {...props} mode={adding} scene={scene} close={() => setAdding(undefined)} added={next => { props.onChange(next); setAdding(undefined); }} />}
    {removing && <Dialog title="Delete scene" close={() => setRemoving(undefined)}><p>{incoming.length ? "Deletion blocked until incoming choices are retargeted." : "Delete this scene from the draft?"}</p><ul>{incoming.map(ref => <li key={ref.path}>{ref.path}</li>)}</ul>{!!incoming.length && <label>Retarget incoming choices<select aria-label="Retarget incoming choices" value={retarget} onChange={e => setRetarget(e.target.value)}><option value="">Choose another scene…</option>{graph.nodes.filter(n => n.kind === "scene" && n.id !== removing).map(n => <option key={n.id}>{n.id}</option>)}</select></label>}{error && <p role="alert">{error}</p>}<button type="button" disabled={!!incoming.length && !retarget} onClick={() => { try { props.onChange(deleteScene(props.documents, props.owner, removing, retarget)); setRemoving(undefined); setScene("start"); setChoice(undefined); } catch (failure) { setError((failure as Error).message); } }}>{incoming.length ? "Retarget and delete scene" : "Delete scene draft"}</button></Dialog>}
  </section>;
}
function EventAddDialog(props: FieldProps & { mode: "scene" | "choice"; scene: string; close: () => void; added: (raw: EventRaw) => void }) {
  const [id, setId] = useState("");
  const [value, setValue] = useState<unknown>(() => props.mode === "scene" ? { text: "", journal: "" } : { id: "", label: "" });
  const [newScene, setNewScene] = useState(false), [sceneId, setSceneId] = useState("");
  const [sceneValue, setSceneValue] = useState<unknown>({ text: "", journal: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  let next: EventRaw | undefined, error = "";
  try {
    const raw = props.value as EventRaw;
    if (props.mode === "scene") next = addScene(raw, id, value);
    else {
      const withScene = newScene ? addScene(raw, sceneId, sceneValue) : raw;
      next = addChoice(withScene, props.scene, newScene ? { ...value as object, next: sceneId } : value);
    }
  } catch (failure) { error = (failure as Error).message; next = undefined; }
  return <Dialog title={props.mode === "scene" ? "Add scene" : "Add choice"} close={props.close}>
    {props.mode === "scene" && <label>Scene ID<input aria-label="New scene ID" value={id} onChange={e => setId(e.target.value)} /></label>}
    <Field {...props} schema={props.mode === "scene" ? EventScene : EventChoice} path={props.mode === "scene" ? "scenes.new_scene" : "scenes.start.choices.new_choice"} value={value} onChange={setValue} onError={(p, message) => setErrors(prev => ({ ...prev, [p]: message }))} problems={[]} />
    {props.mode === "choice" && <><label><input type="checkbox" checked={newScene} onChange={e => setNewScene(e.target.checked)} />Create a new target scene</label>{newScene && <><label>New target scene ID<input aria-label="New target scene ID" value={sceneId} onChange={e => setSceneId(e.target.value)} /></label><Field {...props} schema={EventScene} path="scenes.new_target_scene" value={sceneValue} onChange={setSceneValue} problems={[]} onError={(p, message) => setErrors(prev => ({ ...prev, [p]: message }))} /></>}</>}
    {error && <p className="error">{error}</p>}<button type="button" disabled={!next || Object.values(errors).some(Boolean)} onClick={() => next && props.added(next)}>Add to draft</button>
  </Dialog>;
}
