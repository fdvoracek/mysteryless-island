import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";
import { friendlyProblems, fieldSchema } from "./issues";
import { suggestId, takenIds } from "./id-suggest";
import { hintFor, humanize } from "./hints";
import { getAt } from "./references";
import { formatContent } from "../content";
import type { Document } from "./documents";
import { kindLabels } from "./documents";
import { Field, FormContext } from "./form";
import { entitySchemas, identityFields, initialValue, schemaFor, stripComments, unwrap, visitValue } from "./schema";
import { renamePlan } from "./rename";
import { StudioStore } from "./store";
export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="studio-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); close(); }}><div className="dialog-heading"><h2>{title}</h2><button onClick={close} aria-label="Close dialog">×</button></div>{children}</dialog>;
}
/** Callers can pass optional fields as prefill; the generic form retains and exposes them. */
export function CreateDialog({ store, kind: initialKind, prefill, duplicate, areaPath, tree, close, created }: {
  store: StudioStore; kind: string; areaPath?: string; tree?: { branch: string; after: string[] }; prefill?: Record<string, unknown>; duplicate?: Document; close: () => void; created: (path: string) => void;
}) {
  const [kind, setKind] = useState(initialKind in entitySchemas ? initialKind : "items");
  const [raw, setRaw] = useState<unknown>(() => ({ ...(initialValue(entitySchemas[initialKind] ?? entitySchemas.items) as object), ...structuredClone(prefill ?? {}), ...(duplicate ? { id: "" } : {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [following, setFollowing] = useState(!prefill?.id || !!duplicate);
  const followingRef = useRef(following);
  const [suggested, setSuggested] = useState(false);
  const fields = useRef<HTMLDivElement>(null);
  const [idHost, setIdHost] = useState<Element | null>(null);
  const schema = entitySchemas[kind];
  const shape = unwrap(schema);
  const nameField = shape instanceof z.ZodObject && shape.shape.id
    ? ["name", "title", "label"].find(key => key in shape.shape) : undefined;
  const nameLabel = nameField && (hintFor(schema, nameField)?.label ?? humanize(nameField));
  useEffect(() => { setIdHost(fields.current?.querySelector('[data-field="id"]') ?? null); }, [kind]);
  const touch = (target: EventTarget, changed: boolean) => {
    if (!(target instanceof HTMLElement)) return;
    const path = target.closest<HTMLElement>("[data-field]")?.dataset.field;
    if (!path) return;
    setTouched(previous => new Set(previous).add(path));
    if (changed && path === "id") { followingRef.current = false; setFollowing(false); }
  };
  const change = (next: unknown) => {
    if (followingRef.current && nameField && getAt(next, nameField) !== getAt(raw, nameField)) {
      next = { ...next as object, id: suggestId(String(getAt(next, nameField) ?? ""), takenIds(store.view.documents)) };
      setSuggested(true);
    }
    setRaw(next);
  };
  const problems = store.createProblems(kind, raw, duplicate?.raw);
  const parsed = schema.safeParse(stripComments(raw));
  const withIssues = problems.map(problem => ({ ...problem, issue: parsed.success ? undefined
    : parsed.error.issues.find(issue => issue.path.join(".") === problem.path && issue.message === problem.message) }));
  const readable = friendlyProblems(withIssues, schema).map(problem => {
    if (problem.path.split(".").at(-1) !== "id") return problem;
    const value = getAt(raw, problem.path);
    const owners = store.view.documents.flatMap(document => {
      const node = schemaFor(document.path);
      return node ? identityFields(node, document.raw).filter(field => field.value === value)
        .map(field => ({ document, root: field.path === "id" })) : [];
    });
    const usedBy = (owners.find(owner => owner.root) ?? owners[0])?.document;
    return usedBy ? { ...problem, message: `Use lowercase letters, digits and _ — already used by ${kindLabels[usedBy.kind]?.toLowerCase() ?? usedBy.kind} ${usedBy.label}.` } : problem;
  });
  const visible = readable.filter(problem => [...touched].some(path => problem.path === path || problem.path.startsWith(`${path}.`)));
  const blocked = problems.length > 0 || Object.values(errors).some(Boolean);
  const labelFor = (path: string) => {
    const parts = path.split("."), key = parts.pop()!;
    const parent = fieldSchema(schema, parts.join("."));
    return parent && hintFor(parent, key)?.label || humanize(key);
  };
  const fieldOrder: string[] = [];
  visitValue(schema, raw, ({ path }) => { if (path && !fieldOrder.includes(path)) fieldOrder.push(path); });
  const missing = [...new Set([...problems.map(problem => problem.path), ...Object.keys(errors).filter(path => errors[path])])]
    .sort((a, b) => fieldOrder.indexOf(a) - fieldOrder.indexOf(b)).map(labelFor);
  const owner = { path: `content/${kind}/draft.json`, kind, raw, id: (raw as { id?: string })?.id ?? "", label: "Draft", formatted: "", hash: "", content: "", encoding: "utf8" } as Document;
  const nested = duplicate ? identityFields(schema, duplicate.raw).filter((field) => field.path !== "id") : [];
  return <Dialog title={duplicate ? "Duplicate entity" : "Create entity"} close={close}>
    <label>Kind<select aria-label="Create kind" value={kind} disabled={!!duplicate || !!areaPath || !!tree} onChange={(event) => { setKind(event.target.value); setRaw(initialValue(entitySchemas[event.target.value])); setErrors({}); setTouched(new Set()); followingRef.current = true; setFollowing(true); setSuggested(false); }}>{Object.keys(entitySchemas).map((key) => <option key={key} value={key}>{kindLabels[key]}</option>)}</select></label>
    <p>Creates an unsaved draft. Complete its links and resolve registry diagnostics before saving.</p>
    {tree && <p>Also stages its creation-tree node: branch <code>{tree.branch}</code>{tree.after.length ? <>, after <code>{tree.after.join(", ")}</code></> : ", no prerequisites"}.</p>}
    {prefill && !duplicate && <p>Pre-filled values are included below and can be edited or unset.</p>}
    {!!nested.length && <section aria-label="IDs requiring replacement"><h3>Replace every nested ID</h3><ul>{nested.map((field) => <li key={field.path}><code>{field.path}</code>: {field.value}</li>)}</ul></section>}
    <FormContext.Provider value={{ documents: store.view.documents, owner, problems: visible, requiredOnly: true,
      onError: (path, message) => setErrors(previous => previous[path] === message ? previous : { ...previous, [path]: message }) }}>
      <div ref={fields} onBlurCapture={event => touch(event.target, false)}
        onChangeCapture={event => touch(event.target, true)}>
        <Field key={kind} schema={schema} value={raw} onChange={change} path="" />
      </div>
      {idHost && following && suggested && nameLabel && createPortal(<small className="create-id-hint">Suggested from {nameLabel} — edit to change.</small>, idHost)}
    </FormContext.Provider>
    <p><code>content/{kind}/{owner.id || "<id>"}.json</code></p><pre aria-label="Create file preview">{formatContent(raw)}</pre>
    <div className="dialog-actions"><button onClick={close}>Cancel</button><button className="primary" disabled={blocked} onClick={() => created(areaPath ? store.createInArea(areaPath, kind, raw) : tree ? store.createWithTreeNode(kind, raw, tree) : store.create(kind, raw, duplicate?.raw))}>Create draft</button></div>
    {blocked && <p className="create-needed">Still needed: {[...new Set(missing)].join(", ")}</p>}
  </Dialog>;
}

export function RenameDialog({ store, target, close, renamed }: {
  store: StudioStore; target: import("./references").Identity; close: () => void; renamed: (path: string) => void;
}) {
  const [id, setId] = useState("");
  let plan: ReturnType<typeof renamePlan> | undefined, error = "";
  try { plan = renamePlan(store.view.documents, target.file, target.path, id); } catch (failure) { error = (failure as Error).message; }
  return <Dialog title="Rename ID" close={close}><p><code>{target.file} › {target.path}</code>: {target.id}</p>
    <label>New ID<input aria-label="New ID" value={id} onChange={event => setId(event.target.value)} /></label>
    <p className="warning">Existing game saves lose progress tied to the old ID. The game drops unknown references when loading.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {plan && <section aria-label="Rename preview"><h3>Files and fields that change</h3><ul>{plan.changes.map(change => <li key={`${change.file}:${change.path}`}><code>{change.file} › {change.path}</code>{change.key && " (record key)"}: {target.id} → {id}</li>)}</ul>{plan.move && <p>File rename: <code>{plan.move.from} → {plan.move.to}</code></p>}<p>Stages one undoable draft operation. Save all validates and saves the complete pack.</p></section>}
    <div className="dialog-actions"><button onClick={close}>Cancel</button><button className="primary" disabled={!plan || store.busy || store.inputErrors.size > 0} onClick={() => { try { renamed(store.rename(target.file, target.path, id)); } catch (failure) { store.status = (failure as Error).message; store.notify(); } }}>Stage rename</button></div>
  </Dialog>;
}
