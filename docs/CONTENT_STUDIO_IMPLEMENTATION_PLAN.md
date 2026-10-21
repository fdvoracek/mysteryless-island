# Mysteryless Island — Content Studio implementation plan

Status: **[PR-01 and PR-02 implemented; PR-03 to PR-10 proposal]**
Revised: 2026-10-21 (replaces the earlier 30-PR monorepo/Pages-hosted plan)
Authority: this file is the single source for Studio scope, decisions and PR order. AGENTS.md,
ARCHITECTURE.md and docs/TDD.md only point here. Code and tests define current behavior.

> **Execution contract:** each numbered deliverable is exactly one PR with a working, manually
> testable result. No PR may break the game, its build or its tests (§5.1): the game stays fully
> playable after every merged PR. Do not start a PR whose open gate (§3) is unanswered; ask the
> owner. Never treat the mockup as implemented.

## 1. Goal and non-goals

**Goal.** A local tool that lets the owner create and edit content (areas, landmarks, activities,
items, recipes, buildings, creation trees, tasks, events, story links, English texts) through forms and
graphs instead of hand-editing several JSON files, and see the result immediately in the real game.
First real use: building the Stone Age chapter. Adding a new engine mechanic must make it appear in
the Studio with little or no Studio code.

**UX reference.** [docs/mockups/studio/](mockups/studio/README.md): five static, clickable screens
(area workspace, activity editor with condition builder, story view, event scene editor, generic
create dialog), their PR mapping and the Studio's visual tokens. They show intended layout and flows only;
this plan wins where they differ. PR-04 adopts the tokens; each UI PR updates its screen when a UX
decision changes.

**User.** Only the owner. Runs Node and Git locally, commits with own tools. AI agents implement;
the owner reviews and tests manually.

**Non-goals.** Hosting the Studio on GitHub Pages; Chrome File System Access; npm workspaces or a
monorepo; a content compiler or build-time bundles; remote GitHub publishing, accounts or a backend;
CSV/archive exchange; translations or any localization; multi-user collaboration; scripts or
`eval` in content; a React rewrite of the game; balance or story changes made only to exercise the
editor; arbitrary travel graphs.

## 2. Confirmed decisions (owner, 2026-10-21)

| # | Decision |
|---|---|
| C1 | **Localhost only.** `npm run studio` starts one Vite dev server serving the game at `/` and the Studio at `/studio/`. The Studio is never part of the production build or the Pages deploy. |
| C2 | **Single npm package.** Studio code lives in `studio/index.html` + `src/studio/`. Import boundaries are enforced by a lint rule, not by packages (§4.1). |
| C3 | **Content entities are independent.** Items, activities, recipes, buildings, quests, events, sites and artwork are standalone definitions that never name an area. **Areas link to them by ID** (`region.activities: ["gather_firewood"]`). One definition may be linked into several areas. |
| C4 | **Area-owned parts stay in the area:** description, arrival lines, `explore.view`, `nothingLeft` and **landmarks** (discoveries). |
| C5 | **One file per entity:** `content/<kind>/<id>.json` holds one object whose `id` equals the file name. Singletons stay single files: `game.json`, `stats.json`, `climate.json`, `trees/crafting.json`, `trees/building.json`. |
| C6 | **One-time reformat.** A deterministic JSON formatter defines the canonical layout; all content and fixtures are rewritten once; CI rejects unformatted content; Studio saves use the same formatter so diffs only show real edits. `_`-prefixed comment keys are preserved. |
| C7 | **English only.** Translations and localization are out of scope (owner, 2026-10-21). No language fields in the schema, no language switch, no translation tooling. |
| C8 | **Old saves may be discarded.** Bump `SAVE_VERSION` when the state shape changes and show the existing "start a new game" recovery. Fresh-game save/reload must work after every PR. |
| C9 | **Story = composition of existing vocabulary** (landmark effects → `startQuest` / flags → quest `trigger`/`completeWhen` → event `when`). The Studio adds a derived story view; no new story mechanic now. |
| C10 | **Branch handling is the owner's job.** The Studio edits whatever checkout it runs from; no branch or version checks. |
| C11 | **Graph views use React Flow** (`@xyflow/react`) with `@dagrejs/dagre` auto-layout, imported only from `src/studio` (owner, 2026-10-21). |
| C12 | Order of list kinds is an optional per-entity `order` field (sorted by order, then id); no central manifest. |

