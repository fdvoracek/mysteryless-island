import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";
import { afterAll, expect, it } from "vitest";
import { GAME_FLAGS } from "../../src/studio/game-flags";
import { referenceRole } from "../../src/studio/story";
import { refKind } from "../../src/studio/schema";
import { RESERVED_IDENTITIES } from "../../src/studio/reserved";
import { schemaFor, visitValue } from "../../src/studio/schema";

const STUDIO_ROOT = mkdtempSync(join(tmpdir(), "studio-reserved-"));
for (const [name, source] of [["shipped", "../../content"], ["fixture", "../fixtures/content"]]) cpSync(new URL(source, import.meta.url), join(STUDIO_ROOT, name, "content"), { recursive: true });
afterAll(() => rmSync(STUDIO_ROOT, { recursive: true, force: true }));
function files(root: string): string[] {
  return readdirSync(root).flatMap(name => { const path = join(root, name); return statSync(path).isDirectory() ? files(path) : [path]; });
}
/** Exact, reviewed vocabulary collisions. A new lookup, even in the same file,
 * must fail rather than inheriting a broad ID/file exemption. */
const HARMLESS_LITERAL_MATCHES = [
  // Condition discriminator and printed time unit, not the climate phase named day.
  { file: "src/core/conditions.ts", literal: "day", line: 'if ("day" in c) return inRange(day(s.time), c.day);' },
  { file: "src/core/engine.ts", literal: "day", line: 'const parts = [d ? unit(d, "day") : "", h ? unit(h, "hour") : "", !d && !h ? unit(m, "minute") : ""].filter(Boolean);' },
  // Effort enums used as defaults, not content identities or record lookups.
  { file: "src/core/engine.ts", literal: "work", line: 'return this.startWork({ kind: "travel", destination: regionId }, `walk to ${to.name}`, hours, "work", undefined, eventKeys);' },
  { file: "src/core/engine.ts", literal: "light", line: 'return this.startWork({ kind: "consume", item: itemId }, `${c.verb} ${item.name}`, c.hours, c.effort ?? "light", { [itemId]: 1 }, [itemId, ...(c.tags ?? [])]);' },
  // Presentation icon derived from the shelterWhen capability, not the shelter building ID.
  { file: "src/core/selectors.ts", literal: "shelter", line: 'if (engine.reg.regions.get(regionId)?.shelterWhen && evaluate(engine.reg.regions.get(regionId)!.shelterWhen, ctx)) found.add("shelter");' },
] as const;

it("guards content identities and record keys against unreviewed engine literals", () => {
  const ids = new Set<string>();
  const flagReads = new Set<string>();
  for (const pack of ["shipped", "fixture"]) for (const file of files(join(STUDIO_ROOT, pack, "content"))) {
    const path = relative(join(STUDIO_ROOT, pack), file), schema = schemaFor(path);
    if (!schema) continue;
    visitValue(schema, JSON.parse(readFileSync(file, "utf8")), ({ schema, value, path, key }) => {
      if (typeof value === "string" && refKind(schema) === "flag" && !referenceRole({ file: "", path, kind: "flag", id: value }).effect) flagReads.add(value);
      if (typeof value === "string" && (key || path.split(".").at(-1) === "id")) ids.add(value);
    });
  }
  const reserved = new Set(RESERVED_IDENTITIES.map(entry => entry.id));
  const root = new URL("../../", import.meta.url).pathname;
  const sources = [...files(join(root, "src/core")).filter(path => path.endsWith(".ts")), join(root, "src/content/registry.ts")];
  const unmatched: string[] = [];
  for (const path of sources) {
    const file = relative(root, path), text = readFileSync(path, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (file.startsWith("src/core/") && ts.isStringLiteralLike(node) && flagReads.has(node.text) && !GAME_FLAGS.some(flag => flag.id === node.text)) {
        unmatched.push(`${file}: engine flag ${node.text} needs a documented GAME_FLAGS entry`);
      }
      // The engine currently constructs these flags with a finite stat union.
      // Expand template substitutions from their lexical for-of array, so this
      // guard also catches new auto_${stat}_unavailable-style protocol flags.
      if (file.startsWith("src/core/") && ts.isTemplateExpression(node)) {
        let values = [node.head.text];
        for (const span of node.templateSpans) {
          const expression = span.expression;
          const literals: string[] = [];
          let parent: ts.Node | undefined = node.parent;
          while (parent) {
            if (ts.isForOfStatement(parent) && ts.isIdentifier(expression) && ts.isVariableDeclarationList(parent.initializer) && parent.initializer.declarations.some(d => d.name.getText(source) === expression.text)) {
              const collect = (child: ts.Node) => { if (ts.isStringLiteral(child)) literals.push(child.text); else ts.forEachChild(child, collect); };
              collect(parent.expression); break;
            }
            parent = parent.parent;
          }
          values = values.flatMap(prefix => literals.map(value => prefix + value + span.literal.text));
        }
        for (const value of values) if (flagReads.has(value) && !GAME_FLAGS.some(flag => flag.id === value)) unmatched.push(`${file}: constructed engine flag ${value} needs a documented GAME_FLAGS entry`);
      }
      if (ts.isStringLiteralLike(node) && ids.has(node.text) && !reserved.has(node.text)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        if (HARMLESS_LITERAL_MATCHES.some(match => match.file === file && match.literal === node.text && match.line === text.split("\n")[line].trim())) return;
        unmatched.push(`${file}:${line + 1}: ${JSON.stringify(node.text)} — ${text.split("\n")[line].trim()}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(unmatched, "Review every new match with the owner before reserving another ID:\n" + unmatched.join("\n")).toEqual([]);
});
