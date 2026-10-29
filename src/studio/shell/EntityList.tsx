import type { ContentProblem } from "../../content";
import { kindLabels, kindSingulars, type Document } from "../documents";
import { describe } from "../describe";
import { entitySchemas } from "../schema";

export function distinguishingMeta(rows: Document[], documents: Document[]): Map<string, string> {
  const activities = rows.filter(row => row.kind === "activities").map(row => {
    const raw = row.raw as { visibleWhen?: unknown; requires?: unknown } | undefined;
    const condition = raw?.visibleWhen ?? raw?.requires;
    const group = condition as { all?: unknown[]; any?: unknown[] } | undefined;
    const full = condition === undefined ? "always" : describe(condition, "condition", documents);
    const parts = Array.isArray(group?.all) ? group.all.map(child => describe(child, "condition", documents)) : [full];
    const unwrapped = (Array.isArray(group?.all) || Array.isArray(group?.any)) && full.startsWith("(") && full.endsWith(")")
      ? full.slice(1, -1) : full;
    return { row, full, parts, unwrapped };
  });
  return new Map(activities.map(activity => {
    const peers = activities.filter(other => other.row.label === activity.row.label);
    const unique = activity.parts.filter(part => !peers.every(peer => peer.parts.includes(part)));
    return [activity.row.path, peers.length > 1 ? unique.join(" · ") || activity.full : activity.unwrapped];
  }));
}

export function EntityList({ documents, visible, selectedPath, scope, area, drafts, diagnostics, empty, select, create }: {
  documents: Document[]; visible: Document[]; selectedPath?: string; scope: string; area?: Document;
  drafts: ReadonlyMap<string, unknown>; diagnostics: ContentProblem[]; empty: string;
  select: (path: string) => void; create: (value: { kind: string; areaPath?: string }) => void;
}) {
  const links = (area?.raw as { activities?: unknown[] } | undefined)?.activities;
  const singular = kindSingulars[scope];
  const activityMeta = distinguishingMeta(visible, documents);
  return <section className="entity-list" aria-label="Entity list">
    <div className="list-heading"><h1>{area ? area.label : kindLabels[scope] ?? "All files"}</h1>
      <p>{area ? `${links?.length ?? 0} linked, in the order the player sees them` : `${visible.length} files`}</p></div>
    {visible.map(document => {
      const raw = document.raw as {
        hours?: number; category?: string; global?: boolean; visibleWhen?: unknown; requires?: unknown;
        tool?: { tags?: string[] };
      } | undefined;
      const activity = document.kind === "activities";
      const meta = activity ? activityMeta.get(document.path)!
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
