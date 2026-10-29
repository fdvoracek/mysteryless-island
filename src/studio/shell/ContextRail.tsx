import type { ContentProblem } from "../../content";
import type { Document } from "../documents";
import { DOCUMENT_REFERENCE_KINDS, referenceLabel, type DocumentContext, type Identity, type Reference } from "../references";

type Props = {
  documents: Document[]; context: DocumentContext; definitions: Identity[]; problems: ContentProblem[];
  busy: boolean; openProblem: (file: string, path: string) => void; rename: (identity: Identity) => void;
};

export function ContextRail({ documents, context, definitions, problems, busy, openProblem, rename }: Props) {
  function incoming(ref: Reference, label?: string) {
    const source = documents.find(document => document.path === ref.file);
    const kind = source && DOCUMENT_REFERENCE_KINDS[source.kind];
    const sourceLabel = source ? referenceLabel(kind ?? source.kind, source.id, documents) : ref.file;
    return <button type="button" className="context-reference" key={`${ref.file}:${ref.path}`}
      onClick={() => openProblem(ref.file, ref.path)}>
      <span>{label ?? (sourceLabel === source?.id ? source.label : sourceLabel)}</span>
      <code>{ref.file} › {ref.path}</code>
    </button>;
  }
  return <aside className="context-rail" aria-label="Document context">
    <section><h3>Problems in this file</h3>
      {problems.length ? problems.map((problem, index) => <button type="button" className="context-reference"
        key={`${problem.path}:${index}`} onClick={() => openProblem(problem.file, problem.path)}>
        <code>{problem.path}</code> — {problem.message}
      </button>) : <p className="ok">✓ No problems</p>}
    </section>
    {!!context.linkedFrom.length && <section><h3>Linked from</h3>{context.linkedFrom.map(ref => incoming(ref, ref.label))}</section>}
    <section><h3>Referenced by</h3>{context.referencedBy.map((group, index) => group.name
      ? <section className="context-group" aria-label={`Used by ${group.name}`} key={group.name}>
        <h4>{group.name}</h4>{group.references.length ? group.references.map(ref => incoming(ref)) : <p className="context-empty">Not referenced</p>}
      </section>
      : <div key={index}>{group.references.length ? group.references.map(ref => incoming(ref))
        : <p className="context-empty">Not referenced</p>}</div>)}</section>
    <section><h3>Uses</h3>{context.uses.map(use => {
      const content = <><span>{referenceLabel(use.kind, use.id, documents)} · {use.kind}{!use.identity && " (unresolved)"}</span>
        <code>{use.paths.join(", ")}</code></>;
      const target = use.identity;
      return target ? <button type="button" className="context-reference" key={`${use.kind}:${use.id}:${target.file}`}
        onClick={() => openProblem(target.file, target.path)}>{content}</button>
        : <div className="context-reference" key={`${use.kind}:${use.id}`}>{content}</div>;
    })}
      {context.settingsUses.map(group => <div className="context-settings" key={group.kind}>
        <span className="context-empty">{group.kind}:</span>{" "}{group.uses.map((use, index) => {
          const target = use.identity;
          return <span key={use.id}>{index > 0 && <span className="context-empty"> · </span>}
            <button type="button" aria-label={`${use.id} · ${use.kind}`}
              onClick={() => { if (target) openProblem(target.file, target.path); }}>{use.id}</button>
          </span>;
        })}
      </div>)}
    </section>
    <section className="context-identities" aria-label="Rename identities"><h3>IDs</h3>{definitions.map(id => <div key={id.path}>
      <code>{id.path}: {id.id}</code><button type="button" disabled={busy || !!id.reserved} title={id.reserved}
        aria-label={`Rename ${id.path}`} onClick={() => rename(id)}>Rename ID…</button>
      {id.reserved && <span className="hint">{id.reserved}</span>}
    </div>)}</section>
  </aside>;
}
