import { useMemo } from "react";
import { Dialog } from "../dialogs";
import { fileDiff } from "../diff";
import type { StudioStore } from "../store";

function FileChange({ store, path, draft, open, discard }: {
  store: StudioStore; path: string; draft: string | null; open: (path: string) => void; discard: (path: string) => void;
}) {
  const from = [...store.moves].find(([, to]) => to === path)?.[0];
  const hash = store.disk.find(file => file.path === (from ?? path))?.hash;
  const moveTo = store.moves.get(path);
  const diff = useMemo(() => fileDiff(path, draft, store.disk, store.moves), [path, hash, draft, from, moveTo]);
  const allowed = store.canDiscard(path);
  return <section className="file-change" aria-label={path}>
    <div className="change-heading">
      <button type="button" className="change-path" onClick={() => open(from && draft === null ? from : path)}>
        {path.replace(/^content\//, "")}
      </button>
      <span className="change-status">{diff.status}</span>
      <button type="button" className="change-discard" aria-label={`Discard ${path}`} disabled={!allowed.ok || store.busy}
        title={allowed.ok ? undefined : allowed.reason} onClick={() => discard(path)}>Discard</button>
    </div>
    {diff.to && <p className="change-reason">moved to {diff.to.replace(/^content\//, "")}</p>}
    {diff.from && <p className="change-reason">renamed from {diff.from.replace(/^content\//, "")}</p>}
    {!allowed.ok && <p className="change-reason">{allowed.reason}</p>}
    <div className="change-diff" aria-label={`Diff ${path}`}>
      {diff.hunks.map((hunk, index) => <div className="diff-hunk" key={index}>
        {hunk.lines.map((line, number) => <div className={`diff-line ${line.kind}`} key={number}>
          <span className="diff-number">{line.before ?? ""}</span><span className="diff-number">{line.after ?? ""}</span>
          <span className="diff-sign">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span>
          <span className="diff-text">{line.text}</span>
        </div>)}
      </div>)}
      {!!diff.omitted && <p>… {diff.omitted} more lines</p>}
    </div>
  </section>;
}

export function ChangesDrawer({ store, canSave, problemCount, validating, close, open, discard, save }: {
  store: StudioStore; canSave: boolean; problemCount: number; validating: boolean; close: () => void;
  open: (path: string) => void; discard: (path: string) => void; save: () => void;
}) {
  const count = store.drafts.size, invalidInputs = store.inputErrors.size;
  return <Dialog title="Unsaved changes" close={close}>
    <div className="changes-drawer">
      <p className="changes-intro">Review before Save all. Discard per file.</p>
      {count ? [...store.drafts].sort(([a], [b]) => a.localeCompare(b)).map(([path, draft]) =>
        <FileChange key={path} store={store} path={path} draft={draft} open={open} discard={discard} />)
        : <p className="changes-empty">No unsaved changes</p>}
      <footer className="changes-footer">
        {!canSave && count > 0 && <p className="change-reason">{store.busy ? "Saving…" : validating ? "Validating…"
          : invalidInputs ? `Fix ${invalidInputs} invalid ${invalidInputs === 1 ? "input" : "inputs"} first`
          : problemCount ? `Fix ${problemCount} ${problemCount === 1 ? "problem" : "problems"} first` : "Saving is unavailable."}</p>}
        <button type="button" className="primary" disabled={!canSave} onClick={save}>
          Save all ({count} {count === 1 ? "file" : "files"})</button>
      </footer>
    </div>
  </Dialog>;
}
