import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AreaWorkspace } from "../../src/studio/area-workspace";
import { EventEditor } from "../../src/studio/event-editor";
import { Field, FormContext } from "../../src/studio/form";
import { readDocuments, type Document, type FileDocument } from "../../src/studio/documents";
import { schemaFor } from "../../src/studio/schema";
import { StudioStore } from "../../src/studio/store";

const fixtureRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));
function fixtureFiles(directory = join(fixtureRoot, "content")): FileDocument[] {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? fixtureFiles(path) : entry.name.endsWith(".json")
      ? [{ path: relative(fixtureRoot, path), content: readFileSync(path, "utf8"), hash: entry.name, encoding: "utf8" as const }]
      : [];
  });
}
const files = fixtureFiles();
const { documents, diagnostics } = readDocuments(files);
const cases = documents.flatMap(owner => [
  { owner, view: owner.kind === "events" ? "event" : "form" },
  ...(owner.kind === "regions" ? [{ owner, view: "area" }] : []),
]);

function renderForm(owner: Document, view: string): string {
  const store = new StudioStore();
  store.disk = files;
  const props = {
    schema: schemaFor(owner.path)!, value: owner.raw, path: "", owner, documents,
    problems: diagnostics.filter(problem => problem.file === owner.path), buffers: store.buffersFor(owner.path), lockId: true,
    onChange: () => { throw new Error("Rendering must not edit content"); },
    onError: () => { throw new Error("Rendering must not report errors"); },
  };
  const { owner: formOwner, documents: formDocuments, problems, buffers, lockId, onError, ...field } = props;
  const element = view === "area" ? createElement(AreaWorkspace, { ...field, open: () => {}, newActivity: () => {} })
    : view === "event" ? createElement(EventEditor, { ...field, rename: () => {} }) : createElement(Field, field);
  return renderToStaticMarkup(createElement(FormContext.Provider,
    { value: { owner: formOwner, documents: formDocuments, problems, buffers, lockId, onError } }, element));
}

function normalizeIds(markup: string): string {
  const ids = new Map<string, string>();
  return markup.replace(/_R_[a-zA-Z0-9]+(?:H[0-9]+)?_/g, id => {
    if (!ids.has(id)) ids.set(id, `FORM_ID_${ids.size + 1}`);
    return ids.get(id)!;
  });
}
const sha256 = (markup: string) => createHash("sha256").update(markup).digest("hex");
function difference(previous: string, actual: string): string {
  let index = 0;
  while (index < Math.min(previous.length, actual.length) && previous[index] === actual[index]) index++;
  if (index === previous.length && index === actual.length) return "Previous local render is identical.";
  const start = Math.max(0, index - 150);
  return `First local difference at character ${index}:\nprevious: ${previous.slice(start, start + 300)}\nactual: ${actual.slice(start, start + 300)}`;
}

for (const { owner, view } of cases) {
  it(`preserves form markup: ${owner.path} (${view})`, () => {
    const markup = normalizeIds(renderForm(owner, view));
    const record = { path: owner.path, view, length: markup.length, sha256: sha256(markup) };
    const output = join("test-results/form-markup", view, `${owner.path}.html`);
    const previous = existsSync(output) ? readFileSync(output, "utf8") : undefined;
    // Keep local renders outside Git, including successful runs, for useful later diffs.
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, markup);
    try {
      expect(record).toMatchSnapshot();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      const expected = String((failure as { expected?: unknown }).expected).match(/"sha256": "([a-f0-9]{64})"/)?.[1] ?? "see snapshot diff below";
      throw new Error(`${owner.path} (${view})\nExpected SHA-256: ${expected}\nActual SHA-256: ${record.sha256}\nHTML: ${output}\n${previous === undefined ? "No previous local render available." : difference(previous, markup)}\n${message}`);
    }
  });
}
