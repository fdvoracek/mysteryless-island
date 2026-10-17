# Mysteryless Island

A minimalist, data-driven text survival game (TypeScript, Vite, Zod, Vitest, Playwright). Static site on GitHub Pages. Design: `docs/GDD.md`; technical design: `docs/TDD.md`; player-facing summary: `README.md`.

## Commands

```bash
npm test               # unit tests (vitest), includes the content checks
npm run content:check  # only the content checks (schema, references, sentence rule)
npm run typecheck
npm run build          # tsc + vite build into dist/
npm run test:e2e       # Playwright smoke test of dist/ (needs a build; Chromium)
npm run check          # all of it, as CI: unit tests, build, browser test (the pre-push hook runs this)
```

URL switches: `?speed=0.2` (faster progress bars), `?layout=<id>`, `?font=<id>`, `?variants=first` (always the first wording of each text). Debug helpers in the browser console: `ti.give()`, `ti.stat()`, `ti.time(hours)` (advances the clock, it does not set it), `ti.fire()`, `ti.state()`.

## Architecture

- `content/**/*.json` is the game. `src/content/schema.ts` (Zod) defines every field; `registry.ts` checks references (unknown ids, conditions) and reports file + path.
- `src/core/engine.ts` interprets content: commands (activity, travel, consume, explore, menu, itemAction, building, choose) → state changes and journal lines. Seeded rng lives in the state, so saves replay identically.
- `src/core/selectors.ts` turns state into a view model. `src/ui/render.ts` draws it and sends commands; the UI holds no game state.
- Layouts: `src/ui/layouts/<id>.ts` + `<id>.css` (CSS scoped to `.layout-<id>`), listed in `index.ts`; shared panels with fixed ids in `panels.ts`. Every layout has a phone block (≤600px).
- Fonts: `src/ui/fonts.ts`; all text uses `--font`. Layouts do not pick fonts.
- The places panel is a route map (`renderTabs`): regions at their `map: { x, y }`, paths from the camp with walking times, "?" for places not found, centred on the current place (walking slides the map). Nodes are still `#tabs .tab` buttons. A pop-up that unlocks a place gets a line about it and a `go:<region>` button before *close* (`game.json` → `newPlace`; `Engine.offerNewPlaces`).

## Content rules

- Ids are lowercase `snake_case` and unique across all kinds. Keys starting with `_` are comments.
- Every journal text is `Text`: a string or a list of **variants** (one shown, never the same twice in a row). A list never means "lines in order". Lines the engine writes itself are in `game.json` → `journal` (`{place}` is filled in).
- Sentences start with a capital letter (enforced by `content.test.ts`); labels (buttons, places, items, task titles, stat words, menu) stay lowercase.
- Events (`content/events/`): pop-ups with scenes and choices; triggers `"start"`, `{ at }`, `{ when }`, `{ after, chance }`. While one is open, only `{ type: "choose" }` works. Every page is also logged to the journal when it opens.
- Exploration: *look around* opens a pop-up (no time) with the region's `explore.view` lines and the unexplored `landmarks` (each with its time); exploring one marks it `discovered`. A `*` on the button means something is left.
- Tool tags (`game.json` → `tools`: `sharp`, `fire_starter`): requirements name a use, `{ "tool": "sharp" }` ("needs something sharp"), never "needs a knife". Items carry `tool: { tags, amount?, hoursFactor? }` (shown next to them: *knife · sharp*); a slow tool (rock knife ×2) slows the action. Texts that differ by item use item conditions (`{ "item": "rock_knife" }`) or separate activities (the three ways to light a fire).
- When an action can be done with or without an item (fire with or without matches, the spear with the knife or a stone), each way gets its own texts: separate activities, recipe `ways` (`visibleWhen`), or conditions on lines. Make such conditions exclusive (`not`), or both lines will show.
- Crafting (`content/recipes/`) and building happen in the *craft* / *build* menus (pop-ups, `menu:craft` / `menu:build`); tasks are goals with no buttons: what they need goes in `needs` (tooltip; `[["a", "b"]]` = a or b), a building task shows its cost as progress (`build: building`); no task is "craft X". A thing leaves its menu once had, unless `multiple` (recipes) or `max` > 1 (buildings per place).
- Buildings (`content/buildings/`): built where you are (`places`), from the build menu; cycles the player starts (`start` → `hours` × `batches` → `collect`, optional `repeat`); state key `id@region`. Effects on the rules go through `{ built }` / `{ building, is }` conditions (stats multipliers, requires) or `warmthC`.
- Death is permanent (end screen from `game.json` → `ending`; damage rules have a `cause`). The saved game (`src/persistence/save.ts`): *save.* in the menu and just before every sleep; the autosave after every action is separate.
- Prefer content over code: conditions (`all/any/not`, `item`, `did`, `today`, `discovered`, `phase`, `stat`, `timer`…), `arrive` lines, activity `thoughts` / `afterwards`. New condition kinds need schema + `conditions.ts` + registry check + a test.
- JSON files are formatted with short objects on one line (~110 chars); keep that style.

## Tests

- A new game opens the shipwreck event first: tests use `startGame(reg, seed, choice?)` from `tests/helpers.ts` (picks the knife, closes the event, adds matches); the e2e test calls `escapeShip(page, choice)`.
- A finished task opens a note pop-up that blocks the game until closed: `startGame` closes notes after every command unless `{ keepNotes: true }`; the e2e test closes it explicitly.
- The note opens while the action's progress bar still runs: pop-up buttons (`choose`) work during a bar, everything else is locked until it ends (`UI.send`). Third CI failure: closing a note was ignored while busy.
- Pop-ups have no close button: the `close` choice is `#eventBack` ("← back") in the title line (e2e clicks `#eventBack`); only the shipwreck keeps a button (`[data-choice="close"]`, "wash ashore").
- `craft(e, recipe)` / `build(e, building)` (tests/helpers.ts) make things through the menus; the e2e test clicks *craft* / *build* and the choice.
- Unit tests run with `variants: "first"` (`tests/setup.ts`); `tests/variants.test.ts` switches to random to test variety. The e2e test opens every page with `?variants=first`.
- When a test plays through several steps, expectations must follow the game state as it changes (e.g. the spear task appears after the 4th landmark explored; layouts keep different numbers of paragraphs). `lookAround(e)` (tests/helpers.ts) and `explore(page, id?)` (e2e) explore the next landmark. Both past CI failures came from this.
- Add a test with every engine feature; check new content with a short playthrough.

## Workflow

- Commit author: `Frantisek Dvoracek <f.dvoracek@gmail.com>`. The user pushes; pushing to `main` deploys via `.github/workflows/pages.yml` (tests, build, e2e, deploy).
- `.githooks/pre-push` runs `npm run check` before a push to `main` and stops the push if it fails (`npm install` sets `core.hooksPath`; the hook installs Playwright's Chromium if it is missing). In a sandbox without Chromium the browser test can't run: `tests/e2e-content.test.ts` checks with the unit tests that every id and label the browser test expects still exists in the content. When a task, label or id is renamed, grep `e2e/smoke.spec.ts` for the old name too.
- If you work in a Linux sandbox with this folder mounted from macOS, never install `node_modules` into the repo: copy it elsewhere (e.g. `rsync --exclude node_modules --exclude .git`) and build there.
- Update `README.md` / `docs/TDD.md` when behaviour or the content model changes.
