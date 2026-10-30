import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { ContentProblem } from "../content";
import { useForm } from "./form";
import { collapsibleEntries } from "./hints";
import { initialValue, unwrap, type Schema } from "./schema";
import { summarize } from "./summary";
import { Order, object, pathAt, reorder } from "./widgets";

export function boundedExpansion(expanded: number[], length: number): number[] {
  return expanded.filter((index) => index >= 0 && index < length);
}
export const moveExpansion = (expanded: number[], index: number, delta: number) =>
  expanded.map((n) => n === index ? index + delta : n === index + delta ? index : n);
export const removeExpansion = (expanded: number[], index: number) =>
  expanded.filter((n) => n !== index).map((n) => n > index ? n - 1 : n);
export interface ExpansionOptions {
  initial: number[];
  ignore?: (problemPath: string, index: number) => boolean;
  focusPath?: (index: number) => string;
}
function problemExpansion(path: string, length: number, problems: ContentProblem[], ignore?: ExpansionOptions["ignore"]) {
  return Array.from({ length }, (_, index) => index).filter(index => problems.some(problem =>
    (problem.path === pathAt(path, index) || problem.path.startsWith(pathAt(path, index) + ".")) && !ignore?.(problem.path, index)));
}
const sessionExpansion = new Map<string, number[]>();

export function useExpansion(path: string, length: number, problems: ContentProblem[], options: ExpansionOptions) {
  const { owner } = useForm();
  const key = `${owner.path}#${path}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const ref = useRef<HTMLDivElement>(null), pendingFocus = useRef<number | null>(null);
  const revealIndices = problemExpansion(path, length, problems, options.ignore);
  const [stored, setExpanded] = useState(() => boundedExpansion(
    sessionExpansion.get(key) ?? [...new Set([...options.initial, ...revealIndices])], length,
  ));
  const expanded = boundedExpansion(stored, length);
  if (expanded.length !== stored.length) setExpanded(expanded);
  useEffect(() => { sessionExpansion.set(key, boundedExpansion(stored, length)); }, [key, stored, length]);
  const diagnosticKey = JSON.stringify(revealIndices);
  useEffect(() => {
    setExpanded(old => [...new Set([...old, ...(JSON.parse(diagnosticKey) as number[])])]);
  }, [diagnosticKey]);
  useEffect(() => {
    const element = ref.current;
    const reveal = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      const index = Array.from({ length }, (_, i) => i).find(i =>
        (target === pathAt(path, i) || target.startsWith(pathAt(path, i) + ".")) && !optionsRef.current.ignore?.(target, i));
      if (index !== undefined) flushSync(() => setExpanded(old => old.includes(index) ? old : [...old, index]));
    };
    element?.addEventListener("studio:reveal", reveal);
    return () => element?.removeEventListener("studio:reveal", reveal);
  }, [path, length]);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const index = pendingFocus.current;
    const fieldPath = optionsRef.current.focusPath?.(index);
    const target = fieldPath
      ? ref.current?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(fieldPath)}"]`)
      : ref.current?.querySelector<HTMLElement>(`[data-entry-editor="${CSS.escape(pathAt(path, index))}"] input, ` +
        `[data-entry-editor="${CSS.escape(pathAt(path, index))}"] select, ` +
        `[data-entry-editor="${CSS.escape(pathAt(path, index))}"] textarea`);
    target?.focus();
    pendingFocus.current = null;
  }, [length]);
  return {
    ref, expanded,
    toggle: (index: number) => setExpanded(old => old.includes(index) ? old.filter(n => n !== index) : [...old, index]),
    move: (index: number, delta: number) => setExpanded(old => moveExpansion(old, index, delta)),
    remove: (index: number) => setExpanded(old => removeExpansion(old, index)),
    add: () => {
      pendingFocus.current = length;
      setExpanded(old => [...old, length]);
    },
  };
}

export function CollapsibleEntry(props: {
  schema: Schema; entry: unknown; path: string; index: number; open: boolean; toggle: () => void;
  actions: ReactNode; children: ReactNode; heading?: boolean;
}) {
  const { documents, problems } = useForm();
  const id = useId(), raw = object(props.entry), config = collapsibleEntries.get(unwrap(props.schema))!;
  const title = config.title ? String(raw[config.title] ?? "") : `Way ${props.index + 1}`;
  const meta = summarize(props.schema, raw, config.summary, documents);
  const count = problems.filter(p => p.path === props.path || p.path.startsWith(props.path + ".")).length;
  const click = () => { if (!window.getSelection()?.toString()) props.toggle(); };
  const label = <>{title}{typeof raw.id === "string" && <code>{raw.id}</code>}</>;
  return <>
    <div className="entry-summary-row">
      <span className="entry-index" aria-hidden="true">{props.index + 1}</span>
      {props.heading ? <h3 className="entry-title" onClick={click}>{label}</h3> : <span className="entry-title" onClick={click}>{label}</span>}
      <span className="entry-meta" title={meta} onClick={click}>{meta}</span>
      {count > 0 && <span className="entry-problems">{count} {count === 1 ? "problem" : "problems"}</span>}
      <button className="outcome-toggle" type="button" aria-label={`Edit ${props.path}`}
        aria-expanded={props.open} aria-controls={id} onClick={props.toggle}>{props.open ? "▾" : "▸"}</button>
    </div>
    <div className="entry-actions">{props.actions}</div>
    <div className="collapsible-entry-editor" id={id} data-entry-editor={props.path} hidden={!props.open}>{props.children}</div>
  </>;
}

export function ObjectEntries(props: {
  schema: Schema; values: unknown[]; path: string; onChange: (value: unknown) => void;
  renderField: (entry: unknown, index: number) => ReactNode;
}) {
  const { problems } = useForm();
  const expansion = useExpansion(props.path, props.values.length, problems, { initial: props.values.length === 1 ? [0] : [] });
  return <div className="array-fields" ref={expansion.ref}>
    {props.values.map((entry, index) => {
      const path = pathAt(props.path, index);
      return <div className="array-object-entry collapsible-entry" key={index}>
        <CollapsibleEntry schema={props.schema} entry={entry} path={path} index={index}
          open={expansion.expanded.includes(index)} toggle={() => expansion.toggle(index)}
          actions={<Order path={path} index={index} length={props.values.length}
            remove={() => { expansion.remove(index); props.onChange(props.values.filter((_, i) => i !== index)); }}
            move={delta => { expansion.move(index, delta); props.onChange(reorder(props.values, index, delta)); }} />}>
          {props.renderField(entry, index)}
        </CollapsibleEntry>
      </div>;
    })}
    <button className="add-link" type="button" aria-label={`Add ${props.path.split(".").at(-1)} entry`}
      onClick={() => { expansion.add(); props.onChange([...props.values, initialValue(props.schema)]); }}>+ add entry</button>
  </div>;
}
