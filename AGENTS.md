# Mysteryless Island

A minimalist, data-driven text survival game (TypeScript, Vite, Zod, Vitest, Playwright). Static site on GitHub Pages. Design: `docs/GDD.md`; technical design: `docs/TDD.md`; player-facing summary: `README.md`.

**Required reading:** Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing gameplay, content models,
saves, scheduling, or shared UI. It records architectural boundaries, simulation invariants,
confirmed future mechanics, and the definition of done. Keep decisions there; use this file for
repository workflow and authoring conventions.

**Visual changes:** Before changing player-visible presentation (layout, CSS, typography,
icons, or artwork), read and follow [docs/VISUAL_STYLE.md](docs/VISUAL_STYLE.md).
For illustration or visual-asset creation/editing, also read
[docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) and inspect the relevant approved references
listed in [assets/art/references/README.md](assets/art/references/README.md).
Include these requirements when delegating visual work. Gameplay, persistence, content-text,
and tooling changes without visual impact do not require these guides; read them when a task
also changes presentation. Keep detailed visual rules in the guides rather than copying them here.

## Commands

```bash
npm test               # unit tests (vitest), includes the content checks
npm run content:check  # only the content checks (schema, references, sentence rule)
npm run typecheck
npm run build          # tsc + vite build into dist/
npm run test:e2e       # Playwright smoke test of dist/ (needs a build; Chromium)
npm run check          # all of it, as CI: unit tests, build, browser test (the pre-push hook runs this)
```

URL switches: `?speed=0.2` (faster progress bars), `?font=<id>`, `?variants=first` (always the first wording of each text). Debug helpers in the browser console: `ti.give()`, `ti.stat()`, `ti.time(hours)` (advances the clock, it does not set it), `ti.fire()`, `ti.state()`.

## Architecture

- `content/**/*.json` is the game. `src/content/schema.ts` (Zod) defines every field; `registry.ts` checks references (unknown ids, conditions) and reports file + path.
- `src/core/engine.ts` interprets content: commands (activity, travel, consume, explore, craft, build, itemAction, building, choose, pause, resume) → state changes and journal lines. Separate gameplay and narrative RNG streams live in state, so changing wording cannot change outcomes.
- `src/app/action-controller.ts` owns browser scheduling; `Engine.start` reserves inputs, `stepActions` advances persisted work, and `dispatch` drains the same pipeline synchronously for tests. Player work pauses on travel/sleep; local production continues with game time. No offline advancement.
- `src/persistence/migrate.ts` validates and migrates saves at the loading boundary; `state-schema.ts` defines the runtime model (currently save version 7; older saves require a fresh game).
- `src/core/selectors.ts` turns state into a view model. `src/ui/render.ts` draws it and sends commands; the UI holds no game state.
- Classic is the only layout: `src/ui/layouts/classic.ts` + `classic.css` (scoped to `.layout-classic`), with fixed panels in `panels.ts` and a phone block (≤600px). There is no layout registry or picker; old layout preferences/URL parameters are ignored.
- Fonts: `src/ui/fonts.ts`; all text uses `--font`. The layout does not pick fonts.
- The places panel is a route map (`renderTabs`): regions at their `map: { x, y }`, paths from the camp with walking times, "?" for places not found, centred on the current place (walking slides the map). Nodes are still `#tabs .tab` buttons. A pop-up that unlocks a place gets a line about it and a `go:<region>` button before *close* (`game.json` → `newPlace`; `Engine.offerNewPlaces`).

## Content rules

**Narrative authoring:** Follow [docs/NARRATIVE_STYLE.md](docs/NARRATIVE_STYLE.md) for all story, exploration, journal, and descriptive copy. Preserve mechanical information, the `Text` variant semantics, and interpolated placeholders.

