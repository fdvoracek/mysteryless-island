import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { areaDocuments, kindLabels, readDocuments, type FileDocument } from "./documents";
import "./studio.css";

function Studio() {
  const [loaded, setLoaded] = useState(false);
  const requestId = useRef(0);
  const [files, setFiles] = useState<FileDocument[]>([]);
  const [status, setStatus] = useState("Loading files…");
  const [failure, setFailure] = useState("");
  const [selection, setSelection] = useState("");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const source = useRef<HTMLPreElement>(null);
  const { documents, diagnostics } = useMemo(() => loaded ? readDocuments(files) : { documents: [], diagnostics: [] }, [files, loaded]);
  async function refresh(signal?: AbortSignal) {
    const id = ++requestId.current;
    setStatus("Reading files…");
    try {
      const response = await fetch("/__studio/files", { signal, cache: "no-store" });
      const hint = `Open http://127.0.0.1:${window.location.port || "80"}/studio/`;
      if (response.status === 403) throw new Error(hint);
      let result: { files: FileDocument[]; error?: string };
      try { result = await response.json(); }
      catch { throw new Error(hint); }
      if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
      if (id !== requestId.current) return;
      setFiles(result.files); setLoaded(true); setFailure(""); setStatus("Read from disk");
    } catch (error) {
      if (id === requestId.current && (error as Error).name !== "AbortError") { setFailure((error as Error).message); setStatus("Could not read files"); }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const reload = () => { void refresh(controller.signal); };
    window.addEventListener("focus", reload);
    import.meta.hot?.on("studio:files-changed", reload);
    return () => { controller.abort(); window.removeEventListener("focus", reload); import.meta.hot?.off("studio:files-changed", reload); };
  }, []);
  const area = documents.find((document) => `area:${document.id}` === scope);
  const candidates = area ? areaDocuments(documents, area) : documents.filter((document) => scope === "all" || document.kind === scope);
  const visible = candidates.filter((document) => `${document.path} ${document.id} ${document.label} ${document.encoding === "utf8" ? document.content : ""}`.toLowerCase().includes(query.toLowerCase()));
  const selected = documents.find((document) => document.path === selection) ?? visible[0];
  const kinds = Object.keys(kindLabels).filter((kind) => documents.some((document) => document.kind === kind));
  const areas = documents.filter((document) => document.kind === "regions");
  function browse(value: string) { setScope(value); setSelection(""); setField(""); setQuery(""); }
  function openProblem(file: string, path: string) {
    setScope("all"); setQuery(""); setSelection(file); setField(path);
    requestAnimationFrame(() => source.current?.focus());
  }
  return <div className="studio-shell">
    <header className="studio-header">
      <a className="brand" href="/studio/">Mysteryless Island <span>Studio</span></a>
      <label className="search">Search content<input type="search" placeholder="IDs, names, text…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="header-actions"><span className={diagnostics.length ? "validation error" : "validation ok"} role="status">{failure ? "Unavailable" : loaded ? diagnostics.length ? `${diagnostics.length} ${diagnostics.length === 1 ? "problem" : "problems"}` : "Valid · 0 problems" : "Loading…"}</span>
        <button onClick={() => { void refresh(); }}>Refresh from disk</button><a href="/" target="_blank" rel="noreferrer">Open game ↗</a></div>
    </header>
    {failure && <div role="alert" className="request-error">{failure}. Refresh to try again.</div>}
    <div className="studio-columns">
      <nav className="studio-nav" aria-label="Content navigation">
        <h2>Browse</h2><button aria-current={scope === "all" ? "page" : undefined} onClick={() => browse("all")}>All files <span>{documents.length}</span></button>
        <h2>By area</h2>{areas.map((document) => <button key={document.path} aria-current={scope === `area:${document.id}` ? "page" : undefined} onClick={() => browse(`area:${document.id}`)}>{document.id}</button>)}
        <h2>By kind</h2>{kinds.map((kind) => <button key={kind} aria-current={scope === kind ? "page" : undefined} onClick={() => browse(kind)}>{kindLabels[kind]}<span>{documents.filter((document) => document.kind === kind).length}</span></button>)}
      </nav>
      <section className="entity-list" aria-label="Entity list">
        <div className="list-heading"><h1>{area ? area.label : kindLabels[scope] ?? "All files"}</h1><p>{visible.length} files{area && " · area and available activities"}</p></div>
        {visible.map((document) => <button key={document.path} aria-pressed={selected?.path === document.path} onClick={() => { setSelection(document.path); setField(""); }}><strong>{document.label}</strong><code>{document.id}</code><small>{kindLabels[document.kind] ?? document.kind}{diagnostics.some((problem) => problem.file === document.path) ? " · has problems" : ""}</small></button>)}
        {!visible.length && <p className="empty">{files.length ? "No files match this search." : status}</p>}
      </section>
      <main className="document-panel">
        {selected ? <>
          <div className="document-heading"><div><p>{kindLabels[selected.kind] ?? selected.kind} / {selected.id}</p><h2>{selected.label}</h2><code>{selected.path}</code></div><span className="badge">Read-only</span></div>
          <section className="json-panel" aria-label="File contents"><div className="json-heading"><h3>{selected.encoding === "utf8" ? "Formatted JSON" : "Image file"}</h3><span>{status}</span></div>
            {field && <p className="field-location">Field: <code>{field}</code></p>}
            <pre tabIndex={0} ref={source} aria-label="Read-only file contents">{selected.encoding === "utf8" ? selected.formatted : `${selected.path}\nencoding: base64\nsha256: ${selected.hash}`}</pre>
          </section>
        </> : <h2>Content browser</h2>}
        <section className="diagnostics" aria-label="Diagnostics"><h2>Diagnostics <span>{diagnostics.length}</span></h2>
          {files.length > 0 && !diagnostics.length && <p className="ok">All content passes the shared registry validation.</p>}
          {diagnostics.length > 0 && <ul>{diagnostics.map((problem, index) => <li key={`${problem.file}:${problem.path}:${index}`}>
            {documents.some((document) => document.path === problem.file) ? <button className="problem-link" onClick={() => openProblem(problem.file, problem.path)}><code>{problem.file}{problem.path && ` › ${problem.path}`}</code></button> : <code>{problem.file || "Content pack"}</code>}
            <p>{problem.message}</p>
          </li>)}</ul>}
        </section>
      </main>
    </div>
  </div>;
}
createRoot(document.getElementById("studio-root")!).render(<Studio />);