## 3. Open gates — ask before the affected PR

None open. Record any new owner decision in §2 and adjust the PR text before implementation.

## 4. Target architecture

### 4.1 Layout and boundaries

~~~text
index.html                 game entry (unchanged)
studio/index.html          Studio entry, dev server only
src/content/               schema, registry, loader, text keys, formatter, reference metadata
src/core/                  engine, rules, state, selectors (pure, unchanged boundary)
src/app/ src/persistence/ src/ui/ src/main.ts src/debug/   game only
src/studio/                React Studio: document store, forms, widgets, views
tools/vite-content-api.ts  dev-only Vite plugin: read/write content files
content/<kind>/<id>.json   one entity per file (C5)
~~~

Rules (lint: `no-restricted-imports` or dependency-cruiser in `npm run typecheck`/`check`):
`src/content` and `src/core` never import `src/ui`, `src/app`, `src/persistence` or `src/studio`;
the game never imports `src/studio`; the Studio may import `src/content` and `src/core` but never
reimplements rules. React and graph libraries are imported only from `src/studio`. Production
`vite build` uses only `index.html`; a test asserts that `dist/` contains no Studio code.

### 4.2 Local file API (dev server plugin, `apply: "serve"`)

- Binds to `127.0.0.1`; rejects requests whose `Host`/`Origin` is not the local dev server
  (protection against DNS rebinding and other sites).
- `GET /__studio/files` → every file under `content/` and `public/illustrations/`, as raw text plus
  a content hash. `PUT /__studio/files/<path>` with the expected hash → writes atomically
  (temp file + rename). `DELETE` and `POST …/rename` for entity delete/rename.
- Path allowlist: normalized relative paths under `content/` (`.json`) and
  `public/illustrations/` (images). Rejects `..`, absolute paths, symlinks leaving the allowlist,
  and everything else (`.git`, `.githooks`, `package.json`, configs, `.env*`).
- Hash mismatch → `409` so the Studio can show "changed on disk" and reload or overwrite.
- Multi-file operations (rename with reference updates) write files one by one and report exactly
  which files changed. Git is the recovery mechanism; no extra backup journal.

### 4.3 Document model, formatter and validation

- The Studio holds every content file as a raw JSON tree (including `_` comment keys). Edits change
  the raw tree; validation runs `buildRegistry` on a comment-stripped copy (debounced). Saving
  serializes the raw tree with the shared formatter.
- Formatter (`src/content/format.ts`, also `npm run content:format`): 2-space indent; an object or
  array is printed on one line when it fits in 110 characters and contains no multi-line child;
  key order preserved; trailing newline. `content:check` fails on unformatted files.
- `ContentError` gains structured problems `{ file, path, message }` (string output unchanged) so
  the Studio can link each problem to its entity and field.
- Undo/redo per Studio session; dirty markers per file; explicit save (button and Ctrl/Cmd+S).

### 4.4 Schema metadata, generic forms, widgets

- Reference metadata: ID fields that point at another entity use a helper in `schema.ts`, e.g.
  `ref("item")`, `ref("activity")`, implemented with Zod `.describe()` — no validation change.
  The same metadata drives reference pickers, "where used", safe delete, rename and the story view.
- Generic form: a Zod schema walker renders any object/array/union/enum/number/string/boolean/
  record/optional/lazy node. Discriminated condition/effect unions become a "kind" selector.
- Widget registry keyed by schema node (Condition, Effect, Outcome, Text, Amounts, Yield) or by
  `ref` kind overrides the generic renderer. Optional per-field labels/help live in one Studio
  metadata file; missing metadata falls back to the field name.
- **Create dialog:** one generic dialog per kind, built from the ID plus the schema's required
  fields. It saves only a valid entity (no placeholder text) and accepts pre-filled values, so
  shortcuts such as "new area unlocked by this discovery" reuse it instead of custom wizards.
- **Adding a mechanic** = schema + engine + registry check + test (as today). The field appears in
  the Studio automatically; a custom widget or label is optional polish.

### 4.5 Preview (PR-10)

