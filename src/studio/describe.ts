import { z } from "zod";
import { Condition, Effect } from "../content";
import { branches, unwrap, type Schema } from "./schema";
import { referenceLabel } from "./references";
import type { Document } from "./documents";

export const BUILDER_DEPTH = 6;
export function unionKinds(schema: Schema): { kind: string; schema: Schema }[] {
  return branches(schema).flatMap((schema) => {
    const node = unwrap(schema);
    return node instanceof z.ZodObject ? [{ kind: Object.keys(node.shape)[0], schema }] : [];
  });
}
type Phrase = (v: Record<string, any>, name: (kind: string, id: string) => string, recurse: (v: unknown) => string) => string;
const range = (v: Record<string, unknown>, fallback = "") => [v.gte !== undefined ? `at least ${v.gte}` : "", v.lte !== undefined ? `at most ${v.lte}` : ""].filter(Boolean).join(" and ") || fallback;
export const conditionPhrases: Record<string, Phrase> = {
  all: (v, _, d) => `(${v.all.map(d).join(" and ")})`, any: (v, _, d) => `(${v.any.map(d).join(" or ")})`, not: (v, _, d) => `not (${d(v.not)})`,
  item: (v, n) => `carrying ${n("item", v.item)}: ${range(v, "at least 1")}`,
  seen: (v, n) => `have seen ${n("item", v.seen)}`, flag: v => `flag ${v.flag} is set`,
  timer: (v, n) => `${n("timer", v.timer)} hours: ${range(v, "running")}`,
  at: (v, n) => `at ${n("region", v.at)}`, region: (v, n) => `${n("region", v.region)} unlocked`,
  stat: (v, n) => `${n("stat", v.stat)}: ${range(v, "any value")}`,
  warmth: (v, n) => `warmth is ${v.warmth.map((id: string) => n("band", id)).join(" or ")}`,
  phase: (v, n) => `phase is ${v.phase.map((id: string) => n("phase", id)).join(" or ")}`,
  effort: v => `effort is ${v.effort.join(" or ")}`, day: v => `day: ${range(v.day, "any day")}`,
  did: (v, n) => `${n("did", v.did)} done ${range(v, "at least 1")} times`,
  today: (v, n) => `${n("today", v.today)} today: ${range(v, "at least 1")} times`,
  reached: v => `reached day ${v.reached.day}${v.reached.hour === undefined ? "" : ` at hour ${v.reached.hour}`}`,
  quest: (v, n) => `${n("quest", v.quest)} is ${v.is}`, discovered: (v, n) => `${n("discovery", v.discovered)} discovered`,
  explored: (v, n) => `${n("region", v.explored)} explored ${range(v, "at least 1")} times`,
  tool: (v, n) => `have a ${n("tool", v.tool)} tool`, site: (v, n) => `site supports ${n("site", v.site)}`,
  built: (v, n) => `${n("building", v.built)} built${v.here ? " here" : " anywhere"}`,
  sheltered: v => v.sheltered ? "sheltered" : "unsheltered", building: (v, n) => `${n("building", v.building)} is ${v.is}`,
};
const amounts = (v: Record<string, number>, n: (kind: string, id: string) => string, kind: string) => Object.entries(v).map(([id, amount]) => `${amount} ${n(kind, id)}`).join(", ");
export const effectPhrases: Record<string, Phrase> = {
  give: (v, n) => `give ${amounts(v.give, n, "item")}`, take: (v, n) => `take ${amounts(v.take, n, "item")}`,
  stat: (v, n) => `change stats: ${amounts(v.stat, n, "stat")}`, timer: (v, n) => `add ${v.addHours} hours to ${n("timer", v.timer)}`,
  flag: v => `set flag ${v.flag}`, unflag: v => `clear flag ${v.unflag}`, log: () => "write a journal entry",
  roll: v => `roll among ${v.roll.length} weighted outcomes`, startQuest: (v, n) => `start ${n("quest", v.startQuest)}`,
  unlock: (v, n) => `unlock ${n("region", v.unlock)}`, build: (v, n) => `build ${n("building", v.build)}`,
  startCycle: (v, n) => `start ${n("building", v.startCycle)}${v.production ? ` producing ${v.production}` : ""}${v.units === undefined ? "" : ` for ${v.units} units`}`,
};
export function describe(value: unknown, type: "condition" | "effect", documents: Document[] = [], depth = 0): string {
  if (depth >= BUILDER_DEPTH) return "nested rule (see JSON)";
  const schema = type === "condition" ? Condition : Effect;
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const kind = unionKinds(schema).find(({ kind }) => kind in raw)?.kind;
  const phrase = kind && (type === "condition" ? conditionPhrases : effectPhrases)[kind];
  if (!phrase) return "unknown rule (see JSON)";
  try { return phrase(raw, (kind, id) => referenceLabel(kind, id, documents), v => describe(v, type, documents, depth + 1)); }
  catch { return `incomplete ${kind} rule`; }
}
