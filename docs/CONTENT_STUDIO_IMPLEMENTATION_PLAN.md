# Mysteryless Island — Content Studio implementation plan

Status: **[PR-01 to PR-10 implemented]**
Revised: 2026-10-22 (replaces the earlier 30-PR monorepo/Pages-hosted plan)
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

PR-03 owner clarification (2026-10-22): global activities may also be linked; they appear once
at their linked position in a linked area and at the end elsewhere. Re-record golden snapshots
once after proving that only activity memo-key paths and `saveVersion` differ; do not normalize
those differences in the permanent comparison.

Owner decision (2026-10-22), PR-06: Human-readable summaries use a Studio-only `describe()`
with one phrase template per Condition and Effect kind, checked against the schema unions.
Do not use or change the engine’s state-dependent, partial `explain()`. Every condition and
effect kind must have a summary phrase (test iterates the unions).

Owner decision (2026-10-22), PR-07: Engine protocol identities cannot be renamed in the
Studio. The reserved event scene key `start`, activity ID `sleep` (owner approval: the engine counts
every night under this ID), and stat IDs `health`, `energy`, `hunger`, and
`thirst` live in one Studio constant with a reason per identity; rename validation rejects them
and the UI shows disabled rename controls with those reasons. A guard scans string literals in
`src/core/**/*.ts` and `src/content/registry.ts` against IDs and record keys from temporary copies
of shipped and fixture content. Every match must be reserved or explicitly documented as a
harmless vocabulary collision in a small test allowlist. Report additional hardcoded identities
to the owner before adding reservations; do not change game code to make them renameable.

Owner decision (2026-10-22), PR-07: “New activity in this area” reuses the PR-05 create
dialog and stages the activity definition plus its ordered area link as one undo step. The
shortcut is an explicit, user-chosen link; ordinary Create never links automatically. Save all
validates and saves both files under §4.3. Area deletion offers Keep or Delete them too for
activities that would otherwise be neither linked nor global; Keep requires relinking before Save.

Owner decisions (2026-10-22), PR-10:
- Vite's automatic full reload also reloads the Studio page when a game page is open (the game's
  module graph contains the content JSON), which would discard drafts and undo history. In Studio
  mode the plugin therefore suppresses that reload for allowed content paths (`handleHotUpdate`, plus
  the add/remove path through `ws.send`). It keeps the existing `studio:files-changed` event, and
  `src/main.ts` reloads the game page on it (`import.meta.hot`, debounced about 400 ms), so the
  preview and an **Open game** tab still reload. Production bundles contain no trace of it.
- Under `STUDIO_ROOT` the game's content glob resolves against `STUDIO_ROOT/content` as a whole
  (studio plugin only, with `server.fs.allow` for that directory; `src/content/loader.ts` is
  unchanged; the checkout's `content/` stays denied). Without `STUDIO_ROOT` nothing changes.
- `?preview&seed=<digits>` starts a new game with that seed and removes `seed` from the URL;
  `ti.unlock(regionId)` is the only new debug command.

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

- Binds to `127.0.0.1`; accepts `Host: 127.0.0.1:<port>` or `Host: localhost:<port>`
  at the actual listening port. When present, `Origin` must be `http://` plus that same Host.
  Other Hosts/Origins are rejected; forwarded headers are never read
  (protection against DNS rebinding and other sites).
- `GET /__studio/files` → every file under `content/` and `public/illustrations/`, as raw text plus
  a content hash. `PUT /__studio/files/<path>` with the expected hash → writes atomically
  (temp file + rename). `DELETE` and `POST …/rename` for entity delete/rename.
- Path allowlist: normalized relative paths under `content/` (`.json`) and
  `public/illustrations/` (images). Rejects `..`, absolute paths, symlinks leaving the allowlist,
  and everything else (`.git`, `.githooks`, `package.json`, configs, `.env*`).
- Hash mismatch → `409` so the Studio can show "changed on disk" and reload or overwrite.
- Owner decision (2026-10-22): the allowlist also contains `studio-layout/<name>.json` (one directory, JSON
  only, same traversal, symlink and Host/Origin rules) for the story graph's pinned positions. The game never
  reads it. See [STUDIO.md](STUDIO.md).
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


Owner decision (2026-10-22), PR-05: Create and Duplicate open unsaved drafts after entity-schema
and ID format/uniqueness validation. They never write registry-invalid content to disk. Save
writes all dirty files sequentially through the shared formatter and expected-hash API, only
when the complete draft pack has no diagnostics. If the disk pack is already invalid, Save may
strictly reduce its diagnostics without introducing any new diagnostic. Linking activities and
adding creation-tree nodes use generic forms in the same save; neither is automatic. Partial
failure reports exactly which files were written and not written and retains unsaved drafts.

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
  fields. It opens a schema-valid unsaved draft (no placeholder text) and accepts pre-filled values, so
  shortcuts such as "new area unlocked by this discovery" reuse it instead of custom wizards.
- **Adding a mechanic** = schema + engine + registry check + test (as today). The field appears in
  the Studio automatically; a custom widget or label is optional polish.

### 4.5 Preview (PR-10)

- The Studio shows the real game in an iframe (`/?preview`). The plugin reports saved content files
  and the game page reloads itself (see the PR-10 owner decisions in §2).
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
   validation change); PR-10 preview save keys, seed handling, `ti.unlock` and the dev-only reload listener in `src/main.ts` (active only with `?preview` or the Studio dev server). Any other change
   to `src/content`, `src/core`, `src/ui`, `src/persistence` or `src/main.ts` is out of scope;
   stop and ask.