- The Studio shows the real game in an iframe (`/?preview`). Saving a content file triggers Vite's
  reload of the game; nothing else is needed for fresh content.
- `?preview` switches the save keys to `textisland.preview.*` so the owner's own saves are untouched,
  and enables the existing `ti` debug console. The Studio preview panel offers new game (optional
  seed), `?variants=first`, and buttons wrapping existing `ti` commands (give item, advance time,
  unlock area). New debug commands only if a PR needs them, with tests.

## 5. PR conventions

1. Contract: what changes, which files, what the owner tests manually (a short numbered list).
2. Tests with the change, including at least one rejection case for new validation or API input.
   Game rules stay in engine tests on the frozen fixtures; browser tests only for wiring/UI.
3. `npm run check` green (plus Studio tests once they exist). Report anything not run and why.
4. Automated game smoke stays in `e2e/smoke.spec.ts`; the owner's manual test focuses on the new
   capability.
5. No placeholder controls presented as working; hide unfinished UI.
6. Fixtures change only through the PR's stated migration (PR-02, PR-03), with parity proof.
7. Update docs only for what the PR implements; mark [implemented] vs [proposal].

### 5.1 Game safety rules

The owner pauses engine and game-content work while this program runs (owner, 2026-10-21), so no
transition or dual-layout support is needed. The game must still work after every PR:

1. **Additive by default.** Studio code lives only in `studio/`, `src/studio/` and `tools/`. The
   game never imports it and the production build excludes it.
2. **Shared code is touched only where listed**, keeping current behavior: PR-02 loader/registry
   (file layout), `src/content/format.ts`, the `content:format` script and the optional `order`
   field for observably ordered list kinds; PR-03 schema/registry/engine (activity links);
   PR-04 structured `ContentError` (string output unchanged); PR-05 `ref()` metadata (no
   validation change); PR-10 preview save keys (active only with `?preview`). Any other change to `src/content`, `src/core`, `src/ui`,
   `src/persistence` or `src/main.ts` is out of scope; stop and ask.
3. **Golden traces (PR-01) must stay unchanged** in every Studio PR.
4. **Saves.** Only PR-03 may bump `SAVE_VERSION` (and only if text keys or state actually change).
   Preview mode never reads or writes the player's save keys.
5. **Future engine work stays cheap.** The generic form renders unsupported Zod node kinds as a
   validated raw-JSON field instead of failing, widgets bind to schema objects (Condition, Effect,
   Text) rather than field names, and Studio code imports shared code only through
   `src/content/index.ts` and the public engine API. Adding or renaming a schema field later must
   not require Studio changes.

## 6. Delivery sequence

### Phase A — content foundations (no Studio yet)

**PR-01 — Golden traces.** **[implemented]** Seeded command scripts on the frozen fixtures produce a normalized
snapshot (state + journal). Covers shipwreck, exploration, an activity with outcomes, crafting,
building + production, a quest, an event branch, sleep and save/reload.
*Done when:* snapshots are committed and stable across runs. *Owner test:* none beyond CI.
Implementation: [trace scripts](../tests/golden-traces.test.ts) and their committed
[snapshots](../tests/__snapshots__/golden-traces.test.ts.snap).

**PR-02 — Formatter and one file per entity.** **[implemented]** Add the formatter and
`content:format`; loader and registry read one object per file for every list kind, enforce
`file name == id`, and keep singletons. A one-off migration script splits content and fixtures,
then is deleted. The only schema change is optional `order: number` on observably ordered list kinds; the registry sorts by `(order ?? +Infinity, id)`. Migration assigns original array
index × 10 to preserve behavior. Kinds without observable order have no new field. No behavior change.
*Done when:* golden traces unchanged; `content:check` passes and rejects an unformatted file, a
legacy multi-entity file and a file/id mismatch. *Owner test:* play a fresh game to the first craft.

**PR-03 — Independent activities.** Move activities to `content/activities/<id>.json`;
`region.activities` becomes a list of IDs; `global` keeps its meaning (offered everywhere, not
linked). The registry records each activity's linked areas; engine/selector checks use "linked to
the current area or global". Validator: unknown activity ID, an activity neither linked nor global.
`did`/`today` counters stay per activity ID across areas. Bump `SAVE_VERSION` if text keys or state
change.
*Done when:* golden traces equal (except intentionally re-keyed text memo), a test links one activity
into two areas. *Owner test:* fresh game, actions appear in the same places as before.

