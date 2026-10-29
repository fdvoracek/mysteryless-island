import { z } from "zod";
import type { ContentProblem } from "../content";
import { hintFor, humanize } from "./hints";
import { branches, unwrap, type Schema } from "./schema";

/** Resolve presentation metadata without changing the store's raw diagnostics. */
export function fieldSchema(schema: Schema, path: string): Schema | undefined {
  if (!path) return schema;
  const [key, ...rest] = path.split(".");
  const node = unwrap(schema);
  const options = branches(node);
  if (options.length) return options.map(option => fieldSchema(option, path)).find(Boolean);
  const child = node instanceof z.ZodObject ? node.shape[key] as Schema | undefined
    : node instanceof z.ZodArray ? node.element : node instanceof z.ZodRecord ? node.valueSchema : undefined;
  return child && fieldSchema(child, rest.join("."));
}
/** Use meaningful field labels, retaining the nearest parent for nested problems. */
export function neededLabel(schema: Schema, path: string): string {
  const parts = path.split(".");
  const meaningful = parts.map((key, index) => ({ key, index }))
    .filter(({ key }) => !/^\d+$/.test(key) && !["all", "any", "not"].includes(key)).slice(-2);
  return meaningful.map(({ key, index }, position) => {
    const parent = fieldSchema(schema, parts.slice(0, index).join("."));
    const hint = position === meaningful.length - 1 && parent ? hintFor(parent, key)?.label : undefined;
    return hint ?? humanize(key);
  }).join(" › ");
}
export type CreateProblem = ContentProblem & { issue?: z.ZodIssue };
export function friendlyProblems(problems: CreateProblem[], schema: Schema): ContentProblem[] {
  const seen = new Set<string>();
  return problems.filter(problem => {
    if (seen.has(problem.path)) return false;
    seen.add(problem.path); return true;
  }).map(problem => {
    const field = fieldSchema(schema, problem.path);
    const node = field && unwrap(field);
    let message = problem.message;
    if (problem.path.split(".").at(-1) === "id" && (/snake_case|lowercase/.test(message) || problem.issue?.code === "invalid_string" && problem.issue.validation === "regex"))
      message = "Use lowercase letters, digits and _ — and a new ID.";
    else if (problems.some(other => other.path === problem.path && other.message === "Required; enter a value.") && node instanceof z.ZodString) message = "Required.";
    else if (problem.issue?.code === "invalid_enum_value") message = `Choose one: ${problem.issue.options.join(", ")}`;
    else if (node instanceof z.ZodEnum && message.startsWith("Invalid enum value")) message = `Choose one: ${node.options.join(", ")}`;
    else if (problem.issue?.code === "invalid_type" && problem.issue.received === "undefined" || message === "Required") message = "Required.";
    return { ...problem, message };
  });
}
