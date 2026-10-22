/** Public, browser-safe content surface. Loading a pack remains the caller's responsibility. */
export * from "./schema";
export { buildRegistry, ContentError, type ContentProblem, type Registry, type TreeIndex } from "./registry";
export { formatContent, isFormattedContent } from "./format";
export { indexTextKeys } from "./text-keys";