- Prefer content over code: conditions (`all/any/not`, `item`, `did`, `today`, `discovered`, `phase`, `stat`, `timer`…), `arrive` lines, activity `thoughts` / `afterwards`. New condition kinds need schema + `conditions.ts` + registry check + a test.
- Ids are lowercase `snake_case` and unique across all kinds. Keys starting with `_` are comments.
- Every journal text is `Text`: a string or a list of **variants** (one shown, never the same twice in a row). A list never means "lines in order". Lines the engine writes itself are in `game.json` → `journal` (`{place}` is filled in).
- Sentences start with a capital letter (enforced by `content.test.ts`); labels (buttons, places, items, task titles, stat words, menu) stay lowercase.
- JSON files are formatted with short objects on one line (~110 chars); keep that style.
- Events (`content/events/`): pop-ups with scenes and choices; triggers `"start"`, `{ at }`, `{ when }`, `{ after, chance }`. While one is open, only `{ type: "choose" }` works. Every page is also logged to the journal when it opens.
- Exploration: *look around* opens a pop-up (no time) with the region's `explore.view` lines and the unexplored `landmarks` (each with its time); exploring one marks it `discovered`. A `*` on the button means something is left.
- Tool tags (`game.json` → `tools`: `sharp`, `fire_starter`): requirements name a use, `{ "tool": "sharp" }` ("needs something sharp"), never "needs a knife". Items carry `tool: { tags, amount?, hoursFactor? }` (shown next to them: *knife · sharp*); a slow tool (rock knife ×2) slows the action. Texts that differ by item use item conditions (`{ "item": "rock_knife" }`) or separate activities (the three ways to light a fire).
- When an action can be done with or without an item (fire with or without matches, the spear with the knife or a stone), each way gets its own texts: separate activities, recipe `ways` (`visibleWhen`), or conditions on lines. Make such conditions exclusive (`not`), or both lines will show.
- Crafting (`content/recipes/`) and building use separate centre tabs with one shared tree renderer. `content/trees/*.json` defines category branches and all-required prerequisite edges; every recipe/building has exactly one node. Only personal creation completion counts, and unlocks are permanent/global. Quests stay title-only goals and never gate creation. Compact tree canvases scroll in both directions inside the centre panel; category names and requirements live in floating hover/focus/inspection tooltips. Non-repeatable items allow a first personal craft even if already owned, leaving exactly one output copy. Repeatable recipes retain `multiple`/`count`; buildings retain local `max`.
- Buildings (`content/buildings/`): created in the current area from the building tree; site requirements use `{ "site": id }` in `build.requires`, with capabilities defined in `content/sites.json` and granted by region/landmark `siteCapabilities`; only locally discovered landmarks contribute; cycles the player starts (`start` → `hours` × `batches` → `collect`, optional `repeat`); state key `id@region`, with local `{ count, builtAt, batches, nextBatch }`. Batches record units, start time, locked inputs and optional named output (`cycle.products`, selected by `startCycle.production`). Input-free additions join a shared clock; required-input units stay empty until supplied. `startCycle.units` limits how many empty units begin (a newly built corn field plants one). Effects on the rules go through `{ built }` / `{ building, is }` conditions (stats multipliers, requires) or `warmthC`.
- Death is permanent (end screen from `game.json` → `ending`; damage rules have a `cause`). The saved game (`src/persistence/save.ts`): *save.* in the menu and just before every sleep; the autosave after every action and committed work step is separate.

## Tests

- Add a test with every engine feature; check new content with a short playthrough.
- A new game opens the shipwreck event first: tests use `startGame(reg, seed, choice?)` from `tests/helpers.ts` (picks the knife, closes the event, adds matches); the e2e test calls `escapeShip(page, choice)`.
- A finished task opens a note pop-up that blocks the game until closed: `startGame` closes notes after every command unless `{ keepNotes: true }`; the e2e test closes it explicitly.
- Completion notes open when work finishes. Pop-up buttons (`choose`) remain usable whenever a pop-up is open; the scheduler pauses active work until it closes. Other controls remain locked during running work (`UI.send`).
- Pop-ups have no close button: the `close` choice is `#eventBack` ("← back") in the title line (e2e clicks `#eventBack`); only the shipwreck keeps a button (`[data-choice="close"]`, "wash ashore").
- `craft(e, recipe)` / `build(e, building)` (tests/helpers.ts) send direct creation commands; browser tests switch tabs and click the node. Progression tests must earn prerequisites through real creation; fixture shortcuts for unrelated later mechanics must be explicit.
- Unit tests run with `variants: "first"` (`tests/setup.ts`); `tests/variants.test.ts` switches to random to test variety. The e2e test opens every page with `?variants=first`.
- When a test plays through several steps, expectations must follow the game state as it changes (e.g. the spear task appears after the 4th landmark explored). `lookAround(e)` (tests/helpers.ts) and `explore(page, id?)` (e2e) explore the next landmark. Both past CI failures came from this.

## Workflow

- Commit author: `Frantisek Dvoracek <f.dvoracek@gmail.com>`. The user pushes; pushing to `main` deploys via `.github/workflows/pages.yml` (tests, build, e2e, deploy). Do not push.
- `.githooks/pre-push` runs `npm run check` before a push to `main` and stops the push if it fails (`npm install` sets `core.hooksPath`; the hook installs Playwright's Chromium if it is missing).
- In a sandbox without Chromium the browser test can't run: `tests/e2e-content.test.ts` checks with the unit tests that every id and label the browser test expects still exists in the content. When a task, label or id is renamed, grep `e2e/smoke.spec.ts` for the old name too.
- If you work in a Linux sandbox with this folder mounted from macOS, never install `node_modules` into the repo: copy it elsewhere (e.g. `rsync --exclude node_modules --exclude .git`) and build there.
- Update `README.md` / `docs/TDD.md` when behaviour or the content model changes.
