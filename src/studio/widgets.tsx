import { type ReactNode } from "react";
import { z } from "zod";
import { Condition, Effect, Outcome, Text } from "../content";
import { RawField, useForm, type FieldProps, type Widget } from "./form";
import { unionKinds } from "./describe";
import { refKind, stripComments, unwrap, type Schema } from "./schema";
import { referenceLabel, referenceOptions } from "./references";
import { RuleWidget } from "./rules";
import { OutcomeWidget } from "./outcomes";
import { TextWidget } from "./text-widget";
export { OutcomeTable, boundedExpansion } from "./outcomes";

export const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const pathAt = (path: string, key: string | number) => [path, key].filter((v) => v !== "").join(".");
export function Errors({ schema, value }: Pick<FieldProps, "schema" | "value">) {
  const result = schema.safeParse(stripComments(value));
  return result.success ? null : (
    <div role="alert" className="error">
      {result.error.issues.map((issue, i) => (
        <p key={i}>
          {issue.path.join(".")}: {issue.message}
        </p>
      ))}
    </div>
  );
}
export interface OrderActions {
  path: string;
  index: number;
  length: number;
  remove: () => void;
  move: (delta: number) => void;
}
export function Order({
  path,
  index,
  length,
  remove,
  move,
  compact = true,
  beforeRemove,
}: { compact?: boolean; beforeRemove?: ReactNode } & OrderActions) {
  const removeButton = (
    <button type="button" aria-label={`Remove ${path}`} onClick={remove}>
      {compact ? "×" : "Remove"}
    </button>
  );
  return (
    <>
      {!compact && removeButton}
      <button type="button" aria-label={`Move up ${path}`} disabled={index === 0} onClick={() => move(-1)}>
        ↑
      </button>
      <button type="button" aria-label={`Move down ${path}`} disabled={index === length - 1} onClick={() => move(1)}>
        ↓
      </button>
      {beforeRemove}
      {compact && removeButton}
    </>
  );
}

export function reorder<T>(entries: T[], index: number, delta: number): T[] {
  const next = [...entries];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
export function MultiSelect(props: FieldProps) {
  const { documents, owner } = useForm();
  const array = unwrap(props.schema) as z.ZodArray<Schema>,
    element = unwrap(array.element),
    kind = refKind(array.element);
  if (!Array.isArray(props.value) || props.value.some((value) => typeof value !== "string"))
    return (
      <>
        <RawField
          schema={props.schema}
          value={props.value}
          path={props.path}
          onChange={props.onChange}
          depth={props.depth}
          ruleDepth={props.ruleDepth}
          skipWidget={props.skipWidget}
        />
        <Errors schema={props.schema} value={props.value} />
      </>
    );
  const current = props.value as string[];
  const options = kind
    ? referenceOptions(kind, documents, owner, props.path)
    : element instanceof z.ZodEnum
      ? (element.options as string[])
      : [];
  return (
    <div className="multi-select" role="group" aria-label={props.path}>
      {[...new Set([...options, ...current])].map((id) => (
        <label className={current.includes(id) ? "toggle-pill checked" : "toggle-pill"} key={id}>
          <input
            type="checkbox"
            aria-label={`${props.path}: ${id}`}
            checked={current.includes(id)}
            onChange={(event) => props.onChange(event.target.checked ? [...current, id] : current.filter((v) => v !== id))}
          />
          <span>
            {current.includes(id) ? "" : "+ "}
            {kind ? referenceLabel(kind, id, documents) : id}
            {current.includes(id) ? " ×" : ""}
          </span>
        </label>
      ))}
    </div>
  );
}
export function registerWidgets(registry: { nodes: Map<Schema, Widget> }) {
  registry.nodes.set(Condition, (props) => (
    <RuleWidget
      schema={props.schema}
      value={props.value}
      path={props.path}
      onChange={props.onChange}
      depth={props.depth}
      ruleDepth={props.ruleDepth}
      skipWidget={props.skipWidget}
      view={props.view}
      type="condition"
    />
  ));
  registry.nodes.set(unwrap(Condition), (props) => (
    <RuleWidget
      schema={props.schema}
      value={props.value}
      path={props.path}
      onChange={props.onChange}
      depth={props.depth}
      ruleDepth={props.ruleDepth}
      skipWidget={props.skipWidget}
      view={props.view}
      type="condition"
    />
  ));
  registry.nodes.set(Effect, (props) => (
    <RuleWidget
      schema={props.schema}
      value={props.value}
      path={props.path}
      onChange={props.onChange}
      depth={props.depth}
      ruleDepth={props.ruleDepth}
      skipWidget={props.skipWidget}
      view={props.view}
      type="effect"
    />
  ));
  registry.nodes.set(unwrap(Effect), (props) => (
    <RuleWidget
      schema={props.schema}
      value={props.value}
      path={props.path}
      onChange={props.onChange}
      depth={props.depth}
      ruleDepth={props.ruleDepth}
      skipWidget={props.skipWidget}
      view={props.view}
      type="effect"
    />
  ));
  registry.nodes.set(Outcome, OutcomeWidget);
  registry.nodes.set(unwrap(Outcome), OutcomeWidget);
  registry.nodes.set(Text, TextWidget);
  for (const entry of unionKinds(Condition)) {
    const node = unwrap(entry.schema) as z.AnyZodObject;
    for (const schema of Object.values(node.shape) as Schema[]) {
      const array = unwrap(schema);
      if (array instanceof z.ZodArray && (refKind(array.element) || unwrap(array.element) instanceof z.ZodEnum))
        registry.nodes.set(array, MultiSelect);
    }
  }
}
