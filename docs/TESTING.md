# Testing

Keep tests attached to mechanics rather than the number of recipes, regions or prose variants.
Extend an existing scenario when the new assertion has the same setup and failure boundary.
Keep separate cases for different failure modes, especially saved work and input loss.

## Coverage ownership

| Layer | Responsibilities |
| --- | --- |
| Engine and command tests | Costs, tool factors, quarter-hour simulation, reward delivery, blocking notes, death and sleep |
| Work and controller tests | Reservation once, completion once, pause/resume, focus sharing, stale callbacks and no offline advancement |
| Technology and production tests | Personal prerequisites, permanent unlocks, local sites, limits, batches, named outputs and collection claims |
| Save tests | Separate save slots, round trips, version rejection, malformed state and removed content |
| Validator tests | Schema and reference failures using fixed test data; validate field rules directly where a whole registry adds no coverage |
| Selector, text and layout tests | Status meaning, action grouping, seeded narrative independence, tree geometry and large graphs |
| Browser tests | Click/keyboard/touch wiring, busy controls, progress/reload wiring, popups, saves/recovery screens, images and responsive layout |

One browser scenario can exercise a representative craft and build; engine tests own the
individual requirements and interruption cases. Do not repeat long browser playthroughs to
verify different item definitions. Do not add tests that parse other tests for expected labels.

## Golden traces — [implemented, Studio PR-01]

`tests/golden-traces.test.ts` and `tests/__snapshots__/golden-traces.test.ts.snap` are the Studio
parity baseline. Seed 7 drives both random streams in random-variant mode. Normalization sorts
object keys and presents the journal chronologically; it preserves every persisted field,
array order and numeric value. The scripts use real commands and the real save/reload boundary.

Run `npm test -- tests/golden-traces.test.ts` without snapshot updates. Later Studio PRs must
keep these traces unchanged: investigate a mismatch rather than refreshing the snapshots.

**[implemented, Studio PR-03]** The owner approved one re-recording after a temporary comparison
proved only 19 activity memo-key paths and save version 7 → 8 changed across the three snapshots.
The permanent comparison has no exception or additional normalization.
The frozen content pack stays independent of shipped story and balance edits.

## Timing

The test build loads `.env.engine-test`:

```dotenv
VITE_ACTION_STEP_MS=100
VITE_UI_ANIMATION_MS=200
```

The first setting controls real milliseconds per configured game-time step (currently 15 game
minutes). A half-hour action therefore takes 200ms. The second controls map movement, notices
and UI transitions. Game-time costs and simulation rules remain content-defined. Unit tests
advance simulation synchronously or use fake timers; the browser pacing case uses Playwright's
clock and reads the same environment values, so it never waits for real seconds.

Use `.env.engine-test.local` for personal overrides, or `.env.development.local` for a fast
manual preview. Both are ignored by Git. `?speed=` still overrides action pacing for manual
previews. Without these settings, the ordinary build uses its normal content-defined pace.

## Development checks

Vitest uses at most four workers and Playwright uses two isolated browser contexts at a time.
Use `npm test -- tests/work.test.ts` for an affected engine file and
`npm run test:e2e -- --grep 'clock ticks'` for an affected browser flow. Run `npm run check`
before delivery. CI (`.github/workflows/pages.yml`) runs the same full check on every pull request against
`main` and on every push to `main`; only a push to `main` deploys. It also validates the shipped content and builds the production bundle;
test source files are not bundled into the playable game.

**[implemented, Studio PR-02]** `content:check` also checks canonical JSON formatting in both
content packs. Use `npm run content:format` to fix layout. Registry tests reject legacy entity
arrays, filename/ID mismatches and invalid order fields, and verify deterministic entity order.

**[implemented, Studio PR-03]** Activity tests cover multi-area links, shared counters, linked
and unlinked globals, action order, unknown/orphan references and text identity uniqueness.
The frozen pack was migrated by extraction only; activity definitions and area link order
were verified against their pre-migration forms.

## Studio foundation — [implemented, PR-04]

