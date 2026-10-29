import type { Identity } from "../references";
import type { EditorMode } from "../editor-mode";
import { MoreMenu } from "./MoreMenu";

type DocumentHeaderProps = {
  rootIdentity?: Identity; rename?: (identity: Identity) => void;
  kind: string; id: string; title: string; path: string; unsaved: boolean; hasSchema: boolean;
  mode: EditorMode; entity: boolean; busy: boolean; browseKind: () => void;
  setMode: (mode: EditorMode) => void; duplicate: () => void; remove: () => void;
};

export function DocumentHeader(props: DocumentHeaderProps) {
  return <header className="document-heading">
    <div className="document-identity">
      <p className="breadcrumb"><button type="button" className="link" onClick={props.browseKind}>{props.kind}</button> › <code>{props.id}</code></p>
      <h2>{props.title}{props.unsaved && <span className="unsaved-badge">Unsaved</span>}</h2>
      <code>{props.path}</code>
    </div>
    <div className="document-actions">
      {props.hasSchema && <div className="mode-switch">
        <button type="button" aria-pressed={props.mode === "form"} onClick={() => props.setMode("form")}>Form</button>
        <button type="button" aria-pressed={props.mode === "json"} onClick={() => props.setMode("json")}>JSON</button>
      </div>}
      {props.entity && <MoreMenu key={props.path} busy={props.busy} duplicate={props.duplicate} remove={props.remove}
        rootIdentity={props.rootIdentity} rename={id => props.rename?.(id)} />}
    </div>
  </header>;
}
