import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import type { ContentProblem } from "../content";
import type { Document } from "./documents";
import { unwrap, type Schema } from "./schema";
import { sectionsFor, schemaName, type Section } from "./hints";
import { summarize } from "./summary";
import { readSections, rememberSection } from "./section-prefs";
const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
export function rootSections(schema: Schema | undefined, value: unknown): (Section & { fields: string[] })[] | undefined {
  if (!schema || !value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const sections = sectionsFor(schema),
    node = unwrap(schema);
  if (!sections || !(node instanceof z.ZodObject)) return undefined;
  const raw = recordValue(value);
  const setKeys = Object.keys(raw).filter((key) => raw[key] !== undefined && !(key.startsWith("_") && typeof raw[key] === "string"));
  const grouped = sections.map((section) => ({
    ...section,
    fields: section.keys.filter((key) => setKeys.includes(key) && key in node.shape),
  }));
  const listed = new Set(sections.flatMap((section) => section.keys));
  const other = setKeys.filter((key) => !listed.has(key));
  grouped.push({ title: "Other", keys: other, fields: other });
  const nonEmpty = grouped.filter((section) => section.fields.length);
  return nonEmpty;
}
export function fileContentsClass(schema: Schema | undefined, mode: string, value: unknown, workspace = false): string {
  return `json-panel${mode === "form" && (workspace || rootSections(schema, value)?.length) ? " json-panel-bare" : ""}`;
}
export function OptionalChip({ name, label, add }: { name: string; label: string; add: () => void }) {
  return (
    <button className="optional-chip" type="button" aria-label={`Add ${name}`} onClick={add}>
      + {label}
    </button>
  );
}
export function RootSections({
  schema,
  raw,
  groups,
  problems,
  documents,
  renderFields,
}: {
  schema: Schema;
  raw: Record<string, unknown>;
  groups: NonNullable<ReturnType<typeof rootSections>>;
  problems: ContentProblem[];
  documents: Document[];
  renderFields: (keys: string[]) => ReactNode;
}) {
  return groups.map((section) => {
    const count = problems.filter((problem) =>
      section.keys.some((key) => problem.path === key || problem.path.startsWith(`${key}.`)),
    ).length;
    return (
      <SectionCard
        key={`${schemaName(schema)}:${section.title}`}
        name={schemaName(schema)}
        title={section.title}
        preview={summarize(schema, raw, section.fields, documents)}
        count={count}
      >
        {renderFields(section.fields)}
      </SectionCard>
    );
  });
}
export function SectionCard({
  name,
  title,
  preview,
  count,
  children,
}: {
  name?: string;
  title: string;
  preview: string;
  count: number;
  children: ReactNode;
}) {
  // This prop stays constant after mount: subsequent native/programmatic toggles belong to the DOM.
  const [initialOpen] = useState(() => !name || !readSections(name).includes(title));
  return (
    <details className="form-section" open={initialOpen}>
      <summary
        className="form-section-summary"
        onClick={(event) => {
          event.preventDefault();
          const details = event.currentTarget.parentElement as HTMLDetailsElement;
          details.open = !details.open;
          if (name) rememberSection(name, title, !details.open);
        }}
      >
        <strong>{title}</strong>
        {count > 0 && (
          <span className="form-section-problems">
            {count} {count === 1 ? "problem" : "problems"}
          </span>
        )}
        <span className="form-section-preview">{preview}</span>
      </summary>
      <div className="form-section-body object-fields">{children}</div>
    </details>
  );
}
export function AuthorNote({ name, value, change }: { name: string; value: string; change: (value: string) => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = area.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }
  }, [value]);
  return (
    <div className="author-note" data-field={name}>
      <div>
        Note <code>{name}</code>
      </div>
      <textarea ref={area} aria-label={name} rows={1} value={value} onChange={(event) => change(event.target.value)} />
    </div>
  );
}
