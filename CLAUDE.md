# Mysteryless Island

A minimalist, data-driven text survival game (TypeScript, Vite, Zod, Vitest, Playwright). Static site on GitHub Pages. Design: `docs/GDD.md`; technical design: `docs/TDD.md`; player-facing summary: `README.md`.

## Commands

```bash
npm test               # unit tests (vitest), includes the content checks
npm run content:check  # only the content checks (schema, references, sentence rule)
npm run typecheck
npm run build          # tsc + vite build into dist/
npm run test:e2e       # Playwright smoke test of dist/ (needs a build; Chromium)
```

URL switches: `?speed=0.2` (faster progress bars), `?layout=<id>`, `?font=<id>`, `?variants=first` (always the first wording of each text). Debug helpers in the browser console: `ti.give()`, `ti.stat()`, `ti.time(hours)` (advances the clock, it does not set it), `ti.fire()`, `ti.state()`.

## Architecture

- `content/**/*.json` is the game. `src/content/schema.ts` (Zod) defines every field; `registry.ts` checks references (unknown ids, conditions) and reports file + path.
- `src/core/engine.ts` interprets content: commands (activity, travel, consume, explore, questAction, itemAction) → state changes and journal lines. Seeded rng lives in the state, so saves replay identically.
- `src/core/selectors.ts` turns state into a view model. `src/ui/render.ts` draws it and sends commands; the UI holds no game state.
- Layouts: `src/ui/layouts/<id>.ts` + `<id>.css` (CSS scoped to `.layout-<id>`), listed in `index.ts`; shared panels with fixed ids in `panels.ts`. Every layout has a phone block (≤600px).
- Fonts: `src/ui/fonts.ts`; all text uses `--font`. Layouts do not pick fonts.

## Content rules

- Ids are lowercase `snake_case` and unique across all kinds. Keys starting with `_` are comments.
- Every journal text is `Text`: a string or a list of **variants** (one shown, never the same twice in a row). A list never means "lines in order". Lines the engine writes itself are in `game.json` → `journal` (`{place}` is filled in).
- Sentences start with a capital letter (enforced by `content.test.ts`); labels (buttons, places, items, task titles, stat words, menu) stay lowercase.
- Prefer content over code: conditions (`all/any/not`, `item`, `did`, `today`, `discovered`, `phase`, `stat`, `timer`…), `arrive` lines, activity `thoughts` / `afterwards`. New condition kinds need schema + `conditions.ts` + registry check + a test.
- JSON files are formatted with short objects on one line (~110 chars); keep that style.

## Tests

- Unit tests run with `variants: "first"` (`tests/setup.ts`); `tests/variants.test.ts` switches to random to test variety. The e2e test opens every page with `?variants=first`.
- When a test plays through several steps, expectations must follow the game state as it changes (e.g. the spear task appears after the 4th "look around"; layouts keep different numbers of paragraphs). Both past CI failures came from this.
- Add a test with every engine feature; check new content with a short playthrough.

## Workflow

- Commit author: `Frantisek Dvoracek <f.dvoracek@gmail.com>`. The user pushes; pushing to `main` deploys via `.github/workflows/pages.yml` (tests, build, e2e, deploy).
- If you work in a Linux sandbox with this folder mounted from macOS, never install `node_modules` into the repo: copy it elsewhere (e.g. `rsync --exclude node_modules --exclude .git`) and build there.
- Update `README.md` / `docs/TDD.md` when behaviour or the content model changes.
