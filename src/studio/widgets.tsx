import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { Condition, Effect, Outcome, Text } from "../content";
import { Field, RawField, type FieldProps, type Widget } from "./form";
import { BUILDER_DEPTH, describe, rangeCaptions, unionKinds } from "./describe";
import { branches, initialValue, refKind, stripComments, unwrap, type Schema } from "./schema";
import { referenceLabel, referenceOptions } from "./references";
import { humanize } from "./hints";
import { placeholderMismatch, textChannel } from "./text";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const pathAt = (path: string, key: string | number) => [path, key].filter(v => v !== "").join(".");
function Errors({ schema, value }: FieldProps) {
  const result = schema.safeParse(stripComments(value));
  return result.success ? null : <div role="alert" className="error">{result.error.issues.map((issue, i) => <p key={i}>{issue.path.join(".")}: {issue.message}</p>)}</div>;
}
export function Order({ path, index, length, remove, move, compact = true, beforeRemove }: { compact?: boolean; beforeRemove?: ReactNode; path: string; index: number; length: number; remove: () => void; move: (delta: number) => void }) {
  const removeButton = <button type="button" aria-label={`Remove ${path}`} onClick={remove}>{compact ? "×" : "Remove"}</button>;
  return <>{!compact && removeButton}<button type="button" aria-label={`Move up ${path}`} disabled={index === 0} onClick={() => move(-1)}>↑</button><button type="button" aria-label={`Move down ${path}`} disabled={index === length - 1} onClick={() => move(1)}>↓</button>{beforeRemove}{compact && removeButton}</>;
}