`npm test` includes `tests/studio/`: real HTTP tests of the file API against temporary directories,
structured-diagnostic/document tests on frozen data, lint rejection tests, and an actual production
build checked for Studio/React modules and files. API cases cover traversal, Host/Origin checks,
symlinks, malformed input, stale hashes, concurrent writes, and binary round trips. These tests
need permission to bind localhost when running under a restricted sandbox.

`npm run test:studio` starts a separate localhost Vite server and runs `tests/studio-browser/`
through `playwright.studio.config.ts`. Browser tests cover area/kind/search navigation, read-only
JSON, diagnostic links, request failure/recovery and narrow-screen layout. **[implemented, PR-04.1]**
The config copies the frozen pack to a fresh temporary root per run and sets `STUDIO_ROOT`; workers
share this copy and teardown removes it. A root-marker/frozen-prose guard fails if the API serves
the checkout’s content, and the direct shipped-content route is blocked. Invalid content is
simulated in the fixture response; tests never read or edit shipped content or edit frozen files.

`npm run check` includes both browser suites. CI runs the same checks. `npm run typecheck` includes
`lint:boundaries`; `npm run build` also checks the produced `dist/` for Studio/React contamination.
Golden traces and save versions are unchanged by PR-04.

## Source diagnostics regression — [implemented, PR-04.1]

`tests/studio/diagnostic-scenarios.ts` creates invalid copies of the frozen pack. The exact ordered
problem strings were recorded once from main `d609c1e`, before the refactor, into
`diagnostic-legacy.json`; do not regenerate them to accommodate a mismatch. A table checks exact
source file/field/message entries for schema, condition, yield, effect, duplicate entity/text ID,
filename mismatch, activity link, tree cycle and missing-file failures. A broken-pack test compares
the full ten-message list and complete error text byte for byte. Separate cases reject duplicate
activity links and verify code-unit ordering. Golden traces remain unchanged.

## Studio editor — [implemented, PR-05]

`tests/studio/editor.test.ts` uses a disposable copy of frozen content to render every fixture
file without mutations and check canonical round trips. It iterates every independent creation
kind, tests schema/ID rejection and duplicate nested IDs, pre-fill, reference-key discovery and
blocked deletion, generic/discriminated unions, unsupported-node fallback and widget overrides.
Store tests cover linked activity/area saves, strict diagnostic reduction with no new problems,
undo/redo, sequential partial failures, refreshed disk conflicts, delayed refreshes and expected-hash overwrites. Malformed JSON buffers
survive view changes and participate in undo/redo; invalid reference-source collections do not
crash pickers.

`tests/studio-browser/browser.spec.ts` exercises the generated forms, create dialogs, a linked
item/activity/area save, invalid inline values, delete blocking, undo/redo and the `409` dialog.
Writes use only the temporary `STUDIO_ROOT`; each writing scenario restores that copy. No shipped
content, frozen fixture or golden trace is changed. The existing game browser suite continues to
own fresh-game and save/reload safety checks. Run the full `npm run check` before delivery.

## Studio widgets — [implemented, PR-06]

`tests/studio/widgets.test.ts` iterates the actual Condition/Effect unions, requiring a generated
form and a Studio-only summary phrase for every kind. Disposable copies of both packs are
rendered without mutations and checked for the six-level builder fallback; the shipped copy is
used only for this read-only depth/round-trip audit. Tests cover invalid/unknown rules, bounded
recursion, three Text representations, multiline strings, channel classification, placeholder
sets, journal warnings, shared reference labels and unresolved IDs.

Studio browser scenarios use only temporary `STUDIO_ROOT`: a keyboard-only nested-condition
edit adds a group, changes kinds, removes a node and saves. It checks not wrapping, empty-group
rejection and unrelated-field preservation. Another scenario edits alternatives and explicit IDs,
observes guidance, builds a roll/outcome/effect and verifies a later weight edit changes only
that value in the saved bytes. Existing game smoke and golden traces retain game-safety ownership.


## Area workspace and rename — [implemented, PR-07]

`tests/studio/rename.test.ts` renames every nonreserved entity and nested identity, including
every landmark, in a temporary fixture copy. Each resulting pack has zero registry diagnostics;
old references are absent and exact raw-tree/formatter comparisons preserve all unrelated values,
comments and key order. Tests cover one-step undo/redo, nested/local ID and tag collisions,
contextual production/scene ownership, the sleep-memory today reference, expected-hash ordering,
and failure before a move or between move and content write with retry.

