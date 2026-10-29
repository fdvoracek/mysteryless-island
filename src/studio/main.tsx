import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ContentProblem } from "../content";
import { areaDocuments, defaultCreateKind, kindLabels, readDocuments } from "./documents";
import { StudioStore } from "./store";
import { entitySchemas, schemaFor } from "./schema";
import { FormContext, Field, fileContentsClass } from "./form";
import { JsonEditor } from "./json-editor";
import { readMode, rememberMode, type EditorMode } from "./editor-mode";
import { CreateDialog, Dialog, RenameDialog } from "./dialogs";
import { StoryView } from "./story-view";
import { EventEditor } from "./event-editor";
import { AreaWorkspace } from "./area-workspace";
import { identities, deletionReferences, referenceOptions, documentContext, type Identity } from "./references";
import { TreeEditor } from "./tree-editor";
import { MapEditor } from "./map-editor";
import { blockerLabel, deletionBlockers } from "./tree";
import { PreviewPanel } from "./preview-panel";
import { ChangesDrawer } from "./shell/ChangesDrawer";
import { TopBar } from "./shell/TopBar";
import { StatusBar } from "./shell/StatusBar";
import { ContextRail } from "./shell/ContextRail";
import { DocumentHeader } from "./shell/DocumentHeader";
import { Sidebar } from "./shell/Sidebar";
import { EntityList } from "./shell/EntityList";
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
  const [create, setCreate] = useState<{
    kind: string; duplicate?: string; areaPath?: string; prefill?: Record<string, unknown>;
    tree?: { branch: string; after: string[] };
  }>();
  const [renaming, setRenaming] = useState<Identity>();
  const [deleteOrphans, setDeleteOrphans] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [historyKey, setHistoryKey] = useState(0);
  const [changesOpen, setChangesOpen] = useState(false);
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
  const validationText = failure ? "Unavailable" : loaded ? validating ? "Validating…"
    : problemCount ? `${problemCount} ${problemCount === 1 ? "problem" : "problems"}` : "Valid · 0 problems" : "Loading…";
  function showDiagnostics() {
    const section = document.getElementById("diagnostics");
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: "start" });
  }
  const status = store.status || (loaded ? "Read from disk" : "Loading files…");
  async function refresh() {
    try { await store.refresh(); setLoaded(true); setFailure(""); }
    catch (error) { setFailure((error as Error).message); }
  }
  function closeChanges() {
    setChangesOpen(false);
    requestAnimationFrame(() => {
      const trigger = document.querySelector<HTMLButtonElement>(".unsaved-button");
      const search = document.querySelector<HTMLInputElement>(".search input");
      (trigger ?? search)?.focus();
    });
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
      if (event.key.toLowerCase() === "z" && !(event.target instanceof Element && event.target.closest(".cm-editor"))) {
        event.preventDefault(); if (event.shiftKey) redo(); else undo();
      }
    };
    const leave = (event: BeforeUnloadEvent) => { if (store.drafts.size) event.preventDefault(); void store.flushLayout(); };
    // Pins autosave after about a second; leaving or hiding the page writes them straight away.
    const hide = () => { if (document.visibilityState === "hidden") void store.flushLayout(); };
    window.addEventListener("keydown", keydown); window.addEventListener("beforeunload", leave); document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  });
  const area = documents.find((document) => `area:${document.id}` === scope);
  const candidates = area ? areaDocuments(documents, area) : documents.filter((document) => scope === "all" || document.kind === scope);
  const visible = candidates.filter((document) =>
    `${document.path} ${document.id} ${document.label} ${document.encoding === "utf8" ? document.content : ""}`
      .toLowerCase().includes(query.toLowerCase()));
  const deletedSelection = store.drafts.get(selection) === null
    ? readDocuments(store.disk.filter(document => document.path === selection), false).documents[0] : undefined;
  const selected = documents.find((document) => document.path === selection) ?? deletedSelection ?? visible[0];
  const selectedPath = selected?.path;
  const context = useMemo(() => {
    const document = documents.find(d => d.path === selectedPath);
    return document ? documentContext(documents, document) : undefined;
  }, [documents, selectedPath]);
  const definitions = useMemo(() => identities(documents).filter(id => id.file === selectedPath), [documents, selectedPath]);
  const rootIdentity = definitions.find(id => id.path === "id");
  const hasRail = !!selected && !!schemaFor(selected.path) && !["story", "trees", "map"].includes(scope);
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
  const usedBy = target ? [...deletionBlockers(documents, target),
    ...(deleteOrphans ? orphans.flatMap(d => deletionReferences(
      documents.filter(other => !removedPaths.has(other.path) || other.path === d.path), d)) : [])] : [];
  const conflict = [...store.conflicts.values()].find((entry) => !hiddenConflicts.includes(`${entry.path}:${entry.disk?.hash ?? "missing"}`));
  const hideConflict = () => { if (conflict) setHiddenConflicts((previous) => [...previous, `${conflict.path}:${conflict.disk?.hash ?? "missing"}`]); };
  const openCreated = (path: string) => {
    setCreate(undefined); setScope("all"); setQuery(""); setSelection(path); setMode("form", path);
    if (path.startsWith("content/regions/")) setScope(`area:${path.split("/").at(-1)!.slice(0, -5)}`);
  };
  return <div className="studio-shell">
    <TopBar unsaved={store.drafts.size} changesOpen={changesOpen} showChanges={() => setChangesOpen(true)}
      query={query} validation={validationText} problemCount={problemCount}
      canUndo={!!store.past.length && !store.busy} canRedo={!!store.future.length && !store.busy}
      canSave={canSave} busy={store.busy} previewOpen={previewOpen} search={setQuery}
      showDiagnostics={showDiagnostics} undo={undo} redo={redo} save={() => { void save(); }}
      create={() => setCreate({ kind: defaultCreateKind(scope, selected) })} togglePreview={() => setPreviewOpen(open => !open)} />
    {store.status && <p className="save-report" role="log">{store.status}</p>}
    {failure && <div role="alert" className="request-error">{failure}. Refresh to try again.</div>}
    <div className={`studio-body${previewOpen ? " preview-open" : ""}`}>
    <div className="studio-columns">
      <Sidebar documents={documents} scope={scope} browse={browse}
        openArea={document => { browse(`area:${document.id}`); setSelection(document.path); }}
        newArea={() => setCreate({ kind: "regions" })} />
      {!["story", "trees", "map"].includes(scope) && <EntityList documents={documents} visible={visible}
        selectedPath={selected?.path} scope={scope} area={area} drafts={store.drafts} diagnostics={diagnostics}
        empty={files.length ? "No files match this search." : status}
        select={path => { setSelection(path); setField(""); }} create={setCreate} />}
      <main className={`document-panel${["story", "trees", "map"].includes(scope) ? " story-panel" : ""}${hasRail ? " has-context" : ""}`}>
        {scope === "story" ? <StoryView store={store} documents={documents} open={openProblem}
          create={(kind, prefill) => setCreate({ kind, prefill })} />
          : scope === "trees" ? <TreeEditor documents={documents} edit={(path, raw) => store.edit(path, raw)}
            open={openProblem} rename={setRenaming} newHere={(kind, tree) => setCreate({ kind, tree })} />
          : scope === "map" ? <MapEditor documents={documents} problems={diagnostics} edit={(path, raw) => store.edit(path, raw)}
            open={path => { const id = documents.find(d => d.path === path)?.id; if (id) browse(`area:${id}`); }} />
          : selected ? <div className="document-editor">
          <DocumentHeader kind={kindLabels[selected.kind] ?? selected.kind} id={selected.id}
            title={selected.label} path={selected.path} unsaved={store.drafts.has(selected.path)}
            hasSchema={!!selectedSchema} mode={mode} entity={!!entitySchemas[selected.kind]} busy={store.busy} rootIdentity={rootIdentity} rename={setRenaming}
            browseKind={() => browse(selected.kind)} setMode={setMode}
            duplicate={() => setCreate({ kind: selected.kind, duplicate: selected.path })}
            remove={() => { setDeleteOrphans(false); setDeleting(selected.path); }} />
          <section className={fileContentsClass(selectedSchema, mode, selected.raw,
            Boolean(selectedSchema && selected.raw !== undefined && (selected.kind === "regions" || selected.kind === "events")))}
            aria-label="File contents"><div className="json-heading">
              <h3>{selected.encoding === "utf8"
                ? mode === "form" && selected.raw !== undefined ? "Content form" : "JSON" : "Image file"}</h3></div>
            {field && <p className="field-location">Field: <code>{field}</code></p>}
            {deletedSelection ? <pre tabIndex={0} ref={source} aria-label="Read-only file contents">{selected.formatted}</pre>
              : selectedSchema && selected.encoding === "utf8" && (mode === "json" || selected.raw === undefined)
              ? <JsonEditor key={selected.path} path={selected.path}
                text={store.buffersFor(selected.path)[""]?.text ?? (store.drafts.has(selected.path) ? selected.content : selected.formatted)}
                schema={selectedSchema} problems={diagnostics.filter((p) => p.file === selected.path)}
                references={(kind, path) => referenceOptions(kind, documents, selected, path)} readOnly={store.busy} reveal={field}
                onEdit={(text) => store.editJson(selected.path, text)} onSettle={() => store.endTyping()}
                onProblem={(message) => store.setJsonProblem(selected.path, message)} />
              : selectedSchema && selected.raw !== undefined
                ? <fieldset disabled={store.busy} className="editor-fields" key={`${selected.path}:${historyKey}`}>
              <FormContext.Provider value={{ documents, owner: selected, problems: diagnostics.filter(p => p.file === selected.path),
                buffers: store.buffersFor(selected.path), lockId: true,
                onError: (path, message, buffer) => store.error(selected.path, path, message, buffer) }}>
              {selected.kind === "regions"
                ? <AreaWorkspace schema={selectedSchema} value={selected.raw} path="" onChange={raw => store.edit(selected.path, raw)}
                  open={openProblem} newActivity={() => setCreate({ kind: "activities", areaPath: selected.path })} />
                : selected.kind === "events"
                  ? <EventEditor schema={selectedSchema} value={selected.raw} path="" onChange={raw => store.edit(selected.path, raw)}
                    rename={setRenaming} />
                  : <Field schema={selectedSchema} value={selected.raw} path="" onChange={(raw) => store.edit(selected.path, raw)} />}
              </FormContext.Provider>
            </fieldset> : <pre tabIndex={0} ref={source} aria-label="Read-only file contents">{selected.encoding === "utf8"
              ? selected.formatted : `${selected.path}\nencoding: base64\nsha256: ${selected.hash}`}</pre>}
          </section>
        </div> : <h2>Content browser</h2>}
        {hasRail && context && <ContextRail documents={documents} context={context} definitions={definitions}
          problems={diagnostics.filter(problem => problem.file === selectedPath)} busy={store.busy}
          openProblem={openProblem} rename={setRenaming} />}
        <section className="diagnostics" id="diagnostics" aria-label="Diagnostics" tabIndex={-1}><h2>Diagnostics <span>{diagnostics.length}</span></h2>
          {files.length > 0 && !diagnostics.length && <p className="ok">All content passes the shared registry validation.</p>}
          {diagnostics.length > 0 && <ul>{diagnostics.map((problem, index) => <li key={`${problem.file}:${problem.path}:${index}`}>
            {documents.some((document) => document.path === problem.file)
              ? <button className="problem-link" onClick={() => openProblem(problem.file, problem.path)}>
                <code>{problem.file}{problem.path && ` › ${problem.path}`}</code></button> : <code>{problem.file || "Content pack"}</code>}
            <p>{problem.message}</p>
          </li>)}</ul>}
        </section>
      </main>
    </div>
    {previewOpen && <PreviewPanel store={store} canSave={canSave} save={() => { void save(); }}
      showDiagnostics={() => document.getElementById("diagnostics")?.scrollIntoView({ block: "start" })} />}
    </div>
    <StatusBar problemCount={problemCount} unsaved={store.drafts.size} status={status} busy={store.busy}
      refresh={() => { void refresh(); }} />
    {changesOpen && <ChangesDrawer store={store} canSave={canSave} problemCount={problemCount} validating={validating}
      close={closeChanges} open={path => { closeChanges(); openProblem(path, ""); }}
      discard={path => { store.discard(path); setHistoryKey(key => key + 1); }} save={() => { void save(); }} />}
    {create && <CreateDialog store={store} kind={create.kind} areaPath={create.areaPath} tree={create.tree}
      duplicate={documents.find((d) => d.path === create.duplicate)}
      prefill={create.prefill ?? documents.find((d) => d.path === create.duplicate)?.raw as Record<string, unknown> | undefined}
      close={() => setCreate(undefined)} created={openCreated} />}
    {target && <Dialog title="Delete entity" close={() => setDeleting(undefined)}><p>{usedBy.length
      ? "Delete blocked: this entity is used by:" : "Stage deletion of this entity? Save all applies the deletion after pack validation."}</p>
      <ul>{usedBy.map((ref) => <li key={`${ref.file}:${ref.path}`}><code>{blockerLabel(documents, ref)}</code></li>)}</ul>
      {!!orphans.length && <section aria-label="Activities left without an area"><h3>Activities left without an area</h3>
        <ul>{orphans.map(d => <li key={d.path}>{d.id}</li>)}</ul>
        <label><input type="radio" name="orphans" checked={!deleteOrphans} onChange={() => setDeleteOrphans(false)} />
          Keep — link them elsewhere before saving</label>
        <label><input type="radio" name="orphans" checked={deleteOrphans} onChange={() => setDeleteOrphans(true)} />Delete them too</label></section>}
      <button disabled={usedBy.length > 0}
        onClick={() => { store.delete(target.path, deleteOrphans); setDeleting(undefined); setSelection(""); }}>Delete draft</button></Dialog>}
    {renaming && <RenameDialog store={store} target={renaming} close={() => setRenaming(undefined)} renamed={path => {
      const inTree = renaming.kind === "treeBranch";
      setRenaming(undefined);
      if (!inTree) { setScope("all"); setSelection(path); setQuery(""); }
      setHistoryKey(key => key + 1);
    }} />}
    {conflict && <Dialog title="File changed on disk" close={hideConflict}>
      <p><code>{conflict.path}</code> has changed on disk. Your draft is retained.</p>
      <div className="dialog-actions">
        <button disabled={store.moves.has(conflict.path) || [...store.moves.values()].includes(conflict.path)}
          title="For a pending file move, close this dialog and Undo the rename before reloading either filename."
          onClick={() => { store.resolve(conflict.path, "reload"); setHistoryKey((key) => key + 1); }}>Reload disk version</button>
        <button onClick={() => { store.resolve(conflict.path, "mine"); hideConflict(); }}>Keep mine</button>
        {conflict.choice === "mine" && <button disabled={!canSave}
          onClick={() => { void save(true); }}>Overwrite with freshly checked hash</button>}</div></Dialog>}
  </div>;
}
createRoot(document.getElementById("studio-root")!).render(<Studio />);