function reorder<T>(entries: T[], index: number, delta: number): T[] {
  const next = [...entries]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next;
}
function MultiSelect(props: FieldProps) {
  const array = unwrap(props.schema) as z.ZodArray<Schema>, element = unwrap(array.element), kind = refKind(array.element);
  if (!Array.isArray(props.value) || props.value.some(value => typeof value !== "string")) return <><RawField {...props} /><Errors {...props} /></>;
  const current = props.value as string[];
  const options = kind ? referenceOptions(kind, props.documents, props.owner, props.path) : element instanceof z.ZodEnum ? element.options as string[] : [];
  return <div className="multi-select" role="group" aria-label={props.path}>{[...new Set([...options, ...current])].map(id => <label className={current.includes(id) ? "toggle-pill checked" : "toggle-pill"} key={id}><input type="checkbox" aria-label={`${props.path}: ${id}`} checked={current.includes(id)} onChange={event => props.onChange(event.target.checked ? [...current, id] : current.filter(v => v !== id))} /><span>{current.includes(id) ? "" : "+ "}{kind ? referenceLabel(kind, id, props.documents) : id}{current.includes(id) ? " ×" : ""}</span></label>)}</div>;
}
function RuleWidget(props: FieldProps & { type: "condition" | "effect" }) {
  const [json, setJson] = useState(false);
  const kinds = unionKinds(props.type === "condition" ? Condition : Effect);
  const raw = object(props.value), keys = Object.keys(raw).filter(k => !k.startsWith("_"));
  const selected = kinds.find(entry => entry.kind === keys.find(key => kinds.some(k => k.kind === key)));
  const known = selected && keys.every(key => key in (unwrap(selected.schema) as z.AnyZodObject).shape);
  const depth = props.ruleDepth ?? 0;
  const fallback = depth >= BUILDER_DEPTH || !known;
  const changeKind = (kind: string) => {
    const oldKind = selected?.kind;
    const groups = ["all", "any", "not"];
    let next = initialValue(kinds.find(k => k.kind === kind)!.schema) as Record<string, unknown>;
    if (props.type === "condition" && oldKind && groups.includes(kind)) {
      const children = oldKind === "not" ? [raw.not] : groups.includes(oldKind) && Array.isArray(raw[oldKind]) ? raw[oldKind] as unknown[] : [props.value];
      next = { [kind]: kind === "not" ? children.length === 1 ? children[0] : { all: children } : children };
    }
    // Keep author comments in their original positions; only replace the rule's own fields.
    const updated: Record<string, unknown> = {};
    let inserted = false;
    for (const key of Object.keys(raw)) {
      if (key.startsWith("_")) updated[key] = raw[key];
      else if (!inserted) { Object.assign(updated, next); inserted = true; }
    }
    if (!inserted) Object.assign(updated, next);
    props.onChange(updated);
  };
  const child = (value: unknown, path: string, onChange: (value: unknown) => void, actions?: ReactNode) => <Field {...props} schema={Condition} value={value} path={path} onChange={onChange} skipWidget={false} ruleActions={actions} ruleDepth={depth + 1} depth={0} />;
  const group = props.type === "condition" && selected && ["all", "any", "not"].includes(selected.kind);
  const operator = <select className="rule-operator" aria-label={`${props.path} kind`} value={selected?.kind ?? ""} onChange={event => changeKind(event.target.value)}><option value="" disabled>Unknown</option>{kinds.map(k => <option key={k.kind}>{k.kind}</option>)}</select>;
  const jsonButton = <button type="button" aria-label={`${props.path} JSON view`} aria-pressed={json} onClick={() => setJson(!json)}>{"{ }"}</button>;
  const actions = <div className="rule-actions">{isValidElement<{ beforeRemove?: ReactNode }>(props.ruleActions) ? cloneElement(props.ruleActions, { beforeRemove: jsonButton }) : jsonButton}</div>;
  let control;
  if (fallback || json) control = <><div className="rule-line">{actions}</div>{fallback && <p className="builder-fallback">{depth >= BUILDER_DEPTH ? `Rules at depth ${BUILDER_DEPTH} use JSON.` : "Unknown rule; edit validated JSON."}</p>}<RawField {...props} /><Errors {...props} /></>;
  else if (group) {
    const children = raw[selected.kind];
    control = <><div className="rule-line">{operator}{selected.kind !== "not" && <span className="rule-caption">of these</span>}{actions}</div><Errors {...props} />
      {selected.kind === "not" ? <div className={["all", "any", "not"].some(key => key in object(raw.not)) ? "rule-not" : "rule rule-not"}>{child(raw.not, pathAt(props.path, "not"), next => props.onChange({ ...raw, not: next }))}</div> : !Array.isArray(children) ? <RawField {...props} /> : <>
        {children.map((value, index) => {
          const path = pathAt(pathAt(props.path, selected.kind), index);
          return <div className="rule-child" key={index}>{child(value, path, next => props.onChange({ ...raw, [selected.kind]: children.map((v, i) => i === index ? next : v) }), <Order path={path} index={index} length={children.length} remove={() => props.onChange({ ...raw, [selected.kind]: children.filter((_, i) => i !== index) })} move={delta => props.onChange({ ...raw, [selected.kind]: reorder(children, index, delta) })} />)}</div>;
        })}
        <div className="rule-add"><button className="add-link" type="button" aria-label={`Add condition to ${props.path}`} onClick={() => props.onChange({ ...raw, [selected.kind]: [...children, initialValue(kinds.find(k => k.kind === "item")!.schema)] })}>+ add condition</button><button className="add-link" type="button" aria-label={`Add group to ${props.path}`} onClick={() => props.onChange({ ...raw, [selected.kind]: [...children, { all: [initialValue(kinds.find(k => k.kind === "item")!.schema)] }] })}>+ add group</button></div>
      </>}</>;
  } else {
    const shape = (unwrap(selected.schema) as z.AnyZodObject).shape;
    const caption = (key: string) => rangeCaptions[key as keyof typeof rangeCaptions] ?? humanize(key).toLowerCase();
    const isInline = (schema: Schema): boolean => {
      const node = unwrap(schema);
      if (schema === Text) return false;
      if (refKind(schema) || node instanceof z.ZodString || node instanceof z.ZodNumber || node instanceof z.ZodBoolean || node instanceof z.ZodEnum) return true;
      if (node instanceof z.ZodArray) return Boolean(refKind(node.element) || unwrap(node.element) instanceof z.ZodEnum);
      if (node instanceof z.ZodObject) return Object.keys(node.shape).every(k => ["day", "hour", "gte", "lte"].includes(k)) && Object.values(node.shape).every(s => unwrap(s as Schema) instanceof z.ZodNumber);
      return node instanceof z.ZodRecord && refKind(node.keySchema) === "item" && unwrap(node.valueSchema) instanceof z.ZodNumber;
    };
    const inlineKeys = Object.keys(shape).filter(key => isInline(shape[key]));
    const renderFields = (keys: string[], inline: boolean) => <Field {...props} value={Object.fromEntries(Object.entries(raw).filter(([key]) => keys.includes(key)))} schema={z.object(Object.fromEntries(keys.map(key => [key, shape[key]])))} skipWidget={true} ruleActions={undefined} depth={0} ruleDepth={depth + 1} ruleFields={inline ? { ownKey: selected.kind, caption } : undefined} onChange={next => {
      const updated = { ...raw }, changed = object(next);
      for (const key of keys) { if (key in changed) updated[key] = changed[key]; else delete updated[key]; }
      props.onChange(updated);
    }} />;
    const blocks = Object.keys(shape).filter(key => !inlineKeys.includes(key));
    control = <><div className="rule-line">{operator}{renderFields(inlineKeys, true)}{actions}</div><Errors {...props} />{blocks.length > 0 && <div className="rule-block">{renderFields(blocks, false)}</div>}{Object.keys(raw).filter(key => key.startsWith("_")).map(key => <details key={key}><summary>{key} (comment)</summary><RawField {...props} path={pathAt(props.path, key)} value={raw[key]} onChange={next => props.onChange({ ...raw, [key]: next })} /></details>)}</>;
  }
  return <section className="rule-widget" aria-label={`${props.type} ${props.path}`}><div className={depth === 0 || group ? "rule" : "rule-content"}>{control}</div>{depth === 0 && <p className="reads-as"><b>Reads as:</b> {describe(props.value, props.type, props.documents)}</p>}</section>;
}

