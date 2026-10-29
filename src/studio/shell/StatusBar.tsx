export function StatusBar({ problemCount, unsaved, status, busy, refresh }: {
  problemCount: number; unsaved: number; status: string; busy: boolean; refresh: () => void;
}) {
  return <footer className="studio-status-bar">
    <div className="status-left">
      <span className={problemCount ? "error" : "ok"}>{problemCount ? `${problemCount} problems` : "✓ 0 problems"}</span>
      <span>{unsaved} unsaved files</span>
    </div>
    <div className="status-right">
      <span className="store-status">{status}</span>
      <button type="button" disabled={busy} onClick={refresh}>Refresh from disk</button>
      <a href="/" target="_blank" rel="noreferrer">Open game ↗</a>
      <span className="shortcut-hints">⌘S save · ⌘Z undo</span>
    </div>
  </footer>;
}