3. **Golden traces (PR-01) must stay unchanged** in every Studio PR except the approved
   PR-03 re-recording with narrow parity proof below.
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
then is deleted. The only schema change is optional `order: number` on observably ordered list
kinds; the registry sorts by `(order ?? +Infinity, id)`. Migration assigns original array
index × 10 to preserve behavior. Kinds without observable order have no new field.
No behavior change.
*Done when:* golden traces unchanged; `content:check` passes and rejects an unformatted file, a
legacy multi-entity file and a file/id mismatch. *Owner test:* play a fresh game to the first craft.

**PR-03 — Independent activities.** **[implemented]** Move activities to `content/activities/<id>.json`;
`region.activities` becomes a list of IDs; `global` keeps its meaning (offered everywhere).
A global activity may also be linked: offer it once at its linked position there, and at the end
elsewhere. Preserve existing action order, including beach’s global links. The registry records
each activity’s linked areas; engine/selector checks use "linked to the current area or global".
Validator: unknown activity ID, an activity neither linked nor global.
`did`/`today` counters stay per activity ID across areas. Bump `SAVE_VERSION` if text keys or state
change.
*Done when:* golden snapshots are re-recorded once after a temporary old/new comparison proves
that only activity text-memo keys change from region paths to activity paths (identical values)
and `saveVersion` changes. Journal text, RNG states, counters, items and every other field remain
identical. Keep the permanent comparison unchanged; do not commit the temporary proof script.
A test links one activity into two areas.
Implementation evidence: all three snapshots compared exactly after the 19 memo-key substitutions
and version 7 → 8; no other differences. Temporary extraction checks also confirmed unchanged raw
activity definitions and full/visible action order in every area of both packs.
*Owner test:* fresh game, actions appear in the same places as before.

### Phase B — Studio core

**PR-04 — Studio shell, file API, browser.** **[implemented]** `npm run studio`; the dev plugin (§4.2) with
path-traversal, foreign-origin, non-allowlisted and stale-hash tests; React shell with navigation
by kind and by area, entity list with search, read-only formatted JSON, structured diagnostics
linked to entities. Lint boundary rule, the "no Studio in dist" test and the public shared surface
`src/content/index.ts` (re-exports only; no behavior change).
*Owner test:* open the Studio, browse Forest and an item, break a reference by hand, see the error.
Implementation: [usage and transport contract](STUDIO.md), `src/studio/`,
`tools/vite-content-api.ts`; `npm run test:studio` covers the read-only browser.

