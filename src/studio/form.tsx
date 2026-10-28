import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import type { ContentProblem } from "../content";
import type { JsonBuffer } from "./store";
import type { Document } from "./documents";
import { branchFor, branchLabel, branches, initialValue, refKind, unwrap, type Schema } from "./schema";
import { registerWidgets } from "./widgets";
import { referenceLabel, referenceOptions } from "./references";
import { hintFor, humanize, sectionsFor, schemaName, type FieldHint } from "./hints";
import { summarize } from "./summary";
import { readSections, rememberSection } from "./section-prefs";

export interface FieldProps {
  schema: Schema; value: unknown; onChange: (value: unknown) => void; path: string;
  problems: ContentProblem[]; documents: Document[]; owner: Document;
  buffers?: Record<string, JsonBuffer>;
  presentation?: { schema: Schema; path: string; hint?: FieldHint; rowMember?: boolean };
  onError: (path: string, message: string, buffer?: JsonBuffer) => void; depth?: number; requiredOnly?: boolean; lockId?: boolean; skipWidget?: boolean; ruleDepth?: number;
}
export type Widget = (props: FieldProps) => ReactNode;
/** Extensions bind to schema objects or reference kinds, never incidental field names. */
export const widgetRegistry = {
  nodes: new Map<Schema, Widget>(),
  references: new Map<string, Widget>(),
};
function schemaWidget(schema: Schema): Widget | undefined {
  const seen = new Set<Schema>();
  while (!seen.has(schema)) {
    seen.add(schema);
    const widget = widgetRegistry.nodes.get(schema);
    if (widget) return widget;
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) schema = schema._def.innerType;
    else if (schema instanceof z.ZodEffects) schema = schema._def.schema;
    else if (schema instanceof z.ZodLazy) schema = unwrap(schema);
    else break;
  }
  return undefined;
}
const recordValue = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function RawField({ value, onChange, path, onError, buffers }: FieldProps) {
  const serial = JSON.stringify(value, null, 2) ?? "";
  const [text, setText] = useState(buffers?.[path]?.text ?? serial);
  const [error, setError] = useState(() => {
    if (!buffers?.[path]) return "";
    try { JSON.parse(buffers[path].text); return ""; } catch (failure) { return (failure as Error).message; }
  });
  const previous = useRef(serial);
  useEffect(() => {
    if (previous.current !== serial) { previous.current = serial; setText(serial); setError(""); onError(path, ""); }
  }, [serial]); // Syntax-invalid buffers survive navigation until their underlying value changes.
  return <><textarea aria-label={path || "JSON document"} spellCheck={false} value={text} rows={Math.min(20, Math.max(3, text.split("\n").length))} onChange={(event) => {
    const next = event.target.value; setText(next);
    try { const raw = JSON.parse(next); setError(""); onError(path, ""); onChange(raw); }
    catch (failure) { const message = (failure as Error).message; setError(message); onError(path, message, { text: next, source: serial }); }
  }} />{error && <p className="error" role="alert">{error}</p>}</>;
}
function ReferenceField(props: FieldProps) {
  const options = referenceOptions(refKind(props.schema)!, props.documents, props.owner, props.path);
  const value = typeof props.value === "string" ? props.value : "";
  if (refKind(props.schema) === "flag") return <><input aria-label={props.path} value={value} onChange={event => props.onChange(event.target.value)} /><select aria-label={`${props.path} existing flag`} value={options.includes(value) ? value : ""} onChange={event => props.onChange(event.target.value)}><option value="">Choose an existing flag…</option>{options.map(id => <option key={id} value={id}>{id}</option>)}</select></>;
  return <select aria-label={props.path} value={value} onChange={(event) => props.onChange(event.target.value)}>
    <option value="">Choose a reference…</option>{value && !options.includes(value) && <option value={value}>{value} (unresolved)</option>}
    {options.map((id) => <option key={id} value={id}>{referenceLabel(refKind(props.schema)!, id, props.documents)}</option>)}
  </select>;
}
function SectionCard({ name, title, preview, count, children }: { name?: string; title: string; preview: string; count: number; children: ReactNode }) {
  // This prop stays constant after mount: subsequent native/programmatic toggles belong to the DOM.
  const [initialOpen] = useState(() => !name || !readSections(name).includes(title));
  return <details className="form-section" open={initialOpen}>
    <summary className="form-section-summary" onClick={event => {
      event.preventDefault();
      const details = event.currentTarget.parentElement as HTMLDetailsElement;
      details.open = !details.open;
      if (name) rememberSection(name, title, !details.open);
    }}><strong>{title}</strong>{count > 0 && <span className="form-section-problems">{count} {count === 1 ? "problem" : "problems"}</span>}<span className="form-section-preview">{preview}</span></summary>
    <div className="form-section-body object-fields">{children}</div>
  </details>;
}
function AuthorNote({ name, value, change }: { name: string; value: string; change: (value: string) => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = area.current;
    if (element) { element.style.height = "auto"; element.style.height = `${element.scrollHeight}px`; }
  }, [value]);
  return <div className="author-note" data-field={name}><div>Note <code>{name}</code></div><textarea ref={area} aria-label={name} rows={1} value={value} onChange={event => change(event.target.value)} /></div>;
}
export function Field(props: FieldProps) {
  const { schema, value, onChange, path, problems, depth = 0 } = props;
  const id = useId();
  const node = unwrap(schema), kind = refKind(schema);
  const presentation = props.presentation?.path === path && props.presentation.schema === schema ? props.presentation : undefined;
  const hint = presentation?.hint;
  const key = path.split(".").at(-1) ?? "";
  const label = hint?.label ?? humanize(key);
  const child = (childSchema: Schema, childValue: unknown, childPath: string, change: (value: unknown) => void, key?: string, presentation?: FieldProps["presentation"]) => <Field key={key ?? childPath} {...props} schema={childSchema} value={childValue} path={childPath} onChange={change} depth={depth + 1} skipWidget={false} presentation={presentation} />;
  const issue = problems.filter((problem) => problem.path === path);
  let control: ReactNode;
  const widget = props.skipWidget ? undefined : schemaWidget(schema) ?? (kind ? widgetRegistry.references.get(kind) : undefined);
  const unset = value === undefined && schema.isOptional();
  let scalar = !widget && (Boolean(kind) || depth <= 16 && (node instanceof z.ZodString || node instanceof z.ZodNumber || node instanceof z.ZodBoolean || node instanceof z.ZodEnum || node instanceof z.ZodNativeEnum || node instanceof z.ZodLiteral));
  if (unset) control = <button className="optional-chip" type="button" aria-label={`Add ${key}`} onClick={() => onChange(initialValue(schema))}>+ {label}</button>;
  else if (widget) { const Component = widget; control = <Component {...props} />; }
  else if (kind) control = <ReferenceField {...props} />;
  else if (depth > 16) control = <RawField {...props} />;
  else if (branches(node).length) {
    const options = branches(node), index = branchFor(node, value);
    const discriminator = node instanceof z.ZodDiscriminatedUnion ? node.discriminator : undefined;
    control = <div className="union-field"><label>{discriminator ? `Kind (${discriminator})` : "Value type"}<select aria-label={`${path || "root"} kind`} value={index} onChange={(event) => onChange(initialValue(options[Number(event.target.value)]))}>
      {options.map((option, i) => <option key={i} value={i}>{branchLabel(option, i)}</option>)}
    </select></label>{child(options[index], value, path, onChange, `branch-${index}`)}</div>;
  } else if (node instanceof z.ZodObject && (value === null || typeof value !== "object" || Array.isArray(value))) control = <RawField {...props} />;
  else if (node instanceof z.ZodObject) {
    const raw = recordValue(value);
    const keys = [...Object.keys(raw), ...Object.keys(node.shape).filter((key) => !(key in raw))];
    const optional = keys.filter(key => (node.shape[key] as Schema | undefined)?.isOptional() && raw[key] === undefined);
    const notes = path === "" && !props.requiredOnly ? keys.filter(key => key.startsWith("_") && typeof raw[key] === "string") : [];
    const note = (key: string) => <AuthorNote key={key} name={key} value={raw[key] as string} change={next => onChange({ ...raw, [key]: next })} />;
    const beforeField = (key: string) => notes.includes(`_${key}`) ? note(`_${key}`) : null;
    const setKeys = keys.filter(key => !optional.includes(key) && !notes.includes(key));
    const sectionHints = path === "" && !props.requiredOnly ? sectionsFor(schema) : undefined;
    const rows = new Map<string, string[]>();
    for (const key of setKeys) {
      const row = hintFor(schema, key)?.row;
      if (row && raw[key] !== undefined) rows.set(row, [...rows.get(row) ?? [], key]);
    }
    const field = (key: string, rowMember = false) => {
      const childSchema = node.shape[key] as Schema | undefined;
      const childPath = [path, key].filter(Boolean).join(".");
      const change = (next: unknown) => { const updated = { ...raw }; if (next === undefined) delete updated[key]; else updated[key] = next; onChange(updated); };
      if (!childSchema) return <details key={key}><summary>{key}{key.startsWith("_") ? " (comment)" : " (unknown field)"}</summary><RawField {...props} path={childPath} value={raw[key]} onChange={change} /></details>;
      return child(childSchema, raw[key], childPath, change, key, { schema: childSchema, path: childPath, hint: hintFor(schema, key), rowMember });
    };
    const renderFields = (displayKeys: string[]) => displayKeys.map(key => {
      const row = hintFor(schema, key)?.row;
      const members = row && rows.has(row) ? displayKeys.filter(member => rows.get(row)!.includes(member)) : undefined;
      if (!members || members.length < 2) return notes.includes(`_${key}`) ? <div key={key} className="field-with-note">{beforeField(key)}{field(key)}</div> : field(key);
      if (members[0] !== key) return null;
      return <div key={`row-${row}`} className="field-row" role="group" aria-label={row}>
        <div className="field-row-label">{row}</div><div className="field-row-controls">{members.map(member => notes.includes(`_${member}`) ? <div className="field-row-slot" key={member}>{beforeField(member)}{field(member, true)}</div> : field(member, true))}</div>
      </div>;
    });
    const grouped = sectionHints?.map(section => ({ ...section, keys: section.keys.filter(key => setKeys.includes(key) && raw[key] !== undefined && key in node.shape) }));
    if (grouped) {
      const listed = new Set(sectionHints!.flatMap(section => section.keys));
      grouped.push({ title: "Other", keys: setKeys.filter(key => raw[key] !== undefined && !listed.has(key)) });
    }
    control = <div className={`object-fields${grouped ? " sectioned-fields" : ""}`}>
      {notes.filter(key => !(key.slice(1) in node.shape)).map(note)}
      {grouped ? grouped.filter(section => section.keys.length).map(section => <SectionCard key={`${schemaName(schema)}:${section.title}`} name={schemaName(schema)} title={section.title} preview={summarize(schema, raw, section.keys, props.documents)} count={problems.filter(problem => (sectionHints!.find(hint => hint.title === section.title)?.keys ?? section.keys).some(key => problem.path === key || problem.path.startsWith(`${key}.`))).length}>{renderFields(section.keys)}</SectionCard>) : renderFields(setKeys)}
      {!props.requiredOnly && optional.length > 0 && <div className="optional-fields"><span>Optional:</span>{optional.map(key => notes.includes(`_${key}`) ? <span key={key} className="optional-with-note">{beforeField(key)}<button className="optional-chip" type="button" aria-label={`Add ${key}`} onClick={() => onChange({ ...raw, [key]: initialValue(node.shape[key]) })}>+ {hintFor(schema, key)?.label ?? humanize(key)}</button></span> : <button key={key} className="optional-chip" type="button" aria-label={`Add ${key}`} onClick={() => onChange({ ...raw, [key]: initialValue(node.shape[key]) })}>+ {hintFor(schema, key)?.label ?? humanize(key)}</button>)}</div>}
    </div>;
  } else if (node instanceof z.ZodArray && Array.isArray(value)) control = <div className="array-fields">{value.map((entry, index) => <div className="array-entry" key={index}>
    {child(node.element, entry, [path, index].filter((v) => v !== "").join("."), (next) => onChange(value.map((old, i) => i === index ? next : old)))}
    <div className="row-actions"><button type="button" aria-label={`Remove ${path}.${index}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button><button type="button" disabled={!index} aria-label={`Move up ${path}.${index}`} onClick={() => { const updated = [...value]; [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]; onChange(updated); }}>↑</button><button type="button" disabled={index === value.length - 1} aria-label={`Move down ${path}.${index}`} onClick={() => { const updated = [...value]; [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]]; onChange(updated); }}>↓</button></div>
  </div>)}<button type="button" onClick={() => onChange([...value, initialValue(node.element)])}>Add {path.split(".").at(-1)} entry</button></div>;
  else if (node instanceof z.ZodRecord && value && typeof value === "object" && !Array.isArray(value)) control = <RecordField {...props} />;
  else if (node instanceof z.ZodString) control = <input readOnly={props.lockId && path === "id"} id={id} aria-label={path} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />;
  else if (node instanceof z.ZodNumber) control = <input id={id} aria-label={path} type="number" step="any" value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
  else if (node instanceof z.ZodBoolean) control = <input id={id} aria-label={path} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />;
  else if (node instanceof z.ZodEnum || node instanceof z.ZodNativeEnum) {
    const options: string[] = node instanceof z.ZodEnum ? node.options : Object.values(node.enum).filter((v): v is string => typeof v === "string");
    control = <select id={id} aria-label={path} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{options.map((option) => <option key={option}>{option}</option>)}</select>;
  } else if (node instanceof z.ZodLiteral) control = <code>{JSON.stringify(node.value)}</code>;
  else control = <RawField {...props} />;
  scalar = scalar && !unset;
  return <div className={`form-field ${path && scalar ? "field-scalar" : "field-composite"}${presentation?.rowMember ? " field-row-member" : ""}${node instanceof z.ZodNumber ? " field-number" : ""}${props.lockId && path === "id" ? " field-locked" : ""}`} data-field={path}>
    {path && !unset && <div className="field-label"><div><label htmlFor={id}>{label}</label>{hint?.help && <small className="field-help">{hint.help}</small>}</div>{schema.isOptional() && value !== undefined && <button type="button" aria-label={`Unset ${path}`} onClick={() => onChange(undefined)}>Unset</button>}</div>}
    <div className="field-control">{control}{scalar && hint?.unit && <span className="field-unit">{hint.unit}</span>}</div>{issue.map((problem, index) => <p key={index} className="error field-error">{problem.message}</p>)}
  </div>;
}
function RecordField(props: FieldProps) {
  const node = unwrap(props.schema) as z.ZodRecord;
  const raw = recordValue(props.value);
  const [key, setKey] = useState("");
  const kind = refKind(node.keySchema);
  const options = kind ? referenceOptions(kind, props.documents, props.owner, props.path) : [];
  const valid = key && !key.startsWith("_") && !(key in raw) && node.keySchema.safeParse(key).success;
  return <div className="record-fields">{Object.entries(raw).map(([name, value]) => <div className="array-entry" key={name}>
    <Field {...props} schema={node.valueSchema} path={[props.path, name].filter(Boolean).join(".")} value={value} depth={(props.depth ?? 0) + 1} onChange={(next) => props.onChange({ ...raw, [name]: next })} />
    <button type="button" aria-label={`Remove ${props.path}.${name}`} onClick={() => { const updated = { ...raw }; delete updated[name]; props.onChange(updated); }}>Remove {name}</button>
  </div>)}<div className="record-add">{kind ? <select aria-label={`${props.path} new key`} value={key} onChange={(event) => setKey(event.target.value)}><option value="">Choose a reference…</option>{options.filter((option) => !(option in raw)).map((option) => <option key={option} value={option}>{referenceLabel(kind!, option, props.documents)}</option>)}</select> : <input aria-label={`${props.path} new key`} value={key} onChange={(event) => setKey(event.target.value)} placeholder="new key" />}
    <button type="button" disabled={!valid} onClick={() => { props.onChange({ ...raw, [key]: initialValue(node.valueSchema) }); setKey(""); }}>Add key</button></div></div>;
}

registerWidgets(widgetRegistry);
