import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Text } from "../content";
import { branches, unwrap } from "./schema";
import { placeholderMismatch, textChannel } from "./text";
import { Field, RawField, useForm, type FieldProps } from "./form";
import { Errors, Order, object, pathAt, reorder } from "./widgets";
function VariantInput({ value, path, change }: { value: string; path: string; change: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    const resize = () => {
      area.style.height = "auto";
      area.style.height = `${area.scrollHeight + 2}px`;
    };
    resize();
    let width: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resize();
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [value]);
  return <textarea ref={ref} aria-label={path} value={value} rows={1} onChange={(e) => change(e.target.value)} />;
}
export function TextWidget(props: FieldProps) {
  const { owner } = useForm();
  const raw = object(props.value);
  const mode = typeof props.value === "string" ? "single" : Array.isArray(props.value) ? "variants" : "explicit";
  const variants = mode === "single" ? [props.value as string] : mode === "variants" ? (props.value as unknown[]) : raw.variants;
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState(typeof raw.id === "string" ? raw.id : "");
  const valid = Array.isArray(variants) && variants.every((v) => typeof v === "string");
  if (!valid)
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
  const values = variants as string[];
  const channel = textChannel(owner.kind, props.path);
  const update = (next: string[]) =>
    props.onChange(mode === "single" ? (next[0] ?? "") : mode === "variants" ? next : { ...raw, variants: next });
  const switchMode = (next: string) => {
    if (next === mode) return;
    if (next === "single" && values.length !== 1) {
      setMessage("Single text needs one alternative. Remove extra alternatives explicitly before switching.");
      return;
    }
    if (mode === "explicit" && Object.keys(raw).some((k) => k.startsWith("_"))) {
      setMessage("This text has author comments. Keep the explicit form to preserve them.");
      return;
    }
    setMessage("");
    if (mode === "explicit") setSavedId(String(raw.id ?? ""));
    props.onChange(next === "single" ? values[0] : next === "variants" ? values : { id: savedId, variants: values });
  };
  return (
    <section className="text-widget" aria-label={`Text ${props.path}`}>
      <div className="text-header">
        <span className="badge">{channel}</span>
        <span className="variant-count">
          {values.length} {values.length === 1 ? "variant" : "variants"}
        </span>
        <select
          title="Changing text form may change its memo key."
          aria-label={`${props.path} text form`}
          value={mode}
          onChange={(e) => switchMode(e.target.value)}
        >
          <option value="single">Single text</option>
          <option value="variants">Alternative variants</option>
          <option value="explicit">Explicit ID and variants</option>
        </select>
      </div>
      {mode === "explicit" && (
        <Field
          schema={(unwrap(branches(Text)[2]) as z.AnyZodObject).shape.id}
          value={raw.id}
          path={pathAt(props.path, "id")}
          onChange={(id) => props.onChange({ ...raw, id })}
          depth={props.depth}
          ruleDepth={props.ruleDepth}
          skipWidget={false}
          view={{ hideLabel: false }}
        />
      )}
      {values.map((text, index) => (
        <div className="variant" key={index}>
          <span className="variant-index">{index + 1}</span>
          <VariantInput
            path={mode === "single" ? props.path : pathAt(mode === "explicit" ? pathAt(props.path, "variants") : props.path, index)}
            value={text}
            change={(next) => update(values.map((v, i) => (i === index ? next : v)))}
          />
          {channel === "journal" && (
            <span
              className={`variant-counter${text.length > 80 ? " warning" : ""}`}
              title={text.length > 80 ? "above journal guidance" : undefined}
            >
              {text.length}/80{text.length > 80 && <span className="visually-hidden"> — above journal guidance</span>}
            </span>
          )}
          {mode !== "single" && (
            <div className="variant-actions">
              <Order
                path={pathAt(props.path, index)}
                index={index}
                length={values.length}
                remove={() => update(values.filter((_, i) => i !== index))}
                move={(delta) => update(reorder(values, index, delta))}
              />
            </div>
          )}
        </div>
      ))}
      {mode !== "single" && (
        <button className="add-link" type="button" aria-label={`Add alternative to ${props.path}`} onClick={() => update([...values, ""])}>
          + add variant
        </button>
      )}
      <p className="text-hint">First variant is used by ?variants=first and tests.</p>
      {placeholderMismatch(values) && <p className="warning">Alternatives use different {"{placeholder}"} sets.</p>}
      {message && (
        <p role="alert" className="warning">
          {message}
        </p>
      )}
      <Errors schema={props.schema} value={props.value} />
    </section>
  );
}