`tests/studio/area-workspace.test.ts` renders and round-trips every fixture area unchanged and
checks explicit grouped activity creation, blocked area/landmark deletion, orphan Keep/relink,
Delete them too and shared-activity preservation. Browser scenarios use only STUDIO_ROOT and
exercise new area, cell selection/occupancy, unlock rules, new landmarks, linked activity save,
rename preview/history/file move, separate landmark Used by, deletion blocking/removal and
reserved controls at desktop/phone widths. Writes are restored in the temporary pack.

`tests/studio/reserved-ids.test.ts` reads temporary copies of shipped and fixture content to
collect every identity and schema record key, then uses TypeScript's parser to scan string
literals in src/core/**/*.ts and src/content/registry.ts. A match must be in the single Studio
reserved list or a small, commented allowlist of exact harmless source expressions; new matches
fail with file/line/context for owner review. This read-only shipped audit never edits either pack.
Golden traces, game rules, save version and frozen files are unchanged.


## Story and event graphs — [implemented, PR-08]

`tests/studio/story.test.ts` checks the exact fixture edge multiset (kinds, direction, position
labels), single-reference additions, nested roll conditions, flag setter/read bridges and typo
warnings, metadata-only validation parity for both temporary packs, and all six continuation
drafts through whole-pack Save. `tests/studio/event-editor.test.ts` round-trips every fixture
event unchanged, checks add/remove choice, add scene, PR-07 scene rename, retarget-then-delete,
missing start/dangling next/unreachable checks, and exact graph/list node/edge parity.

The hardcoded-ID guard also checks content flag reads against engine string literals and finite
for-of template substitutions; every engine match requires a reason in the Studio GAME_FLAGS
constant. Flags remain references, not rename identities.

Browser scenarios exercise area filtering, graph/list parity, all six pre-filled create dialogs,
landmark editor navigation, scene/choice creation, retargeted deletion, choice edge selection,
whole-pack saves, JSON damage and narrow-screen layout, using only temporary STUDIO_ROOT.

Rename coverage remains exhaustive in `npm test`. Bounded document/revision/plan caches reuse
validation and immutable raw trees; unchanged-document comparisons reuse canonical text without
removing assertions. The exhaustive case's local before/after was 140.38s → 13.67s (whole file
150.80s → 15.61s wall time). The measured pre-PR-07 unit-suite baseline at c453891 was 31.12s.


Final PR-08 delivery check (2026-10-22): `npm run check` passed in 73.87s wall time:
402 unit tests / 45 files (18.22s), 2 content checks (0.442s), production typecheck/boundary/dist
checks, 21 game browser tests (21.5s), and 17 Studio browser tests (25.8s). The exhaustive rename
case took 15.600s in the final four-worker run (17.214s execution for the whole file).
The existing Text/roll browser test now waits for the acknowledged PUT before checking disk;
a disabled Save button alone also covers an in-flight write and was a race.


## Live preview — [implemented, PR-10]

`tests/preview.test.ts` records every `localStorage` key a preview-mode session and a normal session
touch (preview: only `textisland.preview.*`; normal: only `textisland.save`/`textisland.saved`),
checks that the two sets of slots stay apart, that `seed` is read only in preview mode as whole
digits, that one seed gives one new game, and `ti.unlock`. `tests/studio/preview.test.ts` covers the
preview URL and seed parsing. `tests/studio/game-content-root.test.ts` starts the dev server with
and without `STUDIO_ROOT` and checks which `content/` the game's loader reads and that the
checkout's stays denied.

One Studio browser scenario (temporary `STUDIO_ROOT` only) opens the panel, seeds a new game twice,
uses give item, advance time, unlock area and start task, saves a new item through the Studio,
checks that the game reloads with it while the Studio page does not (marker, drafts and undo
history survive an external edit), uses Save and reload preview, shows the content error screen
and verifies that the page's `textisland.save`/`textisland.saved` are unchanged. Golden traces,
frozen fixtures and the game smoke test are unchanged.
