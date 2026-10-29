import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { Condition, Effect, Outcome, type ContentProblem } from "../content";
import type { JsonBuffer } from "./store";
import type { Document } from "./documents";
import { branchFor, branchLabel, branches, initialValue, refKind, unwrap, type Schema } from "./schema";
import { rangeCaptions } from "./describe";
import { Order, OutcomeTable, registerWidgets, type OrderActions } from "./widgets";
import { referenceLabel, referenceOptions } from "./references";
import { hintFor, hints, humanize, type FieldHint } from "./hints";
import { AuthorNote, OptionalChip, RootSections, rootSections } from "./cards";
export { SectionCard, RootSections, rootSections, fileContentsClass, AuthorNote, OptionalChip } from "./cards";

export interface FormContextValue {
  documents: Document[];
  owner: Document;
  problems: ContentProblem[];
  buffers?: Record<string, JsonBuffer>;
  onError: (path: string, message: string, buffer?: JsonBuffer) => void;
  requiredOnly?: boolean;
  lockId?: boolean;
}
export const FormContext = createContext<FormContextValue | undefined>(undefined);
export function useForm(): FormContextValue {
  const form = useContext(FormContext);
  if (!form) throw new Error("FormContext provider is required");
  return form;
}
export interface FieldProps {
  schema: Schema;
  value: unknown;
  path: string;
  onChange: (value: unknown) => void;
  depth?: number;
  ruleDepth?: number;
  skipWidget?: boolean;
  view?: FieldView;
}
export interface FieldView {
  hint?: FieldHint;
  rowMember?: boolean;
  inline?: boolean;
  hideLabel?: boolean;
  hideCaption?: boolean;
  token?: string;
  ruleFields?: { ownKey: string; caption: (key: string) => string };
  ruleActions?: OrderActions;
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
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault)
      schema = schema._def.innerType;
    else if (schema instanceof z.ZodEffects) schema = schema._def.schema;
    else if (schema instanceof z.ZodLazy) schema = unwrap(schema);
    else break;
  }
  return undefined;
}
const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
export function RawField({ value, onChange, path }: FieldProps) {
  const { onError, buffers } = useForm();
  const serial = JSON.stringify(value, null, 2) ?? "";
  const [text, setText] = useState(buffers?.[path]?.text ?? serial);
  const [error, setError] = useState(() => {
    if (!buffers?.[path]) return "";
    try {
      JSON.parse(buffers[path].text);
      return "";
    } catch (failure) {
      return (failure as Error).message;
    }
  });
  const previous = useRef(serial);
  useEffect(() => {
    if (previous.current !== serial) {
      previous.current = serial;
      setText(serial);
      setError("");
      onError(path, "");
    }
  }, [serial]); // Syntax-invalid buffers survive navigation until their underlying value changes.
  return (
    <>
      <textarea
        aria-label={path || "JSON document"}
        spellCheck={false}
        value={text}
        rows={Math.min(20, Math.max(3, text.split("\n").length))}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            const raw = JSON.parse(next);
            setError("");
            onError(path, "");
            onChange(raw);
          } catch (failure) {
            const message = (failure as Error).message;
            setError(message);
            onError(path, message, { text: next, source: serial });
          }
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
function ReferenceField(props: FieldProps & { id: string }) {
  const { documents, owner } = useForm();
  const options = referenceOptions(refKind(props.schema)!, documents, owner, props.path);
  const value = typeof props.value === "string" ? props.value : "";
  if (refKind(props.schema) === "flag")
    return (
      <>
        <input id={props.id} aria-label={props.path} value={value} onChange={(event) => props.onChange(event.target.value)} />
        <select
          aria-label={`${props.path} existing flag`}
          value={options.includes(value) ? value : ""}
          onChange={(event) => props.onChange(event.target.value)}
        >
          <option value="">Choose an existing flag…</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </>
    );
  return (
    <select id={props.id} aria-label={props.path} value={value} onChange={(event) => props.onChange(event.target.value)}>
      <option value="">Choose a reference…</option>
      {value && !options.includes(value) && <option value={value}>{value} (unresolved)</option>}
      {options.map((id) => (
        <option key={id} value={id}>
          {referenceLabel(refKind(props.schema)!, id, documents)}
        </option>
      ))}
    </select>
  );
}
const labelForInline = (key: string) => rangeCaptions[key as keyof typeof rangeCaptions] ?? humanize(key).toLowerCase();
export function Field(props: FieldProps) {
  const { schema, value, onChange, path, depth = 0 } = props;
  const { problems, documents, requiredOnly, lockId } = useForm();
  const id = useId();
  const node = unwrap(schema),
    kind = refKind(schema);
  const view = props.view;
  const hint = view?.hint;
  const key = path.split(".").at(-1) ?? "";
  const label = hint?.label ?? humanize(key);
  const inline = view?.inline;
  const child = (
    childSchema: Schema,
    childValue: unknown,
    childPath: string,
    change: (value: unknown) => void,
    key?: string,
    view?: FieldView,
    hideLabel = false,
  ) => (
    <Field
      key={key ?? childPath}
      schema={childSchema}
      value={childValue}
      path={childPath}
      onChange={change}
      depth={depth + 1}
      ruleDepth={props.ruleDepth}
      skipWidget={false}
      view={{
        hint: view?.hint,
        rowMember: view?.rowMember,
        inline: view?.inline,
        hideCaption: view?.hideCaption,
        token: view?.token,
        hideLabel,
      }}
    />
  );
  const issue = problems.filter((problem) => problem.path === path);
  let control: ReactNode;
  let unionKind: ReactNode;
  const widget = props.skipWidget ? undefined : (schemaWidget(schema) ?? (kind ? widgetRegistry.references.get(kind) : undefined));
  const unset = value === undefined && schema.isOptional();
  let scalar =
    !widget &&
    (Boolean(kind) ||
      (depth <= 16 &&
        (node instanceof z.ZodString ||
          node instanceof z.ZodNumber ||
          node instanceof z.ZodBoolean ||
          node instanceof z.ZodEnum ||
          node instanceof z.ZodNativeEnum ||
          node instanceof z.ZodLiteral)));
  if (unset) control = <OptionalChip name={key} label={label} add={() => onChange(initialValue(schema))} />;
  else if (widget) {
    const Component = widget;
    control = (
      <Component
        schema={props.schema}
        value={props.value}
        path={props.path}
        onChange={props.onChange}
        depth={props.depth}
        ruleDepth={props.ruleDepth}
        skipWidget={props.skipWidget}
        view={props.view}
      />
    );
  } else if (kind)
    control = (
      <ReferenceField
        schema={props.schema}
        value={props.value}
        path={props.path}
        onChange={props.onChange}
        depth={props.depth}
        ruleDepth={props.ruleDepth}
        skipWidget={props.skipWidget}
        id={id}
      />
    );
  else if (depth > 16)
    control = (
      <RawField
        schema={props.schema}
        value={props.value}
        path={props.path}
        onChange={props.onChange}
        depth={props.depth}
        ruleDepth={props.ruleDepth}
        skipWidget={props.skipWidget}
      />
    );
  else if (branches(node).length) {
    const options = branches(node),
      index = branchFor(node, value);
    const discriminator = node instanceof z.ZodDiscriminatedUnion ? node.discriminator : undefined;
    unionKind = (
      <label className="union-kind">
        <span>{discriminator ? `Kind (${discriminator})` : "Value type"}</span>
        <select
          aria-label={`${path || "root"} kind`}
          value={index}
          onChange={(event) => onChange(initialValue(options[Number(event.target.value)]))}
        >
          {options.map((option, i) => (
            <option key={i} value={i}>
              {branchLabel(option, i)}
            </option>
          ))}
        </select>
      </label>
    );
    control = <div className="union-field">{child(options[index], value, path, onChange, `branch-${index}`, undefined, true)}</div>;
  } else if (node instanceof z.ZodObject && (value === null || typeof value !== "object" || Array.isArray(value)))
    control = (
      <RawField
        schema={props.schema}
        value={props.value}
        path={props.path}
        onChange={props.onChange}
        depth={props.depth}
        ruleDepth={props.ruleDepth}
        skipWidget={props.skipWidget}
      />
    );
  else if (node instanceof z.ZodObject) {
    const raw = recordValue(value);
    const keys = [...Object.keys(raw), ...Object.keys(node.shape).filter((key) => !(key in raw))];
    const optional = keys.filter((key) => (node.shape[key] as Schema | undefined)?.isOptional() && raw[key] === undefined);
    const notes = path === "" && !requiredOnly ? keys.filter((key) => key.startsWith("_") && typeof raw[key] === "string") : [];
    const note = (key: string) => (
      <AuthorNote key={key} name={key} value={raw[key] as string} change={(next) => onChange({ ...raw, [key]: next })} />
    );
    const beforeField = (key: string) => (notes.includes(`_${key}`) ? note(`_${key}`) : null);
    const setKeys = keys.filter((key) => !optional.includes(key) && !notes.includes(key));
    const groups = path === "" && !requiredOnly ? rootSections(schema, raw) : undefined;
    const rows = new Map<string, string[]>();
    for (const key of Object.keys(hints.get(unwrap(schema)) ?? {})) {
      const row = hintFor(schema, key)?.row;
      if (row && setKeys.includes(key) && raw[key] !== undefined) rows.set(row, [...(rows.get(row) ?? []), key]);
    }
    const field = (key: string, rowMember = false) => {
      const childSchema = node.shape[key] as Schema | undefined;
      const childPath = [path, key].filter(Boolean).join(".");
      const change = (next: unknown) => {
        const updated = { ...raw };
        if (next === undefined) delete updated[key];
        else updated[key] = next;
        onChange(updated);
      };
      if (!childSchema)
        return (
          <details key={key}>
            <summary>
              {key}
              {key.startsWith("_") ? " (comment)" : " (unknown field)"}
            </summary>
            <RawField
              schema={props.schema}
              value={raw[key]}
              path={childPath}
              onChange={change}
              depth={props.depth}
              ruleDepth={props.ruleDepth}
              skipWidget={props.skipWidget}
            />
          </details>
        );
      return child(childSchema, raw[key], childPath, change, key, {
        hint: props.view?.ruleFields
          ? { label: props.view?.ruleFields.caption(key) }
          : inline
            ? { label: labelForInline(key) }
            : hintFor(schema, key),
        rowMember,
        inline: Boolean(props.view?.ruleFields || inline),
        hideCaption: key === props.view?.ruleFields?.ownKey,
        token: key === props.view?.ruleFields?.ownKey ? (refKind(childSchema) ?? "value") : undefined,
      });
    };
    const renderFields = (displayKeys: string[]) =>
      displayKeys.map((key) => {
        const row = hintFor(schema, key)?.row;
        const members = row && rows.get(row)?.filter((member) => displayKeys.includes(member));
        if (props.view?.ruleFields) return field(key);
        if (!members || members.length < 2)
          return notes.includes(`_${key}`) ? (
            <div key={key} className="field-with-note">
              {beforeField(key)}
              {field(key)}
            </div>
          ) : (
            field(key)
          );
        if (displayKeys.find((member) => members.includes(member)) !== key) return null;
        return (
          <div key={`row-${row}`} className="field-row" role="group" aria-label={row}>
            <div className="field-row-label">{row}</div>
            <div className="field-row-controls">
              {members.map((member) =>
                notes.includes(`_${member}`) ? (
                  <div className="field-row-slot" key={member}>
                    {beforeField(member)}
                    {field(member, true)}
                  </div>
                ) : (
                  field(member, true)
                ),
              )}
            </div>
          </div>
        );
      });
    control = (
      <div className={`object-fields${inline || props.view?.ruleFields ? " inline-object" : ""}${groups ? " sectioned-fields" : ""}`}>
        {notes.filter((key) => !(key.slice(1) in node.shape)).map(note)}
        {groups ? (
          <RootSections schema={schema} raw={raw} groups={groups} problems={problems} documents={documents} renderFields={renderFields} />
        ) : (
          renderFields(setKeys)
        )}
        {!requiredOnly && optional.length > 0 && (
          <div className="optional-fields">
            {!inline && !props.view?.ruleFields && <span>Optional:</span>}
            {optional.map((key) => {
              const chip = (
                <OptionalChip
                  key={key}
                  name={key}
                  label={
                    props.view?.ruleFields?.caption(key) ?? (inline ? labelForInline(key) : (hintFor(schema, key)?.label ?? humanize(key)))
                  }
                  add={() => onChange({ ...raw, [key]: initialValue(node.shape[key]) })}
                />
              );
              return notes.includes(`_${key}`) ? (
                <span key={key} className="optional-with-note">
                  {beforeField(key)}
                  {chip}
                </span>
              ) : (
                chip
              );
            })}
          </div>
        )}
      </div>
    );
  } else if (node instanceof z.ZodArray && Array.isArray(value) && unwrap(node.element) === unwrap(Outcome))
    control = (
      <OutcomeTable
        schema={props.schema}
        value={props.value}
        path={props.path}
        onChange={props.onChange}
        depth={props.depth}
        ruleDepth={props.ruleDepth}
        skipWidget={props.skipWidget}
      />
    );
  else if (node instanceof z.ZodArray && Array.isArray(value))
    control = (
      <div className="array-fields">
        {value.map((entry, index) => {
          const childPath = [path, index].filter((v) => v !== "").join(".");
          const rule = [Condition, Effect].some((schema) => unwrap(schema) === unwrap(node.element));
          const actions: OrderActions = {
            path: childPath,
            index,
            length: value.length,
            remove: () => onChange(value.filter((_, i) => i !== index)),
            move: (delta) => {
              const updated = [...value];
              [updated[index + delta], updated[index]] = [updated[index], updated[index + delta]];
              onChange(updated);
            },
          };
          const objectEntry = unwrap(node.element) instanceof z.ZodObject;
          const field = (
            <Field
              schema={node.element}
              value={entry}
              path={childPath}
              onChange={(next) => onChange(value.map((old, i) => (i === index ? next : old)))}
              depth={depth + 1}
              ruleDepth={props.ruleDepth}
              skipWidget={false}
              view={{ inline: false, ruleFields: undefined, hideLabel: true, ruleActions: rule ? actions : undefined }}
            />
          );
          return rule ? (
            <div className="array-rule-entry" key={index}>
              {field}
            </div>
          ) : (
            <div className={objectEntry ? "array-object-entry" : "array-line"} key={index}>
              {objectEntry ? (
                <>
                  <span className="entry-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="entry-fields">{field}</div>
                </>
              ) : (
                field
              )}
              <div className="entry-actions">
                <Order path={actions.path} index={actions.index} length={actions.length} remove={actions.remove} move={actions.move} />
              </div>
            </div>
          );
        })}
        <button
          className="add-link"
          type="button"
          aria-label={`Add ${key} entry`}
          onClick={() => onChange([...value, initialValue(node.element)])}
        >
          + add entry
        </button>
      </div>
    );
  else if (node instanceof z.ZodRecord && value && typeof value === "object" && !Array.isArray(value))
    control = (
      <RecordField
        schema={props.schema}
        value={props.value}
        path={props.path}
        onChange={props.onChange}
        depth={props.depth}
        ruleDepth={props.ruleDepth}
        skipWidget={props.skipWidget}
        view={{ inline: inline }}
      />
    );
  else if (node instanceof z.ZodString)
    control = (
      <input
        readOnly={lockId && path === "id"}
        id={id}
        aria-label={path}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  else if (node instanceof z.ZodNumber)
    control = (
      <input
        id={id}
        aria-label={path}
        type="number"
        step="any"
        value={typeof value === "number" ? value : ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    );
  else if (node instanceof z.ZodBoolean)
    control = (
      <input id={id} aria-label={path} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
    );
  else if (node instanceof z.ZodEnum || node instanceof z.ZodNativeEnum) {
    const options: string[] =
      node instanceof z.ZodEnum ? node.options : Object.values(node.enum).filter((v): v is string => typeof v === "string");
    control = (
      <select id={id} aria-label={path} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  } else if (node instanceof z.ZodLiteral) control = <code>{JSON.stringify(node.value)}</code>;
  else
    control = (
      <RawField
        schema={props.schema}
        value={props.value}
        path={props.path}
        onChange={props.onChange}
        depth={props.depth}
        ruleDepth={props.ruleDepth}
        skipWidget={props.skipWidget}
      />
    );
  scalar = scalar && !unset;
  const fieldClass = [
    "form-field",
    props.view?.hideLabel ? " field-unlabelled" : "",
    inline ? " rule-inline" : "",
    view?.token ? ` rule-token token-${view.token}` : "",
    path && scalar ? " field-scalar" : " field-composite",
    view?.rowMember ? " field-row-member" : "",
    node instanceof z.ZodNumber ? " field-number" : "",
    lockId && path === "id" ? " field-locked" : "",
  ].join("");
  return (
    <div className={fieldClass} data-field={path}>
      {!unset && (unionKind || (path && !props.view?.hideLabel && (!view?.hideCaption || schema.isOptional()))) && (
        <div className="field-label">
          {path && !props.view?.hideLabel && (
            <div>
              <label htmlFor={id} className={view?.hideCaption ? "visually-hidden" : undefined}>
                {label}
              </label>
              {hint?.help && <small className="field-help">{hint.help}</small>}
            </div>
          )}
          {unionKind}
          {!props.view?.hideLabel && !inline && schema.isOptional() && value !== undefined && (
            <button className="field-unset" type="button" aria-label={`Unset ${path}`} onClick={() => onChange(undefined)}>
              Unset
            </button>
          )}
        </div>
      )}
      <div className="field-control">
        {control}
        {inline && schema.isOptional() && value !== undefined && (
          <button className="inline-unset" type="button" aria-label={`Unset ${path}`} onClick={() => onChange(undefined)}>
            ×
          </button>
        )}
        {scalar && hint?.unit && <span className="field-unit">{hint.unit}</span>}
      </div>
      {issue.map((problem, index) => (
        <p key={index} className="error field-error">
          {problem.message}
        </p>
      ))}
    </div>
  );
}
function RecordField(props: FieldProps) {
  const { documents, owner } = useForm();
  const node = unwrap(props.schema) as z.ZodRecord;
  const raw = recordValue(props.value);
  const [key, setKey] = useState("");
  const kind = refKind(node.keySchema);
  const options = kind ? referenceOptions(kind, documents, owner, props.path) : [];
  const valid = key && !key.startsWith("_") && !(key in raw) && node.keySchema.safeParse(key).success;
  return (
    <div className={props.view?.inline ? "record-fields record-inline" : "record-fields"}>
      {Object.entries(raw).map(([name, value]) => (
        <div className={props.view?.inline ? "amount-entry" : "record-row"} key={name}>
          <span className={props.view?.inline ? "amount-token" : `record-key${kind ? " record-reference" : ""}`}>
            {kind ? referenceLabel(kind, name, documents) : name}
          </span>
          <Field
            schema={node.valueSchema}
            value={value}
            path={[props.path, name].filter(Boolean).join(".")}
            onChange={(next) => props.onChange({ ...raw, [name]: next })}
            depth={(props.depth ?? 0) + 1}
            ruleDepth={props.ruleDepth}
            skipWidget={props.skipWidget}
            view={{
              hideLabel: !props.view?.inline,
              ruleActions: undefined,
              ruleFields: undefined,
              inline: props.view?.inline,
              hideCaption: Boolean(props.view?.inline),
            }}
          />
          <span className={props.view?.inline ? undefined : "entry-actions"}>
            <button
              type="button"
              aria-label={`Remove ${props.path}.${name}`}
              onClick={() => {
                const updated = { ...raw };
                delete updated[name];
                props.onChange(updated);
              }}
            >
              ×
            </button>
          </span>
        </div>
      ))}
      <div className="record-add">
        {kind ? (
          <select aria-label={`${props.path} new key`} value={key} onChange={(event) => setKey(event.target.value)}>
            <option value="">{props.view?.inline ? "+ item" : "Choose a reference…"}</option>
            {options
              .filter((option) => !(option in raw))
              .map((option) => (
                <option key={option} value={option}>
                  {referenceLabel(kind!, option, documents)}
                </option>
              ))}
          </select>
        ) : (
          <input aria-label={`${props.path} new key`} value={key} onChange={(event) => setKey(event.target.value)} placeholder="new key" />
        )}
        <button
          className={props.view?.inline ? undefined : "add-link"}
          aria-label="Add key"
          type="button"
          disabled={!valid}
          onClick={() => {
            props.onChange({ ...raw, [key]: initialValue(node.valueSchema) });
            setKey("");
          }}
        >
          {props.view?.inline ? "Add key" : "+ add key"}
        </button>
      </div>
    </div>
  );
}

registerWidgets(widgetRegistry);
