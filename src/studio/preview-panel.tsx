import { useEffect, useMemo, useRef, useState } from "react";
import { readDocuments } from "./documents";
import type { StudioStore } from "./store";
import { parseSeed, previewUrl, type PreviewApi } from "./preview";

type Frame = { api?: PreviewApi; contentError: boolean };

function inspect(frame: HTMLIFrameElement | null): Frame {
  try {
    const win = frame?.contentWindow as (Window & { ti?: PreviewApi }) | null | undefined;
    return { api: win?.ti, contentError: !!frame?.contentDocument?.querySelector("#app > pre.error") };
  } catch { return { contentError: false }; }
}

export function PreviewPanel({ store, canSave, save, showDiagnostics }: {
  store: StudioStore; canSave: boolean; save: () => void; showDiagnostics: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [firstVariants, setFirstVariants] = useState(false);
  const [seedText, setSeedText] = useState("");
  const [state, setState] = useState<Frame>({ contentError: false });
  const [item, setItem] = useState(""), [amount, setAmount] = useState("1");
  const [hours, setHours] = useState("1");
  const [area, setArea] = useState(""), [quest, setQuest] = useState("");
  const [message, setMessage] = useState("");
  // Pickers list saved content only: the preview never sees unsaved drafts.
  const saved = useMemo(() => readDocuments(store.disk, false).documents, [store.disk]);
  const ids = (kind: string) => saved.filter(d => d.kind === kind);
  const seed = parseSeed(seedText);
  const unsaved = store.drafts.size;

  useEffect(() => { setState(inspect(frame.current)); }, []);
  const navigate = (url: string) => { try { frame.current!.contentWindow!.location.replace(url); } catch { frame.current!.src = url; } };
  const run = (action: (api: PreviewApi) => void) => {
    const api = inspect(frame.current).api;
    if (!api) { setMessage("The game is not ready."); return; }
    try { action(api); setMessage(""); } catch (error) { setMessage((error as Error).message); }
  };
  const newGame = () => {
    if (seed.seed !== undefined) navigate(previewUrl({ firstVariants, seed: seed.seed }));
    else run(api => api.reset());
  };
  const toggleVariants = (on: boolean) => { setFirstVariants(on); navigate(previewUrl({ firstVariants: on })); };
  const ready = !!state.api && !state.contentError;
  const picker = (label: string, value: string, set: (v: string) => void, kind: string) =>
    <select aria-label={label} value={value} onChange={e => set(e.target.value)}><option value="">{label}…</option>{ids(kind).map(d => <option key={d.id} value={d.id}>{d.label === d.id ? d.id : `${d.id} · ${d.label}`}</option>)}</select>;
  return <aside className="preview-panel" aria-label="Game preview">
    <h2>Preview</h2>
    <p className="hint">Preview uses saved content and its own save slots; your game save is untouched.</p>
    {unsaved > 0 && <p className="warning" role="status">Preview shows saved content – {unsaved} unsaved {unsaved === 1 ? "change" : "changes"}
      <button type="button" disabled={!canSave || store.busy} onClick={save}>Save and reload preview</button></p>}
    {state.contentError && <p className="error" role="alert">The saved content has errors; the game shows its content error screen. <button type="button" onClick={showDiagnostics}>Show diagnostics</button></p>}
    <iframe ref={frame} title="Game preview" src={previewUrl()} onLoad={() => setState(inspect(frame.current))} />
    <div className="preview-controls">
      <div className="row-actions"><label>Seed<input aria-label="Seed" inputMode="numeric" value={seedText} placeholder="random" onChange={e => setSeedText(e.target.value)} /></label>
        <button type="button" disabled={!seed.valid || (seed.seed === undefined && !ready)} onClick={newGame}>New game</button></div>
      {!seed.valid && <p className="error" role="alert">Seed must be whole digits.</p>}
      <label className="check"><input type="checkbox" checked={firstVariants} onChange={e => toggleVariants(e.target.checked)} />First variants</label>
      <div className="row-actions">{picker("Item", item, setItem, "items")}<input aria-label="Amount" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} />
        <button type="button" disabled={!ready || !item || !(Number(amount) >= 1)} onClick={() => run(api => api.give(item, Number(amount)))}>Give item</button></div>
      <div className="row-actions"><input aria-label="Hours" type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} />
        <button type="button" disabled={!ready || !(Number(hours) > 0)} onClick={() => run(api => api.time(Number(hours)))}>Advance time</button></div>
      <div className="row-actions">{picker("Area", area, setArea, "regions")}<button type="button" disabled={!ready || !area} onClick={() => run(api => api.unlock(area))}>Unlock area</button></div>
      <div className="row-actions">{picker("Task", quest, setQuest, "quests")}<button type="button" disabled={!ready || !quest} onClick={() => run(api => api.quest(quest))}>Start task</button></div>
      <a href={previewUrl({ firstVariants })} target="_blank" rel="noreferrer">Open in a new tab ↗</a>
      {message && <p className="error" role="alert">{message}</p>}
    </div>
  </aside>;
}