**PR-04.1 — diagnostics at source, Studio tests on fixtures, small fixes.** **[implemented]**
Correct source diagnostics while preserving problem strings, isolate Studio browser tests in
a temporary frozen pack, reject duplicate activity links, use code-unit registry ordering,
and give older saves neutral recovery wording. No save-version or gameplay change.

**PR-05 — Generic editor, create dialog and save.** **[implemented]** `ref()` metadata in the schema; generic form
+ widget registry (§4.4) with reference pickers; edit, duplicate, delete with "where used"
blocking; undo/redo; save through the formatter; conflict dialog on `409`. **Create dialog**
(§4.4) for every independent entity kind: asks for the ID and the schema's required fields, accepts only a valid
entity as an unsaved draft, then opens it in the form. Callers can pre-fill fields (used later by
the story view). Save follows the owner decision in §4.3 rather than writing from the dialog.
Owner decision (2026-10-22): creation/duplication and saving follow the draft, whole-pack validation,
sequential-write and partial-failure rules in §4.3.
*Done when:* every current entity kind round-trips through the form unchanged (test over all fixture
files); invalid edits show inline errors and cannot be saved; the create dialog is generated from
the schema for every kind (test iterates the kinds) and rejects a duplicate or malformed ID.
*Owner test:* create an item through the dialog, link it as a yield of an activity, save, see a
one-entity git diff; create an area through the dialog and see it in the game after reload.
Implementation: [editor usage](STUDIO.md#editing-and-saving--implemented-pr-05), `src/studio/`,
metadata-only `src/content/schema.ts`; `tests/studio/editor.test.ts` covers all fixture files and
independent create kinds, draft validation, references, undo/redo, sequential save and conflicts.
`tests/studio-browser/browser.spec.ts` covers actual temporary-root writes and editor wiring.

**PR-06 — Condition/effect builder and text widget.** **[implemented]** Recursive all/any/not tree, a form per leaf
and effect kind generated from the schema unions, human-readable summary using Studio-only
`describe()`, JSON view; text widget with variants (alternatives, never paragraphs), modal vs journal
labeling and the 80-character journal guidance from docs/NARRATIVE_STYLE.md.
*Done when:* every condition/effect kind in `schema.ts` can be built without typing JSON (test
iterates the union); every condition and effect kind has a summary phrase (test iterates the unions);
nested groups and roll outcomes round-trip unchanged across the fixture pack; invalid values
show inline errors and block saving; all three Text forms preserve untouched text, with journal
length and placeholder mismatch warnings. Neither shipped nor fixture content reaches the
six-level recursion fallback.
*Owner test:* "visible after the spring is discovered and while carrying the water can", checked
in the game; add/remove log alternatives and see an over-80 warning; edit a roll outcome and
confirm that only the requested value changes.

Implementation: schema-object widgets in `src/studio/`, Studio-only union-checked phrase tables,
six-level recursion with validated JSON fallback, labelled references, and narrative-channel
classification. `tests/studio/widgets.test.ts` covers all union kinds and both packs’ depth/round
trips; temporary-root browser tests cover keyboard editing, groups, text warnings and nested
roll edits. See [usage](STUDIO.md#conditions-effects-and-text--implemented-pr-06) and
[mockup differences](mockups/studio/README.md#pr-06-implementation-differences--implemented).

### Phase C — authoring views

Until PR-10, playtest in the game served by the same dev server (`/`, a second window); it reloads
when the Studio saves a content file.

**PR-07 — Area workspace and rename.** **[implemented]** One screen per area: properties, map cell picker,
unlock/hint conditions, view/arrive lines, landmarks, linked activities, and everything that
references the area or its landmarks. "New area" uses the PR-05 create dialog; there is no separate
wizard. Rename entity and nested IDs with a preview of every changed file/field and required
file move, except the owner-approved engine protocol identities in §2. Area and landmark
incoming references resolve separately, including same-file references. Existing schema metadata
drives direct/record-key references, counters, event after, tree edges, and contextual scene and
production references; no shared schema or engine changes.

Implementation: `src/studio/area-workspace.tsx`, `references.ts`, `rename.ts`, `reserved.ts` and
the draft store. Rename is one undo step. Save validates the complete pack, refreshes expected
hashes, moves files in ascending source-path order, then writes/deletes drafts in ascending path
order. A move uses the existing atomic rename API; it never creates a second copy or removes
both names. A write after a move uses the hash returned by that move. Partial failures report
completed operations, remaining drafts, and which filename remains; disk writes clear history
so Undo cannot pretend to reverse filesystem mutations. See [usage](STUDIO.md#area-workspace-and-rename--implemented-pr-07).

*Done when:* every nonreserved entity, landmark and nested identity in the temporary fixture
pack can be renamed to a fresh ID with zero registry diagnostics, no old reference positions,
and all unrelated values/comments unchanged. Reserved identities reject without drafts/history.
Every fixture area round-trips unchanged through the workspace. Browser tests cover new-area
and linked-activity creation, map occupancy, discovery unlocks, landmarks, rename preview,
undo/redo, Used by, blocked deletion and deleting an area with its activity. Unit tests cover
Keep/relink, shared activity safety, contextual references, tags, deterministic expected-hash
save order and failures before/after the move. The reserved-ID guard covers both content packs;
golden traces and frozen fixtures stay unchanged.
*Owner test:* create a temporary area, set its map cell and an unlock rule on a landmark, add a
landmark and a linked activity, reach it in the game, then delete it (blocked while referenced).

**PR-08 — Story view and event editor.** **[implemented]** Adds React Flow (C11). Derived read-only graph of
landmarks, quests, events, flags and area unlocks with edges from conditions/effects; click opens
the entity. "Continue the story" actions open the create dialog pre-filled with the linking
condition (new task, event or area on a discovery). Event editor: scenes as nodes, choices as
edges, side panel uses the generic form; flags dangling `next`, unreachable scenes and missing
`start`.
Owner decisions (2026-10-22), PR-08:
- Add `ref("flag")` descriptions to Condition.flag and Effect.flag/unflag in
  `src/content/schema.ts`. This is metadata only; both content packs retain identical
  validation results. Flags use the shared reference walker/pickers/Used by and are not
  renamable identities in this PR. This metadata-only change is approved under §5.1.
- Engine-supplied flags live in one Studio constant, `src/studio/game-flags.ts`, each with
  a reason. The hardcoded-ID guard checks core literals matching content flag reads,
  including finite for-of substitutions in template strings. The graph marks these flags
  “set by the game”; reads with neither an authored setter nor game setter warn about typos.

Implementation: React Flow and dagre are imported only by Studio code. Story edges come from
`references()`/`resolvesTo()`, retaining each source position and nested landmark ownership.
Conditions point from the referenced identity to their owner; effect references do too, labelled
`effect: starts`/`effect: unlocks`. Flags bridge setter → flag → reader. Area filtering follows
connections to area/landmark anchors; kind filtering retains edges with both endpoints visible.
All six discovery/task continuation shortcuts pre-fill the shared create dialog and stage drafts
under §4.3. No layout is saved into content.

The event editor reuses generic forms/widgets, PR-07 rename and whole-pack saving. Choices can
end the event or target existing/new scenes. Deletion with incoming choices requires explicit
retargeting in the same draft edit; internal references disappear with the deleted scene.
Start stays reserved. Registry diagnostics supply missing-start/dangling-next errors; unreachable
scenes are Studio-only warnings. Graph/list views share the same model, including explicit end
and missing-target markers. See [usage](STUDIO.md) and [mockup differences](mockups/studio/README.md).

Bounded document/revision caches and rename-plan reuse retain exhaustive PR-07 assertions while
avoiding repeated parse/registry/reference work. Tests remain in `npm test`; no CI-only split.

*Owner test:* landmark → task → event chain created in the Studio and played in the game.

**PR-09 — Creation tree and map editors.** **[implemented]** React Flow tree editor for
crafting/building (parents, branch, order; new recipe/building gets its node in the same save;
cycles rejected); area map editor that drags `region.map` cells and shows the existing
camp-centered paths and travel hours.

Owner decisions (2026-10-22), PR-09:
- “New recipe here” / “New building here” reuses the PR-05 create dialog and stages the entity
  plus its tree node (branch and parent from the selected node, order = max + 1) as one undo
  step. Like “New activity in this area”, this is an explicit, user-chosen link; ordinary Create
  never places a node. Save all validates both files under §4.3.
- Deleting a recipe/building removes its own node in the same staged change; a node that is a
  prerequisite of another node blocks deletion and the dependent child nodes are listed. Nodes
  are never deleted on their own, and prerequisites are never detached automatically.
- Cycles, self-parents and parents outside the tree are refused before staging, with the cycle
  path. Deleting a branch is blocked while nodes use it; branch rename uses the PR-07 rename.
- The map editor reuses the PR-07 cell grid. An area without `map` shows at its order index on
  row 0; moving it writes `map` explicitly. An occupied target cell is refused, and cells
  holding several areas (for example a default position equal to a set cell) show the existing
  overlap warning. `travelHours` is validated by the registry (whole `game.stepMinutes`
  steps), which is the authority; the input only derives its step from `game.stepMinutes`.

Implementation: `src/studio/tree.ts` (pure tree operations, cycle path, delete blockers),
`tree-editor.tsx`, `map.ts` (cell model, `moveArea`), `map-cells.tsx` (shared grid, picker and
editor modes), `map-editor.tsx`, and `StudioStore.createWithTreeNode` plus tree-aware delete.
`GraphView` gained an opt-in `connect` prop; story and event graphs still cannot connect nodes.
No layout is stored in content. See [usage](STUDIO.md#creation-tree-and-map-editors--implemented-pr-09).

*Done when:* both fixture trees and the map round-trip unchanged through the editors; adding or
removing a prerequisite, changing branch/order, adding a branch, placing an unplaced recipe and
“New recipe here” each produce exactly the expected content change and the pack saves without
diagnostics; a cycle and a cross-tree parent are refused before staging with a message; moving
an area by drag and by keyboard changes only `region.map` and occupied cells are refused; the
list views expose the same nodes and edges as the graphs.
*Owner test:* add a recipe under the axe, craft it in the game; move an area on the map.

### Phase D — convenience

**PR-10 — Live preview.** **[implemented]** Game iframe inside the Studio with `?preview` save
isolation, reload on save and the preview panel (§4.5). Moved last by the owner (2026-10-21).
*Done when:* a test shows preview mode never writes `textisland.save`/`textisland.saved`.
*Owner test:* edit a landmark text, see it in the preview without touching your own save.
Implementation: `src/studio/preview.ts`, `preview-panel.tsx`; shared changes in
`src/persistence/save.ts`, `src/main.ts`, `src/debug/console.ts`; `tools/vite-content-api.ts`.
See [usage](STUDIO.md#live-preview--implemented-pr-10) and
[mockup differences](mockups/studio/README.md#pr-10-implementation-differences--implemented).

## 7. Definition of done for the program

The owner can build a new Stone Age area — with landmarks, linked activities, new items, recipes,
buildings with production, tree nodes, tasks and a branching event connected through discoveries —
without opening a JSON file, playtest it in the game and commit a content-only diff.

### Program status (after PR-10)

All ten PRs are implemented; this records where the definition of done above stands, without
rewriting the history of the plan.

- **Met (by tool support, each covered by tests):** areas with landmarks and map cells (PR-07, PR-09),
  linked activities (PR-05, PR-07), new items (PR-05), recipes, buildings and their tree nodes
  (PR-05, PR-09), tasks and events with branching scenes connected through discoveries (PR-08),
  reference-aware rename and delete (PR-07), a preview of the saved content with its own save slots
  (PR-10), and content-only diffs written by the shared formatter (PR-02, PR-05).
- **Buildings with production** are authored through the generic schema forms (cycles, batches,
  products); there is no dedicated production editor.
- **Known gaps:** no end-to-end authoring of a complete Stone Age chapter has been done by the owner
  yet, so the sentence above is verified piecewise, not as one session. Illustrations are listed but
  not uploaded or replaced through the Studio. The preview shows saved content only (no unsaved
  drafts) and, as for any save, drops progress tied to items or places that no longer exist when
  content is removed. Automatic reload of a separate **Open game** tab depends on the dev server
  event from PR-10 rather than Vite's own reload.
