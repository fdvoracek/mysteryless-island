type TopBarProps = {
  query: string; validation: string; problemCount: number; canUndo: boolean; canRedo: boolean;
  unsaved?: number; changesOpen?: boolean; showChanges?: () => void;
  canSave: boolean; busy: boolean; previewOpen: boolean;
  search: (value: string) => void; showDiagnostics: () => void; undo: () => void; redo: () => void;
  save: () => void; create: () => void; togglePreview: () => void;
};

export function TopBar(props: TopBarProps) {
  return <header className="studio-header">
    <a className="brand" href="/studio/">Mysteryless Island <span>Studio</span></a>
    <label className="search"><span className="visually-hidden">Search content</span>
      <input type="search" placeholder="IDs, names, text…" value={props.query} onChange={event => props.search(event.target.value)} />
    </label>
    <div className="header-actions">
      <button type="button" className={props.problemCount ? "validation error" : "validation ok"}
        aria-label={props.validation} onClick={props.showDiagnostics}>
        <span role="status">{props.validation}</span>
      </button>
      {(!!props.unsaved || props.changesOpen) && <button type="button" className="unsaved-button"
        aria-label={`${props.unsaved ?? 0} unsaved changes`} aria-expanded={!!props.changesOpen}
        onClick={props.showChanges}>{props.unsaved ?? 0} unsaved</button>}
      <button type="button" aria-label="Undo" title="Undo ⌘Z / Ctrl+Z" disabled={!props.canUndo} onClick={props.undo}>↶</button>
      <button type="button" aria-label="Redo" title="Redo ⇧⌘Z / Ctrl+Shift+Z" disabled={!props.canRedo} onClick={props.redo}>↷</button>
      <button type="button" className="primary" disabled={!props.canSave} onClick={props.save}>Save all</button>
      <button type="button" disabled={props.busy} onClick={props.create}>Create</button>
      <button type="button" aria-expanded={props.previewOpen} aria-controls="preview-panel" onClick={props.togglePreview}>Preview</button>
    </div>
  </header>;
}