function OutcomeWidget(props: FieldProps) {
  const depth = props.ruleDepth ?? 0;
  return <section className="outcome-widget" aria-label={`Outcome ${props.path}`}>{depth >= BUILDER_DEPTH ? <><p className="builder-fallback">Nested outcomes use JSON at depth {BUILDER_DEPTH}.</p><RawField {...props} /></> : <Field {...props} schema={unwrap(Outcome)} skipWidget={true} ruleDepth={depth + 1} depth={0} />}<Errors {...props} /></section>;
}
function VariantInput({ value, path, change }: { value: string; path: string; change: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    const resize = () => { area.style.height = "auto"; area.style.height = `${area.scrollHeight + 2}px`; };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(area);
    return () => observer.disconnect();
  }, [value]);
  return <textarea ref={ref} aria-label={path} value={value} rows={1} onChange={e => change(e.target.value)} />;
}
function TextWidget(props: FieldProps) {
  const raw = object(props.value);
  const mode = typeof props.value === "string" ? "single" : Array.isArray(props.value) ? "variants" : "explicit";
  const variants = mode === "single" ? [props.value as string] : mode === "variants" ? props.value as unknown[] : raw.variants;
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState(typeof raw.id === "string" ? raw.id : "");
  const valid = Array.isArray(variants) && variants.every(v => typeof v === "string");
  if (!valid) return <><RawField {...props} /><Errors {...props} /></>;
  const values = variants as string[];
  const channel = textChannel(props.owner.kind, props.path);
  const update = (next: string[]) => props.onChange(mode === "single" ? next[0] ?? "" : mode === "variants" ? next : { ...raw, variants: next });
  const switchMode = (next: string) => {
    if (next === mode) return;
    if (next === "single" && values.length !== 1) { setMessage("Single text needs one alternative. Remove extra alternatives explicitly before switching."); return; }
    if (mode === "explicit" && Object.keys(raw).some(k => k.startsWith("_"))) { setMessage("This text has author comments. Keep the explicit form to preserve them."); return; }
    setMessage("");
    if (mode === "explicit") setSavedId(String(raw.id ?? ""));
    props.onChange(next === "single" ? values[0] : next === "variants" ? values : { id: savedId, variants: values });
  };
  return <section className="text-widget" aria-label={`Text ${props.path}`}>
    <div className="text-header"><span className="badge">{channel}</span><span className="variant-count">{values.length} {values.length === 1 ? "variant" : "variants"}</span><select title="Changing text form may change its memo key." aria-label={`${props.path} text form`} value={mode} onChange={e => switchMode(e.target.value)}><option value="single">Single text</option><option value="variants">Alternative variants</option><option value="explicit">Explicit ID and variants</option></select></div>
    {mode === "explicit" && <Field {...props} schema={(unwrap(branches(Text)[2]) as z.AnyZodObject).shape.id} value={raw.id} path={pathAt(props.path, "id")} skipWidget={false} onChange={id => props.onChange({ ...raw, id })} />}
    {values.map((text, index) => <div className="variant" key={index}><span className="variant-index">{index + 1}</span><VariantInput path={mode === "single" ? props.path : pathAt(mode === "explicit" ? pathAt(props.path, "variants") : props.path, index)} value={text} change={next => update(values.map((v, i) => i === index ? next : v))} />{channel === "journal" && <span className={`variant-counter${text.length > 80 ? " warning" : ""}`} title={text.length > 80 ? "above journal guidance" : undefined}>{text.length}/80{text.length > 80 && <span className="visually-hidden"> — above journal guidance</span>}</span>}{mode !== "single" && <div className="variant-actions"><Order path={pathAt(props.path, index)} index={index} length={values.length} remove={() => update(values.filter((_, i) => i !== index))} move={delta => update(reorder(values, index, delta))} /></div>}</div>)}
    {mode !== "single" && <button className="add-link" type="button" aria-label={`Add alternative to ${props.path}`} onClick={() => update([...values, ""])}>+ add variant</button>}
    <p className="text-hint">First variant is used by ?variants=first and tests.</p>
    {placeholderMismatch(values) && <p className="warning">Alternatives use different {'{placeholder}'} sets.</p>}{message && <p role="alert" className="warning">{message}</p>}<Errors {...props} />
  </section>;
}
export function registerWidgets(registry: { nodes: Map<Schema, Widget> }) {
  registry.nodes.set(Condition, props => <RuleWidget {...props} type="condition" />);
  registry.nodes.set(unwrap(Condition), props => <RuleWidget {...props} type="condition" />);
  registry.nodes.set(Effect, props => <RuleWidget {...props} type="effect" />);
  registry.nodes.set(unwrap(Effect), props => <RuleWidget {...props} type="effect" />);
  registry.nodes.set(Outcome, OutcomeWidget); registry.nodes.set(unwrap(Outcome), OutcomeWidget);
  registry.nodes.set(Text, TextWidget);
  for (const entry of unionKinds(Condition)) {
    const node = unwrap(entry.schema) as z.AnyZodObject;
    for (const schema of Object.values(node.shape) as Schema[]) {
      const array = unwrap(schema);
      if (array instanceof z.ZodArray && (refKind(array.element) || unwrap(array.element) instanceof z.ZodEnum)) registry.nodes.set(array, MultiSelect);
    }
  }
}
