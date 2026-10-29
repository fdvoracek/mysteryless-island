import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ContentProblem } from "../content";
import { areaDocuments, kindLabels, readDocuments } from "./documents";
import { StudioStore } from "./store";
import { entitySchemas, schemaFor } from "./schema";
import { Field, fileContentsClass } from "./form";
import { JsonEditor } from "./json-editor";
import { readMode, rememberMode, type EditorMode } from "./editor-mode";
import { CreateDialog, Dialog, RenameDialog } from "./dialogs";
import { StoryView } from "./story-view";
import { EventEditor } from "./event-editor";
import { AreaWorkspace } from "./area-workspace";
import { identities, deletionReferences, referenceOptions, whereUsed, type Identity } from "./references";
import { TreeEditor } from "./tree-editor";
import { MapEditor } from "./map-editor";
import { blockerLabel, deletionBlockers } from "./tree";
import { PreviewPanel } from "./preview-panel";
import "./studio.css";

function Studio() {
  const [store] = useState(() => new StudioStore());
  const version = useSyncExternalStore(store.subscribe, () => store.version);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState("");
  const [selection, setSelection] = useState("");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [, setModeVersion] = useState(0);
  const [create, setCreate] = useState<{ kind: string; duplicate?: string; areaPath?: string; prefill?: Record<string, unknown>; tree?: { branch: string; after: string[] } }>();
  const [renaming, setRenaming] = useState<Identity>();
  const [deleteOrphans, setDeleteOrphans] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [historyKey, setHistoryKey] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hiddenConflicts, setHiddenConflicts] = useState<string[]>([]);
  const source = useRef<HTMLPreElement>(null);
  const { documents } = useMemo(() => loaded ? readDocuments(store.files, false) : { documents: [] }, [store, version, loaded]);
  const [validation, setValidation] = useState<{ version: number; problems: ContentProblem[] }>({ version: -1, problems: [] });
  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => setValidation({ version, problems: store.view.diagnostics }), 150);
    return () => window.clearTimeout(timer);
  }, [store, version, loaded]);
  const diagnostics = validation.problems;
  const validating = loaded && validation.version !== version;
  const canSave = !validating && store.canSave;
  const files = store.files;
  const problemCount = diagnostics.length + store.inputErrors.size;
  const status = store.status || (loaded ? "Read from disk" : "Loading files…");
  async function refresh() {
    try { await store.refresh(); setLoaded(true); setFailure(""); }
    catch (error) { setFailure((error as Error).message); }
  }
  function undo() { store.undo(); setHistoryKey((key) => key + 1); }
  function redo() { store.redo(); setHistoryKey((key) => key + 1); }
  async function save(overwrite = false) {
    try { await store.save(overwrite); setHiddenConflicts([]); setFailure(""); }
    catch (error) { setFailure((error as Error).message); }
  }
  useEffect(() => {
    void refresh();
    const reload = () => { if (!store.busy) void refresh(); };
    window.addEventListener("focus", reload);
    import.meta.hot?.on("studio:files-changed", reload);
    return () => { window.removeEventListener("focus", reload); import.meta.hot?.off("studio:files-changed", reload); };
  }, [store]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || document.querySelector("dialog[open]")) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); if (store.canSave) void save(); }
      // The JSON editor owns undo while focused; the Studio history stays on the toolbar.
      if (event.key.toLowerCase() === "z" && !(event.target instanceof Element && event.target.closest(".cm-editor"))) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    };
    const leave = (event: BeforeUnloadEvent) => { if (store.drafts.size) event.preventDefault(); void store.flushLayout(); };
    // Pins autosave after about a second; leaving or hiding the page writes them straight away.
    const hide = () => { if (document.visibilityState === "hidden") void store.flushLayout(); };
    window.addEventListener("keydown", keydown); window.addEventListener("beforeunload", leave); document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("beforeunload", leave); document.removeEventListener("visibilitychange", hide); };
  });
  const area = documents.find((document) => `area:${document.id}` === scope);
  const candidates = area ? areaDocuments(documents, area) : documents.filter((document) => scope === "all" || document.kind === scope);
  const visible = candidates.filter((document) => `${document.path} ${document.id} ${document.label} ${document.encoding === "utf8" ? document.content : ""}`.toLowerCase().includes(query.toLowerCase()));
  const selected = documents.find((document) => document.path === selection) ?? visible[0];
  const kinds = Object.keys(kindLabels).filter((kind) => documents.some((document) => document.kind === kind));
  const areas = documents.filter((document) => document.kind === "regions");
  function browse(value: string) { setScope(value); setSelection(""); setField(""); setQuery(""); }
  function openProblem(file: string, path: string) {
    const destination = documents.find(d => d.path === file);
    setScope(destination?.kind === "regions" ? `area:${destination.id}` : "all"); setQuery(""); setSelection(file); setField(path);
    requestAnimationFrame(() => {
      const control = document.querySelector(`[data-field="${CSS.escape(path)}"]`);
      control?.dispatchEvent(new CustomEvent("studio:reveal", { bubbles: true, detail: path }));
      for (let ancestor = control?.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      }
      requestAnimationFrame(() => {
        control?.scrollIntoView({ block: "center" });
        (control?.querySelector("input, select, textarea, button") as HTMLElement | null)?.focus();
        if (!control) source.current?.focus();
      });
    });
  }
  const selectedSchema = selected && schemaFor(selected.path);
  const mode: EditorMode = selected ? readMode(selected.path, selected.kind) : "form";
  function setMode(next: EditorMode, path = selected?.path) { if (!path) return; rememberMode(path, next); setModeVersion((n) => n + 1); }
  const target = documents.find((d) => d.path === deleting);
  const orphans = target?.kind === "regions" ? store.orphanActivities(target.path) : [];
  const removedPaths = new Set([target?.path, ...(deleteOrphans ? orphans.map(d => d.path) : [])]);
  const usedBy = target ? [...deletionBlockers(documents, target), ...(deleteOrphans ? orphans.flatMap(d => deletionReferences(documents.filter(other => !removedPaths.has(other.path) || other.path === d.path), d)) : [])] : [];
  const conflict = [...store.conflicts.values()].find((entry) => !hiddenConflicts.includes(`${entry.path}:${entry.disk?.hash ?? "missing"}`));
  const hideConflict = () => { if (conflict) setHiddenConflicts((previous) => [...previous, `${conflict.path}:${conflict.disk?.hash ?? "missing"}`]); };
  const openCreated = (path: string) => { setCreate(undefined); setScope("all"); setQuery(""); setSelection(path); setMode("form", path); if (path.startsWith("content/regions/")) setScope(`area:${path.split("/").at(-1)!.slice(0, -5)}`); };
  return <div className="studio-shell">
    <header className="studio-header">
      <a className="brand" href="/studio/">Mysteryless Island <span>Studio</span></a>
      <label className="search">Search content<input type="search" placeholder="IDs, names, text…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="header-actions"><span className={problemCount ? "validation error" : "validation ok"} role="status">{failure ? "Unavailable" : loaded ? validating ? "Validating…" : problemCount ? `${problemCount} ${problemCount === 1 ? "problem" : "problems"}` : "Valid · 0 problems" : "Loading…"}</span>
        <span>{store.drafts.size} unsaved files</span>
        <button disabled={!store.past.length || store.busy} onClick={undo}>Undo</button><button disabled={!store.future.length || store.busy} onClick={redo}>Redo</button>
        <button className="primary" disabled={!canSave} onClick={() => { void save(); }}>Save all</button>
        <button disabled={store.busy} onClick={() => setCreate({ kind: scope })}>Create</button>
        <button aria-expanded={previewOpen} aria-controls="preview-panel" onClick={() => setPreviewOpen(open => !open)}>Preview</button>
        <button disabled={store.busy} onClick={() => { void refresh(); }}>Refresh from disk</button><a href="/" target="_blank" rel="noreferrer">Open game ↗</a></div>
    </header>
    {store.status && <p className="save-report" role="log">{store.status}</p>}
    {failure && <div role="alert" className="request-error">{failure}. Refresh to try again.</div>}
    <div className="studio-body">
    <div className="studio-columns">
      <nav className="studio-nav" aria-label="Content navigation">
        <h2>Browse</h2><button aria-current={scope === "story" ? "page" : undefined} onClick={() => browse("story")}>Story</button><button aria-current={scope === "trees" ? "page" : undefined} onClick={() => browse("trees")}>Trees</button><button aria-current={scope === "map" ? "page" : undefined} onClick={() => browse("map")}>Map</button><button aria-current={scope === "all" ? "page" : undefined} onClick={() => browse("all")}>All files <span>{documents.length}</span></button>
        <h2>By area</h2>{areas.map((document) => <button key={document.path} aria-current={scope === `area:${document.id}` ? "page" : undefined} onClick={() => browse(`area:${document.id}`)}>{document.id}</button>)}
        <button onClick={() => setCreate({ kind: "regions" })}>+ new area</button><h2>By kind</h2>{kinds.map((kind) => <button key={kind} aria-current={scope === kind ? "page" : undefined} onClick={() => browse(kind)}>{kindLabels[kind]}<span>{documents.filter((document) => document.kind === kind).length}</span></button>)}
      </nav>
      {!["story", "trees", "map"].includes(scope) && <section className="entity-list" aria-label="Entity list">
        <div className="list-heading"><h1>{area ? area.label : kindLabels[scope] ?? "All files"}</h1><p>{visible.length} files{area && " · area and available activities"}</p></div>
        {visible.map((document) => <button key={document.path} aria-pressed={selected?.path === document.path} onClick={() => { setSelection(document.path); setField(""); }}><strong>{document.label}</strong><code>{document.id}</code>{store.drafts.has(document.path) && <span className="dirty">Unsaved</span>}<small>{kindLabels[document.kind] ?? document.kind}{diagnostics.some((problem) => problem.file === document.path) ? " · has problems" : ""}</small></button>)}
        {!visible.length && <p className="empty">{files.length ? "No files match this search." : status}</p>}
      </section>}
      <main className={`document-panel${["story", "trees", "map"].includes(scope) ? " story-panel" : ""}`}>
        {scope === "story" ? <StoryView store={store} documents={documents} open={openProblem} create={(kind, prefill) => setCreate({ kind, prefill })} /> : scope === "trees" ? <TreeEditor documents={documents} edit={(path, raw) => store.edit(path, raw)} open={openProblem} rename={setRenaming} newHere={(kind, tree) => setCreate({ kind, tree })} /> : scope === "map" ? <MapEditor documents={documents} problems={diagnostics} edit={(path, raw) => store.edit(path, raw)} open={path => { const id = documents.find(d => d.path === path)?.id; if (id) browse(`area:${id}`); }} /> : selected ? <>
          <div className="document-heading"><div><p>{kindLabels[selected.kind] ?? selected.kind} / {selected.id}</p><h2>{selected.label}</h2><code>{selected.path}</code></div><div className="row-actions">{selectedSchema && <><button aria-pressed={mode === "form"} onClick={() => setMode("form")}>Form</button><button aria-pressed={mode === "json"} onClick={() => setMode("json")}>JSON</button></>}{entitySchemas[selected.kind] && <><button disabled={store.busy} onClick={() => setCreate({ kind: selected.kind, duplicate: selected.path })}>Duplicate</button><button disabled={store.busy} onClick={() => { setDeleteOrphans(false); setDeleting(selected.path); }}>Delete</button></>}</div></div>
          <section className={fileContentsClass(selectedSchema, mode, selected.raw, Boolean(selectedSchema && selected.raw !== undefined && (area && selected.path === area.path || selected.kind === "events")))} aria-label="File contents"><div className="json-heading"><h3>{selected.encoding === "utf8" ? mode === "form" && selected.raw !== undefined ? "Content form" : "JSON" : "Image file"}</h3><span>{status}</span></div>
            {field && <p className="field-location">Field: <code>{field}</code></p>}
            {selectedSchema && selected.encoding === "utf8" && (mode === "json" || selected.raw === undefined) ? <JsonEditor key={selected.path} path={selected.path} text={store.buffersFor(selected.path)[""]?.text ?? (store.drafts.has(selected.path) ? selected.content : selected.formatted)} schema={selectedSchema} problems={diagnostics.filter((p) => p.file === selected.path)} references={(kind, path) => referenceOptions(kind, documents, selected, path)} readOnly={store.busy} reveal={field} onEdit={(text) => store.editJson(selected.path, text)} onSettle={() => store.endTyping()} onProblem={(message) => store.setJsonProblem(selected.path, message)} /> : selectedSchema && selected.raw !== undefined ? <fieldset disabled={store.busy} className="editor-fields" key={`${selected.path}:${historyKey}`}>
              {area && selected.path === area.path ? <AreaWorkspace schema={selectedSchema} value={selected.raw} path="" lockId problems={diagnostics.filter(p => p.file === selected.path)} documents={documents} owner={selected} onChange={raw => store.edit(selected.path, raw)} buffers={store.buffersFor(selected.path)} onError={(path, message, buffer) => store.error(selected.path, path, message, buffer)} open={openProblem} newActivity={() => setCreate({ kind: "activities", areaPath: selected.path })} /> : selected.kind === "events" ? <EventEditor schema={selectedSchema} value={selected.raw} path="" lockId problems={diagnostics.filter(p => p.file === selected.path)} documents={documents} owner={selected} onChange={raw => store.edit(selected.path, raw)} buffers={store.buffersFor(selected.path)} onError={(path, message, buffer) => store.error(selected.path, path, message, buffer)} rename={setRenaming} /> : <Field schema={selectedSchema} value={selected.raw} path="" lockId problems={diagnostics.filter((p) => p.file === selected.path)} documents={documents} owner={selected} onChange={(raw) => store.edit(selected.path, raw)} buffers={store.buffersFor(selected.path)} onError={(path, message, buffer) => store.error(selected.path, path, message, buffer)} />}
            </fieldset> : <pre tabIndex={0} ref={source} aria-label="Read-only file contents">{selected.encoding === "utf8" ? selected.formatted : `${selected.path}\nencoding: base64\nsha256: ${selected.hash}`}</pre>}
            {selectedSchema && <section className="identity-controls" aria-label="Rename identities"><h3>Rename IDs</h3>{identities(documents).filter(id => id.file === selected.path).map(id => <div key={id.path}><code>{id.path}: {id.id}</code><button disabled={store.busy || !!id.reserved} title={id.reserved} aria-label={`Rename ${id.path}`} onClick={() => setRenaming(id)}>Rename ID…</button>{id.reserved && <span className="hint">{id.reserved}</span>}</div>)}</section>}
            {selectedSchema && !(area && selected.path === area.path) && <section className="used-by" aria-label="Where used"><h3>Used by</h3>{whereUsed(documents, selected).map((ref) => <button key={`${ref.file}:${ref.path}`} onClick={() => openProblem(ref.file, ref.path)}>{ref.file} › {ref.path}</button>)}</section>}
          </section>
        </> : <h2>Content browser</h2>}
        <section className="diagnostics" id="diagnostics" aria-label="Diagnostics"><h2>Diagnostics <span>{diagnostics.length}</span></h2>
          {files.length > 0 && !diagnostics.length && <p className="ok">All content passes the shared registry validation.</p>}
          {diagnostics.length > 0 && <ul>{diagnostics.map((problem, index) => <li key={`${problem.file}:${problem.path}:${index}`}>
            {documents.some((document) => document.path === problem.file) ? <button className="problem-link" onClick={() => openProblem(problem.file, problem.path)}><code>{problem.file}{problem.path && ` › ${problem.path}`}</code></button> : <code>{problem.file || "Content pack"}</code>}
            <p>{problem.message}</p>
          </li>)}</ul>}
        </section>
      </main>
    </div>
    {previewOpen && <PreviewPanel store={store} canSave={canSave} save={() => { void save(); }} showDiagnostics={() => document.getElementById("diagnostics")?.scrollIntoView({ block: "start" })} />}
    </div>
    {create && <CreateDialog store={store} kind={create.kind} areaPath={create.areaPath} tree={create.tree} duplicate={documents.find((d) => d.path === create.duplicate)} prefill={create.prefill ?? documents.find((d) => d.path === create.duplicate)?.raw as Record<string, unknown> | undefined} close={() => setCreate(undefined)} created={openCreated} />}
    {target && <Dialog title="Delete entity" close={() => setDeleting(undefined)}><p>{usedBy.length ? "Delete blocked: this entity is used by:" : "Stage deletion of this entity? Save all applies the deletion after pack validation."}</p><ul>{usedBy.map((ref) => <li key={`${ref.file}:${ref.path}`}><code>{blockerLabel(documents, ref)}</code></li>)}</ul>{!!orphans.length && <section aria-label="Activities left without an area"><h3>Activities left without an area</h3><ul>{orphans.map(d => <li key={d.path}>{d.id}</li>)}</ul><label><input type="radio" name="orphans" checked={!deleteOrphans} onChange={() => setDeleteOrphans(false)} />Keep — link them elsewhere before saving</label><label><input type="radio" name="orphans" checked={deleteOrphans} onChange={() => setDeleteOrphans(true)} />Delete them too</label></section>}<button disabled={usedBy.length > 0} onClick={() => { store.delete(target.path, deleteOrphans); setDeleting(undefined); setSelection(""); }}>Delete draft</button></Dialog>}
    {renaming && <RenameDialog store={store} target={renaming} close={() => setRenaming(undefined)} renamed={path => { const inTree = renaming.kind === "treeBranch"; setRenaming(undefined); if (!inTree) { setScope("all"); setSelection(path); setQuery(""); } setHistoryKey(key => key + 1); }} />}
    {conflict && <Dialog title="File changed on disk" close={hideConflict}><p><code>{conflict.path}</code> has changed on disk. Your draft is retained.</p><div className="dialog-actions"><button disabled={store.moves.has(conflict.path) || [...store.moves.values()].includes(conflict.path)} title="For a pending file move, close this dialog and Undo the rename before reloading either filename." onClick={() => { store.resolve(conflict.path, "reload"); setHistoryKey((key) => key + 1); }}>Reload disk version</button><button onClick={() => { store.resolve(conflict.path, "mine"); hideConflict(); }}>Keep mine</button>{conflict.choice === "mine" && <button disabled={!canSave} onClick={() => { void save(true); }}>Overwrite with freshly checked hash</button>}</div></Dialog>}
  </div>;
}
createRoot(document.getElementById("studio-root")!).render(<Studio />);
