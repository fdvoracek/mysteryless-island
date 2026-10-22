import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import type { ContentProblem } from "../content";
import type { JsonBuffer } from "./store";
import type { Document } from "./documents";
import { branchFor, branchLabel, branches, initialValue, refKind, unwrap, type Schema } from "./schema";
import { referenceOptions } from "./references";

export interface FieldProps {
  schema: Schema; value: unknown; onChange: (value: unknown) => void; path: string;
  problems: ContentProblem[]; documents: Document[]; owner: Document;
  buffers?: Record<string, JsonBuffer>;
  onError: (path: string, message: string, buffer?: JsonBuffer) => void; depth?: number; requiredOnly?: boolean; lockId?: boolean;
}
export type Widget = (props: FieldProps) => ReactNode;
/** Extensions bind to schema objects or reference kinds, never incidental field names. */
export const widgetRegistry = {
  nodes: new Map<Schema, Widget>(),
  references: new Map<string, Widget>(),
};
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
  return <select aria-label={props.path} value={value} onChange={(event) => props.onChange(event.target.value)}>
    <option value="">Choose a reference…</option>{value && !options.includes(value) && <option value={value}>{value} (unresolved)</option>}
    {options.map((id) => <option key={id} value={id}>{id}</option>)}
  </select>;
}
export function Field(props: FieldProps) {
  const { schema, value, onChange, path, problems, depth = 0 } = props;
  const id = useId();
  const node = unwrap(schema), kind = refKind(schema);
  const child = (childSchema: Schema, childValue: unknown, childPath: string, change: (value: unknown) => void, key?: string) => <Field key={key ?? childPath} {...props} schema={childSchema} value={childValue} path={childPath} onChange={change} depth={depth + 1} />;
  const issue = problems.filter((problem) => problem.path === path);
  let control: ReactNode;
  const widget = widgetRegistry.nodes.get(schema) ?? widgetRegistry.nodes.get(node) ?? (kind ? widgetRegistry.references.get(kind) : undefined);
  if (widget) control = widget(props);
  else if (value === undefined && schema.isOptional()) control = <button type="button" onClick={() => onChange(initialValue(schema))}>Add {path.split(".").at(-1)}</button>;
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
    control = <div className="object-fields">{keys.filter((key) => !props.requiredOnly || key in raw || !(node.shape[key] as Schema)?.isOptional()).map((key) => {
      const childSchema = node.shape[key] as Schema | undefined;
      const childPath = [path, key].filter(Boolean).join(".");
      const change = (next: unknown) => { const updated = { ...raw }; if (next === undefined) delete updated[key]; else updated[key] = next; onChange(updated); };
      if (!childSchema) return <details key={key}><summary>{key}{key.startsWith("_") ? " (comment)" : " (unknown field)"}</summary><RawField {...props} path={childPath} value={raw[key]} onChange={change} /></details>;
      if (props.lockId && childPath === "id") return <label key={key}>id<input aria-label="id" value={String(raw.id ?? "")} readOnly /></label>;
      return child(childSchema, raw[key], childPath, change);
    })}</div>;
  } else if (node instanceof z.ZodArray && Array.isArray(value)) control = <div className="array-fields">{value.map((entry, index) => <div className="array-entry" key={index}>
    {child(node.element, entry, [path, index].filter((v) => v !== "").join("."), (next) => onChange(value.map((old, i) => i === index ? next : old)))}
    <div className="row-actions"><button type="button" aria-label={`Remove ${path}.${index}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button><button type="button" disabled={!index} aria-label={`Move up ${path}.${index}`} onClick={() => { const updated = [...value]; [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]; onChange(updated); }}>↑</button><button type="button" disabled={index === value.length - 1} aria-label={`Move down ${path}.${index}`} onClick={() => { const updated = [...value]; [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]]; onChange(updated); }}>↓</button></div>
  </div>)}<button type="button" onClick={() => onChange([...value, initialValue(node.element)])}>Add {path.split(".").at(-1)} entry</button></div>;
  else if (node instanceof z.ZodRecord && value && typeof value === "object" && !Array.isArray(value)) control = <RecordField {...props} />;
  else if (node instanceof z.ZodString) control = <input id={id} aria-label={path} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />;
  else if (node instanceof z.ZodNumber) control = <input id={id} aria-label={path} type="number" step="any" value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
  else if (node instanceof z.ZodBoolean) control = <input id={id} aria-label={path} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />;
  else if (node instanceof z.ZodEnum || node instanceof z.ZodNativeEnum) {
    const options: string[] = node instanceof z.ZodEnum ? node.options : Object.values(node.enum).filter((v): v is string => typeof v === "string");
    control = <select id={id} aria-label={path} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{options.map((option) => <option key={option}>{option}</option>)}</select>;
  } else if (node instanceof z.ZodLiteral) control = <code>{JSON.stringify(node.value)}</code>;
  else control = <RawField {...props} />;
  return <div className="form-field" data-field={path}>
    {path && <div className="field-label"><label htmlFor={id}>{path.split(".").at(-1)}</label>{schema.isOptional() && value !== undefined && <button type="button" aria-label={`Unset ${path}`} onClick={() => onChange(undefined)}>Unset</button>}</div>}
    {control}{issue.map((problem, index) => <p key={index} className="error field-error">{problem.message}</p>)}
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
  </div>)}<div className="record-add">{kind ? <select aria-label={`${props.path} new key`} value={key} onChange={(event) => setKey(event.target.value)}><option value="">Choose a reference…</option>{options.filter((option) => !(option in raw)).map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={`${props.path} new key`} value={key} onChange={(event) => setKey(event.target.value)} placeholder="new key" />}
    <button type="button" disabled={!valid} onClick={() => { props.onChange({ ...raw, [key]: initialValue(node.valueSchema) }); setKey(""); }}>Add key</button></div></div>;
}
