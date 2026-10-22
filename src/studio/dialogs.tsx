import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatContent } from "../content";
import type { Document } from "./documents";
import { kindLabels } from "./documents";
import { Field } from "./form";
import { entitySchemas, identityFields, initialValue } from "./schema";
import { StudioStore } from "./store";
export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="studio-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); close(); }}><div className="dialog-heading"><h2>{title}</h2><button onClick={close} aria-label="Close dialog">×</button></div>{children}</dialog>;
}
/** Callers can pass optional fields as prefill; the generic form retains and exposes them. */
export function CreateDialog({ store, kind: initialKind, prefill, duplicate, close, created }: {
  store: StudioStore; kind: string; prefill?: Record<string, unknown>; duplicate?: Document; close: () => void; created: (path: string) => void;
}) {
  const [kind, setKind] = useState(initialKind in entitySchemas ? initialKind : "items");
  const [raw, setRaw] = useState<unknown>(() => ({ ...(initialValue(entitySchemas[initialKind] ?? entitySchemas.items) as object), ...structuredClone(prefill ?? {}), ...(duplicate ? { id: "" } : {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const schema = entitySchemas[kind];
  const problems = store.createProblems(kind, raw, duplicate?.raw);
  const owner = { path: `content/${kind}/draft.json`, kind, raw, id: (raw as { id?: string })?.id ?? "", label: "Draft", formatted: "", hash: "", content: "", encoding: "utf8" } as Document;
  const nested = duplicate ? identityFields(schema, duplicate.raw).filter((field) => field.path !== "id") : [];
  return <Dialog title={duplicate ? "Duplicate entity" : "Create entity"} close={close}>
    <label>Kind<select aria-label="Create kind" value={kind} disabled={!!duplicate} onChange={(event) => { setKind(event.target.value); setRaw(initialValue(entitySchemas[event.target.value])); setErrors({}); }}>{Object.keys(entitySchemas).map((key) => <option key={key} value={key}>{kindLabels[key]}</option>)}</select></label>
    <p>Creates an unsaved draft. Complete its links and resolve registry diagnostics before saving.</p>
    {prefill && !duplicate && <p>Pre-filled values are included below and can be edited or unset.</p>}
    {!!nested.length && <section aria-label="IDs requiring replacement"><h3>Replace every nested ID</h3><ul>{nested.map((field) => <li key={field.path}><code>{field.path}</code>: {field.value}</li>)}</ul></section>}
    <Field schema={schema} value={raw} onChange={setRaw} path="" requiredOnly problems={problems} documents={store.view.documents} owner={owner} onError={(path, message) => setErrors((previous) => previous[path] === message ? previous : { ...previous, [path]: message })} />
    <p><code>content/{kind}/{owner.id || "<id>"}.json</code></p><pre aria-label="Create file preview">{formatContent(raw)}</pre>
    <div className="dialog-actions"><button onClick={close}>Cancel</button><button className="primary" disabled={problems.length > 0 || Object.values(errors).some(Boolean)} onClick={() => created(store.create(kind, raw, duplicate?.raw))}>Create draft</button></div>
  </Dialog>;
}
