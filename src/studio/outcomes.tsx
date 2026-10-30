import { useId, useMemo } from "react";
import { useExpansion } from "./entries";
import { z } from "zod";
import { Outcome } from "../content";
import { BUILDER_DEPTH, describe } from "./describe";
import { initialValue, unwrap } from "./schema";
import { Field, RawField, useForm, type FieldProps } from "./form";
import { Errors, Order, object, pathAt, reorder } from "./widgets";
export function OutcomeWidget(props: FieldProps) {
  const depth = props.ruleDepth ?? 0;
  return (
    <section className="outcome-widget" aria-label={`Outcome ${props.path}`}>
      {depth >= BUILDER_DEPTH ? (
        <>
          <p className="builder-fallback">Nested outcomes use JSON at depth {BUILDER_DEPTH}.</p>
          <RawField
            schema={props.schema}
            value={props.value}
            path={props.path}
            onChange={props.onChange}
            depth={0}
            ruleDepth={props.ruleDepth}
            skipWidget={false}
          />
        </>
      ) : (
        <Field
          schema={unwrap(Outcome)}
          value={props.value}
          path={props.path}
          onChange={props.onChange}
          depth={0}
          ruleDepth={depth + 1}
          skipWidget={true}
        />
      )}
      <Errors schema={props.schema} value={props.value} />
    </section>
  );
}

export { boundedExpansion } from "./entries";

export function OutcomeTable(props: FieldProps) {
  const { documents, problems: documentProblems } = useForm();
  const values = props.value as unknown[];
  const node = unwrap(Outcome) as z.AnyZodObject;
  const editorSchema = useMemo(() => node.omit({ weight: true }), [node]);
  const id = useId();
  const problems = documentProblems.filter((p) => p.path.startsWith(props.path + "."));
  const { ref, expanded, toggle, move, remove, add } = useExpansion(props.path, values.length, problems, {
    initial: [],
    ignore: (path, i) => path === pathAt(pathAt(props.path, i), "weight"),
    focusPath: (i) => pathAt(pathAt(props.path, i), "weight"),
  });
  if ((props.ruleDepth ?? 0) >= BUILDER_DEPTH)
    return (
      <>
        <p className="builder-fallback">Nested outcomes use JSON at depth {BUILDER_DEPTH}.</p>
        <RawField
          schema={props.schema}
          value={props.value}
          path={props.path}
          onChange={props.onChange}
          depth={0}
          ruleDepth={props.ruleDepth}
          skipWidget={false}
        />
      </>
    );
  const total = values.reduce<number>(
    (sum, value) => sum + (typeof object(value).weight === "number" ? (object(value).weight as number) : 0),
    0,
  );
  const conditional = values.some((value) => object(value).when !== undefined);
  const click = (i: number) => {
    if (!window.getSelection()?.toString()) toggle(i);
  };
  const update = (i: number, next: unknown) => props.onChange(values.map((value, index) => (index === i ? next : value)));
  return (
    <div className="outcome-table" ref={ref}>
      <div className="outcome-header" title={conditional ? "Shares assume every condition holds." : undefined}>
        <span>Weight</span>
        <span>Text (first variant)</span>
        <span>Effects</span>
        <span />
      </div>
      {values.map((value, i) => {
        const raw = object(value),
          path = pathAt(props.path, i),
          weightPath = pathAt(path, "weight");
        const share = total === 0 ? null : Math.round(((typeof raw.weight === "number" ? raw.weight : 0) / total) * 100);
        const variants = typeof raw.text === "string" ? [raw.text] : Array.isArray(raw.text) ? raw.text : object(raw.text).variants;
        const texts = Array.isArray(variants) ? variants : [];
        const effects = Array.isArray(raw.effects) ? raw.effects : [];
        const count = problems.filter((p) => p.path === path || p.path.startsWith(path + ".")).length;
        const open = expanded.includes(i);
        const editorId = `${id}-${i}`;
        return (
          <div className="outcome-entry" key={i}>
            <div className="outcome-row">
              <div className="outcome-weight">
                <Field
                  schema={node.shape.weight}
                  value={raw.weight}
                  path={weightPath}
                  onChange={(weight) => update(i, { ...raw, weight })}
                  depth={0}
                  ruleDepth={props.ruleDepth}
                  skipWidget={false}
                  view={{ inline: true, hideCaption: true }}
                />
                <span className="outcome-share">
                  {conditional && "≈"}
                  {share === null ? "—" : `${share}%`}
                </span>
                <span className="outcome-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, share ?? 0))}%` }} />
                </span>
                {raw.when !== undefined && <span className="badge">when</span>}
              </div>
              <div className="outcome-text" onClick={() => click(i)}>
                <span className={texts.length ? "outcome-first" : "outcome-empty"}>{texts.length ? String(texts[0]) : "no text"}</span>
                {texts.length > 1 && <span className="badge">+{texts.length - 1}</span>}
                {count > 0 && (
                  <span className="form-section-problems">
                    {count} {count === 1 ? "problem" : "problems"}
                  </span>
                )}
              </div>
              <div className="outcome-effects" onClick={() => click(i)}>
                {effects.length ? (
                  effects.map((effect, index) => (
                    <span className="outcome-chip" key={index} title={describe(effect, "effect", documents)}>
                      {describe(effect, "effect", documents)}
                    </span>
                  ))
                ) : (
                  <span className="outcome-empty">nothing</span>
                )}
              </div>
              <div className="outcome-controls">
                <button
                  className="outcome-toggle"
                  type="button"
                  aria-label={`Edit ${path}`}
                  aria-expanded={open}
                  aria-controls={editorId}
                  onClick={() => toggle(i)}
                >
                  {open ? "▾" : "▸"}
                </button>
                <div className="outcome-actions">
                  <Order
                    path={path}
                    index={i}
                    length={values.length}
                    remove={() => {
                      remove(i);
                      props.onChange(values.filter((_, index) => index !== i));
                    }}
                    move={(delta) => {
                      move(i, delta);
                      props.onChange(reorder(values, i, delta));
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="outcome-editor" id={editorId} hidden={!open}>
              <Field
                schema={editorSchema}
                value={Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "weight"))}
                path={path}
                onChange={(next) => {
                  const updated = { ...raw },
                    changed = object(next);
                  for (const key of new Set([...Object.keys(raw), ...Object.keys(changed)]))
                    if (key !== "weight") {
                      if (key in changed) updated[key] = changed[key];
                      else delete updated[key];
                    }
                  update(i, updated);
                }}
                depth={0}
                ruleDepth={(props.ruleDepth ?? 0) + 1}
                skipWidget
              />
            </div>
          </div>
        );
      })}
      <button
        className="add-link"
        type="button"
        aria-label={`Add ${props.path.split(".").at(-1)} entry`}
        onClick={() => {
          add();
          props.onChange([...values, initialValue(Outcome)]);
        }}
      >
        + add outcome
      </button>
    </div>
  );
}
