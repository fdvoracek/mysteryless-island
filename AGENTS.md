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

## Content Studio — [PR-01 to PR-10 implemented; the plan is complete]

[docs/CONTENT_STUDIO_IMPLEMENTATION_PLAN.md](docs/CONTENT_STUDIO_IMPLEMENTATION_PLAN.md) is the
single source for Studio scope, confirmed decisions, open gates and PR order (PR-01 to PR-10).
Do not copy its decisions into other files. Working rules for a Studio PR:

1. Implement exactly one numbered PR. Read the plan, ARCHITECTURE.md, docs/TESTING.md and the
   current code first. If the PR touches an open gate, ask the owner before coding.
2. **[implemented, PR-04]** `src/studio/` and `tools/vite-content-api.ts` provide the local
   read-only browser and file API. Usage: [docs/STUDIO.md](docs/STUDIO.md).
   **[implemented, PR-02]** Content entities use `content/<kind>/<id>.json`.
   **[implemented, PR-03]** Activities are standalone files linked by region ID lists.
   The sections below describe the current code.
3. No Studio PR may break the game: follow the plan's game safety rules (§5.1). The game must
   play from a fresh start and save/reload after every PR. Old saves may be dropped (bump
   `SAVE_VERSION`, keep the recovery screen); no legacy-save migrations.
4. Keep game-rule tests on the frozen fixtures; the Studio never reimplements engine rules.
5. Never change shipped story or balance to exercise the editor; use fixtures or revert test content.

## Commands

```bash
npm test               # unit tests (vitest) against frozen test content
npm run content:check  # shipped schema/references and canonical content/fixture formatting
npm run typecheck
npm run build          # tsc + vite build into dist/
npm run test:e2e       # builds dist-test/ and runs Playwright smoke tests (Chromium)
npm run studio         # http://127.0.0.1:5173/studio/ (prints the exact URL for custom ports)
npm run test:studio    # Studio browser wiring tests (Chromium)
npm run check          # tests, content validation, builds, game and Studio browser tests
```

URL switches: `?speed=0.2` (faster progress bars), `?font=<id>`, `?variants=first` (always the first wording of each text), `?preview` (Studio preview: own save slots `textisland.preview.*`; with `&seed=<digits>` it starts a new game). Debug helpers in the browser console: `ti.give()`, `ti.stat()`, `ti.time(hours)` (advances the clock, it does not set it), `ti.fire()`, `ti.unlock(regionId)`, `ti.state()`.

## Architecture

- `content/**/*.json` is the game. `src/content/schema.ts` (Zod) defines every field; `registry.ts` checks references (unknown ids, conditions) and reports file + path.
- `src/core/engine.ts` interprets content: commands (activity, travel, consume, explore, craft, build, itemAction, building, choose, pause, resume) → state changes and journal lines. Separate gameplay and narrative RNG streams live in state, so changing wording cannot change outcomes.
- `src/app/action-controller.ts` owns browser scheduling; `Engine.start` reserves inputs, `stepActions` advances persisted work, and `dispatch` drains the same pipeline synchronously for tests. Player work pauses on travel/sleep; local production continues with game time. No offline advancement.
- `src/persistence/migrate.ts` validates and migrates saves at the loading boundary; `state-schema.ts` defines the runtime model (currently save version 8; older saves require a fresh game). Any merged PR may require a fresh game: bump `SAVE_VERSION` instead of writing legacy migrations (ARCHITECTURE.md).
- `src/core/selectors.ts` turns state into a view model. `src/ui/render.ts` draws it and sends commands; the UI holds no game state.
- Classic is the only layout: `src/ui/layouts/classic.ts` + `classic.css` (scoped to `.layout-classic`), with fixed panels in `panels.ts` and a phone block (≤600px). There is no layout registry or picker; old layout preferences/URL parameters are ignored.
- Fonts: `src/ui/fonts.ts`; all text uses `--font`. The layout does not pick fonts.
- The places panel is a route map (`renderTabs`): regions at their `map: { x, y }`, paths from the camp with walking times, "?" for places not found, centred on the current place (walking slides the map). Nodes are still `#tabs .tab` buttons. A pop-up that unlocks a place gets a line about it and a `go:<region>` button before *close* (`game.json` → `newPlace`; `Engine.offerNewPlaces`).

## Content rules

**Narrative authoring:** Follow [docs/NARRATIVE_STYLE.md](docs/NARRATIVE_STYLE.md) for all story, exploration, journal, and descriptive copy. Preserve mechanical information, the `Text` variant semantics, and interpolated placeholders.

