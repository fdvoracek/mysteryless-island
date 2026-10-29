import type { ContentProblem } from "../../content";
import { kindLabels, kindSingulars, type Document } from "../documents";
import { describe } from "../describe";
import { entitySchemas } from "../schema";

export function EntityList({ documents, visible, selectedPath, scope, area, drafts, diagnostics, empty, select, create }: {
  documents: Document[]; visible: Document[]; selectedPath?: string; scope: string; area?: Document;
  drafts: ReadonlyMap<string, unknown>; diagnostics: ContentProblem[]; empty: string;
  select: (path: string) => void; create: (value: { kind: string; areaPath?: string }) => void;
}) {
  const links = (area?.raw as { activities?: unknown[] } | undefined)?.activities;
  const singular = kindSingulars[scope];
  return <section className="entity-list" aria-label="Entity list">
    <div className="list-heading"><h1>{area ? area.label : kindLabels[scope] ?? "All files"}</h1>
      <p>{area ? `${links?.length ?? 0} linked, in the order the player sees them` : `${visible.length} files`}</p></div>
    {visible.map(document => {
      const raw = document.raw as {
        hours?: number; category?: string; global?: boolean; visibleWhen?: unknown; requires?: unknown;
        tool?: { tags?: string[] };
      } | undefined;
      const activity = document.kind === "activities";
      const condition = raw?.visibleWhen ?? raw?.requires;
      const meta = activity ? condition === undefined ? "always" : describe(condition, "condition", documents)
        : document.kind === "items" ? raw?.tool?.tags?.length ? `tool · ${raw.tool.tags.join(" · ")}` : ""
        : kindLabels[document.kind] ?? document.kind;
      const key = activity ? raw?.hours === undefined ? "" : `${raw.hours} h` : document.kind === "items" ? raw?.category : "";
      return <button className="entity-row" key={document.path} aria-pressed={selectedPath === document.path}
        onClick={() => select(document.path)}>
        <span className="entity-row-title"><strong>{document.label}</strong><code>{document.id}</code>
          <span className="entity-row-key">{key}</span></span>
        <span className="entity-row-meta" title={meta}>{activity && raw?.global && <span className="global-badge">global</span>}
          {meta}{diagnostics.some(problem => problem.file === document.path) && " · has problems"}</span>
        {drafts.has(document.path) && <span className="dirty"><span aria-hidden="true">● </span>Unsaved</span>}
      </button>;
    })}
    {!visible.length && <p className="empty">{empty}</p>}
    {(area || Object.hasOwn(entitySchemas, scope)) && <div className="list-foot"><button onClick={() => create(area
      ? { kind: "activities", areaPath: area.path } : { kind: scope })}>
      {area ? `+ New activity in ${area.label}` : `+ New ${singular}`}
    </button></div>}
  </section>;
}
