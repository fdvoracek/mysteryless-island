import { useMemo, useState } from "react";
import { z } from "zod";
import { Condition, Effect, Text } from "../content";
import { BUILDER_DEPTH, describe, rangeCaptions, unionKinds } from "./describe";
import { initialValue, refKind, unwrap, type Schema } from "./schema";
import { humanize } from "./hints";
import { Field, RawField, useForm, type FieldProps } from "./form";
import { Errors, Order, object, pathAt, reorder, type OrderActions } from "./widgets";
export function RuleWidget(props: FieldProps & { type: "condition" | "effect" }) {
  const { documents } = useForm();
  const [json, setJson] = useState(false);
  const kinds = unionKinds(props.type === "condition" ? Condition : Effect);
  const raw = object(props.value),
    keys = Object.keys(raw).filter((k) => !k.startsWith("_"));
  const selected = kinds.find((entry) => entry.kind === keys.find((key) => kinds.some((k) => k.kind === key)));
  const known = selected && keys.every((key) => key in (unwrap(selected.schema) as z.AnyZodObject).shape);
  const leafFields = useMemo(() => {
    const shape = selected ? (unwrap(selected.schema) as z.AnyZodObject).shape : {};
    const isInline = (schema: Schema): boolean => {
      const node = unwrap(schema);
      if (schema === Text) return false;
      if (
        refKind(schema) ||
        node instanceof z.ZodString ||
        node instanceof z.ZodNumber ||
        node instanceof z.ZodBoolean ||
        node instanceof z.ZodEnum
      )
        return true;
      if (node instanceof z.ZodArray) return Boolean(refKind(node.element) || unwrap(node.element) instanceof z.ZodEnum);
      if (node instanceof z.ZodObject)
        return (
          Object.keys(node.shape).every((k) => ["day", "hour", "gte", "lte"].includes(k)) &&
          Object.values(node.shape).every((s) => unwrap(s as Schema) instanceof z.ZodNumber)
        );
      return node instanceof z.ZodRecord && refKind(node.keySchema) === "item" && unwrap(node.valueSchema) instanceof z.ZodNumber;
    };
    const inlineKeys = Object.keys(shape).filter((key) => isInline(shape[key]));
    const blocks = Object.keys(shape).filter((key) => !inlineKeys.includes(key));
    return { inlineKeys, blocks };
  }, [selected?.schema]);
  const inlineSchema = useMemo(
    () => z.object(Object.fromEntries(leafFields.inlineKeys.map((key) => [key, (unwrap(selected!.schema) as z.AnyZodObject).shape[key]]))),
    [selected?.schema, leafFields.inlineKeys],
  );
  const blockSchema = useMemo(
    () => z.object(Object.fromEntries(leafFields.blocks.map((key) => [key, (unwrap(selected!.schema) as z.AnyZodObject).shape[key]]))),
    [selected?.schema, leafFields.blocks],
  );
  const depth = props.ruleDepth ?? 0;
  const fallback = depth >= BUILDER_DEPTH || !known;
  const changeKind = (kind: string) => {
    const oldKind = selected?.kind;
    const groups = ["all", "any", "not"];
    let next = initialValue(kinds.find((k) => k.kind === kind)!.schema) as Record<string, unknown>;
    if (props.type === "condition" && oldKind && groups.includes(kind)) {
      const children =
        oldKind === "not"
          ? [raw.not]
          : groups.includes(oldKind) && Array.isArray(raw[oldKind])
            ? (raw[oldKind] as unknown[])
            : [props.value];
      next = { [kind]: kind === "not" ? (children.length === 1 ? children[0] : { all: children }) : children };
    }
    // Keep author comments in their original positions; only replace the rule's own fields.
    const updated: Record<string, unknown> = {};
    let inserted = false;
    for (const key of Object.keys(raw)) {
      if (key.startsWith("_")) updated[key] = raw[key];
      else if (!inserted) {
        Object.assign(updated, next);
        inserted = true;
      }
    }
    if (!inserted) Object.assign(updated, next);
    props.onChange(updated);
  };
  const child = (value: unknown, path: string, onChange: (value: unknown) => void, actions?: OrderActions) => (
    <Field
      schema={Condition}
      value={value}
      path={path}
      onChange={onChange}
      depth={0}
      ruleDepth={depth + 1}
      skipWidget={false}
      view={{ hideLabel: false, ruleActions: actions }}
    />
  );
  const group = props.type === "condition" && selected && ["all", "any", "not"].includes(selected.kind);
  const operator = (
    <select
      className="rule-operator"
      aria-label={`${props.path} kind`}
      value={selected?.kind ?? ""}
      onChange={(event) => changeKind(event.target.value)}
    >
      <option value="" disabled>
        Unknown
      </option>
      {kinds.map((k) => (
        <option key={k.kind}>{k.kind}</option>
      ))}
    </select>
  );
  const jsonButton = (
    <button type="button" aria-label={`${props.path} JSON view`} aria-pressed={json} onClick={() => setJson(!json)}>
      {"{ }"}
    </button>
  );
  const actions = (
    <div className="rule-actions">
      {props.view?.ruleActions ? (
        <Order
          path={props.view?.ruleActions.path}
          index={props.view?.ruleActions.index}
          length={props.view?.ruleActions.length}
          remove={props.view?.ruleActions.remove}
          move={props.view?.ruleActions.move}
          beforeRemove={jsonButton}
        />
      ) : (
        jsonButton
      )}
    </div>
  );
  let control;
  if (fallback || json)
    control = (
      <>
        <div className="rule-line">{actions}</div>
        {fallback && (
          <p className="builder-fallback">
            {depth >= BUILDER_DEPTH ? `Rules at depth ${BUILDER_DEPTH} use JSON.` : "Unknown rule; edit validated JSON."}
          </p>
        )}
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
  else if (group) {
    const children = raw[selected.kind];
    control = (
      <>
        <div className="rule-line">
          {operator}
          {selected.kind !== "not" && <span className="rule-caption">of these</span>}
          {actions}
        </div>
        <Errors schema={props.schema} value={props.value} />
        {selected.kind === "not" ? (
          <div className={["all", "any", "not"].some((key) => key in object(raw.not)) ? "rule-not" : "rule rule-not"}>
            {child(raw.not, pathAt(props.path, "not"), (next) => props.onChange({ ...raw, not: next }))}
          </div>
        ) : !Array.isArray(children) ? (
          <RawField
            schema={props.schema}
            value={props.value}
            path={props.path}
            onChange={props.onChange}
            depth={props.depth}
            ruleDepth={props.ruleDepth}
            skipWidget={props.skipWidget}
          />
        ) : (
          <>
            {children.map((value, index) => {
              const path = pathAt(pathAt(props.path, selected.kind), index);
              return (
                <div className="rule-child" key={index}>
                  {child(
                    value,
                    path,
                    (next) => props.onChange({ ...raw, [selected.kind]: children.map((v, i) => (i === index ? next : v)) }),
                    {
                      path,
                      index,
                      length: children.length,
                      remove: () => props.onChange({ ...raw, [selected.kind]: children.filter((_, i) => i !== index) }),
                      move: (delta) => props.onChange({ ...raw, [selected.kind]: reorder(children, index, delta) }),
                    },
                  )}
                </div>
              );
            })}
            <div className="rule-add">
              <button
                className="add-link"
                type="button"
                aria-label={`Add condition to ${props.path}`}
                onClick={() =>
                  props.onChange({ ...raw, [selected.kind]: [...children, initialValue(kinds.find((k) => k.kind === "item")!.schema)] })
                }
              >
                + add condition
              </button>
              <button
                className="add-link"
                type="button"
                aria-label={`Add group to ${props.path}`}
                onClick={() =>
                  props.onChange({
                    ...raw,
                    [selected.kind]: [...children, { all: [initialValue(kinds.find((k) => k.kind === "item")!.schema)] }],
                  })
                }
              >
                + add group
              </button>
            </div>
          </>
        )}
      </>
    );
  } else {
    const { inlineKeys, blocks } = leafFields;
    const caption = (key: string) => rangeCaptions[key as keyof typeof rangeCaptions] ?? humanize(key).toLowerCase();
    const renderFields = (keys: string[], inline: boolean) => (
      <Field
        schema={inline ? inlineSchema : blockSchema}
        value={Object.fromEntries(Object.entries(raw).filter(([key]) => keys.includes(key)))}
        path={props.path}
        onChange={(next) => {
          const updated = { ...raw },
            changed = object(next);
          for (const key of keys) {
            if (key in changed) updated[key] = changed[key];
            else delete updated[key];
          }
          props.onChange(updated);
        }}
        depth={0}
        ruleDepth={depth + 1}
        skipWidget={true}
        view={{ hideLabel: props.view?.hideLabel, ruleFields: inline ? { ownKey: selected.kind, caption } : undefined }}
      />
    );
    control = (
      <>
        <div className="rule-line">
          {operator}
          {renderFields(inlineKeys, true)}
          {actions}
        </div>
        <Errors schema={props.schema} value={props.value} />
        {blocks.length > 0 && <div className="rule-block">{renderFields(blocks, false)}</div>}
        {Object.keys(raw)
          .filter((key) => key.startsWith("_"))
          .map((key) => (
            <details key={key}>
              <summary>{key} (comment)</summary>
              <RawField
                schema={props.schema}
                value={raw[key]}
                path={pathAt(props.path, key)}
                onChange={(next) => props.onChange({ ...raw, [key]: next })}
                depth={props.depth}
                ruleDepth={props.ruleDepth}
                skipWidget={props.skipWidget}
              />
            </details>
          ))}
      </>
    );
  }
  return (
    <section className="rule-widget" aria-label={`${props.type} ${props.path}`}>
      <div className={depth === 0 || group ? "rule" : "rule-content"}>{control}</div>
      {depth === 0 && (
        <p className="reads-as">
          <b>Reads as:</b> {describe(props.value, props.type, documents)}
        </p>
      )}
    </section>
  );
}