### Phase B — Studio core

**PR-04 — Studio shell, file API, browser.** `npm run studio`; the dev plugin (§4.2) with
path-traversal, foreign-origin, non-allowlisted and stale-hash tests; React shell with navigation
by kind and by area, entity list with search, read-only formatted JSON, structured diagnostics
linked to entities. Lint boundary rule, the "no Studio in dist" test and the public shared surface
`src/content/index.ts` (re-exports only; no behavior change).
*Owner test:* open the Studio, browse Forest and an item, break a reference by hand, see the error.

**PR-05 — Generic editor, create dialog and save.** `ref()` metadata in the schema; generic form
+ widget registry (§4.4) with reference pickers; edit, duplicate, delete with "where used"
blocking; undo/redo; save through the formatter; conflict dialog on `409`. **Create dialog**
(§4.4) for every kind: asks for the ID and the schema's required fields, saves only a valid
entity, then opens it in the form. Callers can pre-fill fields (used later by the story view).
*Done when:* every current entity kind round-trips through the form unchanged (test over all fixture
files); invalid edits show inline errors and cannot be saved; the create dialog is generated from
the schema for every kind (test iterates the kinds) and rejects a duplicate or malformed ID.
*Owner test:* create an item through the dialog, link it as a yield of an activity, save, see a
one-entity git diff; create an area through the dialog and see it in the game after reload.

**PR-06 — Condition/effect builder and text widget.** Recursive all/any/not tree, a form per leaf
and effect kind generated from the schema unions, human-readable summary using the engine's
`explain`, JSON view; text widget with variants (alternatives, never paragraphs), modal vs journal
labeling and the 80-character journal guidance from docs/NARRATIVE_STYLE.md.
*Done when:* every condition/effect kind in `schema.ts` can be built without typing JSON (test
iterates the union), and the summary matches `explain`. *Owner test:* "visible after the spring is
discovered and while carrying the water can", checked in the game.

### Phase C — authoring views

Until PR-10, playtest in the game served by the same dev server (`/`, a second window); it reloads
when the Studio saves a content file.

**PR-07 — Area workspace and rename.** One screen per area: properties, map cell picker,
unlock/hint conditions, view/arrive lines, landmarks, linked activities, and everything that
references the area or its landmarks. "New area" uses the PR-05 create dialog; there is no separate
wizard. Rename any entity ID with a preview of all files that change.
*Owner test:* create a temporary area, set its map cell and an unlock rule on a landmark, add a
landmark and a linked activity, reach it in the game, then delete it (blocked while referenced).

**PR-08 — Story view and event editor.** Adds React Flow (C11). Derived read-only graph of
landmarks, quests, events, flags and area unlocks with edges from conditions/effects; click opens
the entity. "Continue the story" actions open the create dialog pre-filled with the linking
condition (new task, event or area on a discovery). Event editor: scenes as nodes, choices as
edges, side panel uses the generic form; flags dangling `next`, unreachable scenes and missing
`start`.
*Owner test:* landmark → task → event chain created in the Studio and played in the game.

**PR-09 — Creation tree and map editors.** React Flow tree editor for crafting/building
(parents, branch, order; new recipe/building gets its node in the same save; cycles rejected);
area map editor that drags `region.map` cells and shows the existing camp-centered paths and travel
hours.
*Owner test:* add a recipe under the axe, craft it in the game; move an area on the map.

### Phase D — convenience

**PR-10 — Live preview.** Game iframe inside the Studio with `?preview` save isolation, reload on
save and the preview panel (§4.5). Moved last by the owner (2026-10-21): playing in a second window
is enough until then.
*Done when:* a test shows preview mode never writes `textisland.save`/`textisland.saved`.
*Owner test:* edit a landmark text, see it in the preview without touching your own save.

## 7. Definition of done for the program

The owner can build a new Stone Age area — with landmarks, linked activities, new items, recipes,
buildings with production, tree nodes, tasks and a branching event connected through discoveries —
without opening a JSON file, playtest it in the game and commit a content-only diff.