- Prefer content over code: conditions (`all/any/not`, `item`, `did`, `today`, `discovered`, `phase`, `stat`, `timer`…), `arrive` lines, activity `thoughts` / `afterwards`. New condition kinds need schema + `conditions.ts` + registry check + a test.
- Ids are lowercase `snake_case` and unique across all kinds. Keys starting with `_` are comments.
- Every journal text is `Text`: a string or a list of **variants** (one shown, never the same twice in a row). A list never means "lines in order". Lines the engine writes itself are in `game.json` → `journal` (`{place}` is filled in).
- Sentences start with a capital letter; labels (buttons, places, items, task titles, stat words, menu) stay lowercase. This is an authoring convention rather than a prose-sensitive automated test.
- **[implemented, Studio PR-02]** One object per entity file, with filename equal to ID.
  Use `npm run content:format` for canonical formatting; `content:check` enforces it.
  Items, quests, events and buildings accept optional `order`; the registry sorts by order then ID.
- Events (`content/events/`): pop-ups with scenes and choices; triggers `"start"`, `{ at }`, `{ when }`, `{ after, chance }`. While one is open, only `{ type: "choose" }` works. Every page has a concise `scene.journal` entry in the narrow journal while its full `text` stays in the modal (legacy scenes fall back to `text`).
- Exploration: *look around* opens a pop-up (no time) with the region's `explore.view` lines and the unexplored `landmarks` (each with its time); exploring one marks it `discovered`. Its full `text` stays in the modal, while its concise `journal` summarizes the discovery. A `*` on the button means something is left.
- Tool tags (`game.json` → `tools`: `sharp`, `fire_starter`): requirements name a use, `{ "tool": "sharp" }` ("needs something sharp"), never "needs a knife". Items carry `tool: { tags, amount?, hoursFactor? }` (shown next to them: *knife · sharp*); a slow tool (rock knife ×2) slows the action. Texts that differ by item use item conditions (`{ "item": "rock_knife" }`) or separate activities (the three ways to light a fire).
- When an action can be done with or without an item (fire with or without matches, the spear with the knife or a stone), each way gets its own texts: separate activities, recipe `ways` (`visibleWhen`), or conditions on lines. Make such conditions exclusive (`not`), or both lines will show.
- Crafting (`content/recipes/`) and building use separate centre tabs with one shared tree renderer. `content/trees/*.json` defines category branches and all-required prerequisite edges; every recipe/building has exactly one node. Only personal creation completion counts, and unlocks are permanent/global. Quests stay title-only goals and never gate creation. Compact tree canvases scroll in both directions inside the centre panel; category names and requirements live in floating hover/focus/inspection tooltips. Non-repeatable items allow a first personal craft even if already owned, leaving exactly one output copy. Repeatable recipes retain `multiple`/`count`; buildings retain local `max`.
- Buildings (`content/buildings/`): created in the current area from the building tree; site requirements use `{ "site": id }` in `build.requires`, with capabilities defined in `content/sites/<id>.json` and granted by region/landmark `siteCapabilities`; only locally discovered landmarks contribute; cycles the player starts (`start` → `hours` × `batches` → `collect`, optional `repeat`); state key `id@region`, with local `{ count, builtAt, batches, nextBatch }`. Batches record units, start time, locked inputs and optional named output (`cycle.products`, selected by `startCycle.production`). Input-free additions join a shared clock; required-input units stay empty until supplied. `startCycle.units` limits how many empty units begin (a newly built corn field plants one). Effects on the rules go through `{ built }` / `{ building, is }` conditions (stats multipliers, requires) or `warmthC`.
- Death is permanent (end screen from `game.json` → `ending`; damage rules have a `cause`). The saved game (`src/persistence/save.ts`): *save.* in the menu and just before every sleep; the autosave after every action and committed work step is separate.

## Tests

- Add a test with every engine feature. Unit and browser tests use frozen `tests/fixtures/content/`; change it only for an intentional test scenario. Validate shipped content with `npm run content:check`, then check new gameplay content with a short manual playthrough.
- Keep rule coverage in engine tests and browser coverage focused on DOM interaction, layout and application wiring. Reuse a scenario for related assertions; avoid one playthrough per item or tests that parse other tests. See [docs/TESTING.md](docs/TESTING.md) for coverage ownership and timing configuration.
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
- Browser tests require Chromium. Their test build reads `.env.engine-test` (100ms action steps, 200ms UI animation defaults); the paced-work case uses a controlled clock. Shipped content changes do not require fixture or browser-test edits.
- If you work in a Linux sandbox with this folder mounted from macOS, never install `node_modules` into the repo: copy it elsewhere (e.g. `rsync --exclude node_modules --exclude .git`) and build there.
- Update `README.md` / `docs/TDD.md` when behaviour or the content model changes.
