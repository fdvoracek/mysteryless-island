# Mysteryless Island — Content Studio implementation and migration plan

Status: **[proposal — agent handoff; not implemented]**  
Prepared: 2026-10-21  
Scope: monorepo migration; separate game and Content Studio web applications; shared engine/content contracts; graphical no-code authoring, localization, preview, validation and publishing.  
Existing authority: ARCHITECTURE.md records implemented game invariants; docs/TDD.md documents technical behavior; docs/GDD.md documents game design. Code and tests determine actual current behavior.

> **Execution contract:** Every numbered deliverable below is **exactly one separate pull request**, with a coherent working and manually testable result. Do not combine numbered deliverables in one PR or start dependent PRs against unmerged work without an explicit stacked-PR arrangement. The game must remain playable at the end of every merged PR; incomplete studio screens must be hidden, read-only or explicitly labeled nonfunctional. All changes to production content must pass the existing content validator. Never treat the mockup as already implemented.
>
> **Unresolved decisions:** Do not silently invent an answer. See §3, “Decision gates”. An agent must obtain the owner's decision before implementing a gated behavior. The rest of the plan may proceed independently; a PR that needs an unresolved decision stays out of scope until it is answered.

## 1. Outcome and non-goals

**Primary outcome.** A non-programmer can create a new region with its map placement, discoveries, actions, items, recipes, buildings, tasks, story scenes, conditions, rewards, illustrations and authored text, then validate and playtest a draft and publish it without editing game code. The game remains a static browser app. Authoring new combinations of **supported** mechanics is no-code; adding a fundamentally new engine mechanic still requires code plus corresponding editor and schema support.

**Independent apps.** Player game at /mysteryless-island/ and authoring app at /mysteryless-island/studio/ after deployment is enabled. Each can build/test independently; both consume one content contract and engine implementation. A hosted editor on GitHub Pages is static; it cannot safely write repository files without authenticated infrastructure. Local authoring comes first; hosted write access is a separate gated deliverable.

**Out of scope unless explicitly approved:** arbitrary scripts/eval in authored data; replacing the game UI framework; a multiplayer game; content-hosting backend required by players; user accounts for the game; turning the editor into a generic multi-game commercial product; changing survival balance or story while migrating; replacing the star-shaped route model with an arbitrary travel graph solely to satisfy an editor mockup.

**Quality bars:** no regression to deterministic RNG, timed work, reserved inputs, production batches, pause/resume, quests, starting event or frozen test fixtures. Incompatible old saves may be retired; a fresh game must work at the end of every PR. Preserve IDs and reference meaning. No editor-only fork of the engine. All user-visible texts comply with docs/NARRATIVE_STYLE.md. Narrative variants are alternative wordings, not sequential paragraphs. Test content remains frozen; production data is validated independently.

## 2. Verified baseline — inspect again before implementation

This plan was based on the main branch on 2026-10-21; implementations must check the latest branch and reconcile any changes before editing.

- Current source: src/main.ts bootstraps the game; src/content/loader.ts uses Vite import.meta.glob for content/**/*.json or tests/fixtures/content/**/*.json in engine-test mode.
- src/content/schema.ts defines the Zod schemas for Region, Landmark, Activity, Item, Recipe, Building, Quest, GameEvent, CreationTree, Condition, Effect, Text, game, stats and climate.
- src/content/registry.ts provides buildRegistry, cross-reference checks, uniqueness, site capabilities and textKey indexing. src/content/text-keys.ts derives legacy inline keys and supports explicit IDs. Source-of-truth descriptions are in content/.
- src/core/engine.ts and src/core/* own a serializable deterministic simulation; separate gameplay and narrative RNG streams exist. Browser timing is handled by src/app/action-controller.ts, not the engine.
- src/core/state.ts reports SAVE_VERSION = 7. src/core/state-schema.ts has rendered strings in log entries and popups. src/persistence/save.ts uses localStorage keys textisland.save and textisland.saved; src/persistence/migrate.ts reconciles referenced definitions. Changing stored text representations demands a planned save migration.
- Region coordinates are authored in region.map; travel is currently centered around the starting camp using travelHours, not an arbitrary authored edge list. Region description/arrival are journal text; explore.view and landmark.text are modal text.
- Content validation command: npm run content:check. Frozen fixture tests: npm test and npm run test:e2e. CI workflow .github/workflows/pages.yml deploys dist/ from main; existing pre-push hook and AGENTS.md have repository-specific workflow rules.
- Current single-package Vite/TypeScript project; React, workspaces, editor source APIs and content compiler are **not** present.

**Baseline inventory task:** an implementing agent must enumerate every string-valued translatable field, field meaning, reference and special case before performing text extraction. Inventory includes UI labels, game.json templates, variant pools, event choices, landmark labels, recipe ways, creation branches, condition explanation strings, built-in text and journal fallback behavior.

## 3. Decision gates — request explicit answers, do not guess

These questions are intentionally **not** settled by the present conversation. Before a PR reaches a gate, discuss its concrete alternatives with the owner and add the decision to ARCHITECTURE.md (and where appropriate the GDD/TDD). Until then follow the conservative boundaries below, without implementing irreversible changes.

| Gate | Owner decision needed | Required before |
|---|---|---|
| D1 Studio editing surface | Local-only file-backed authoring as first release, or browser-first hosted edits from day one? The plan stages a local writer and read-only hosted site but does not assume final scope. | PR-09, PR-22 |
| D2 Hosted publishing authentication | GitHub App + small trusted service, OAuth-supported flow with safe backend, or no hosted publishing? Never ship embedded PATs, unrestricted cross-origin writes or secrets to GitHub Pages. | PR-23 |
| D3 Data authority and format | Maintain current content JSON as canonical and add a text catalog, or migrate all source content to a different canonical representation? Until approved, preserve canonical JSON and add adapters rather than replacing it. | PR-05, PR-07 |
| D4 Translation and switching policy | Which first additional language, required completion/fallback policy, whether switching must update historical journal/popups instantly? Preserve current English default while unresolved. | PR-07, PR-08, PR-18 |
| D5 Save compatibility — **RESOLVED** | **Owner decision (2026-10-21): old saves may be incompatible or discarded during migration because only the owner is testing. No legacy save migration is needed.** The app must detect incompatible data, offer a clear start-new-game path and remain playable after every PR. | All PRs; no further decision required |
| D6 World graph | Keep authored map positions and camp-based travel for now, or support authored per-edge travel networks and shortest paths? No mechanical travel redesign before approval. | PR-19 |
| D7 Visual/gameplay scope | Does the first complete editor need global game settings, climate/stats and every niche schema field, or is milestone coverage acceptable? Define the completeness inventory before declaring no-code production ready. | PR-20 |
| D8 Studio access/collaboration | Single author, team reviewing through PRs, or multi-user real-time collaboration? Do not implement accounts/collaboration speculatively. | PR-22–23 |
| D9 External assets | Should image files be edited/uploaded locally only, or published using hosted storage/GitHub API? Maintain existing art direction and local validated artwork paths unless approved. | PR-21 |
| D10 Deploy policy | Is publishing a studio build publicly at /studio/ acceptable before hosted editing is supported? Read-only is not a security boundary by itself. | PR-22 |

For every gate: record the answer, changes to PR scope, migration consequences and acceptance tests. Where the owner defers a decision, the dependent PR must not claim completion. Avoid a speculative “temporary” implementation that forces later save or schema incompatibilities.

## 4. Target boundaries and contracts

Proposed workspace layout (final names may change only with a recorded decision):

~~~text
apps/game/                  existing player-facing Vite app, controls, UI, saves
apps/studio/                React + TypeScript + Vite authoring UI
packages/content-model/     schema, types, reference validation, IDs, text metadata
packages/engine/            pure engine, RNG, simulation, selectors and state schemas
packages/content-compiler/  pure + CLI deterministic source-to-bundle conversion
content/                    canonical authoring data, locales, validated artwork refs
tests/                      frozen fixture data and integration tests (may be relocated carefully)
e2e/                        game smoke tests + separate studio e2e
docs/                       documentation and PR acceptance evidence
~~~

**Dependency rule:** content-model is independent of browser/UI, storage and backend. Engine depends on content-model, not on game or studio. Compiler depends on content-model, not on app UI. Game depends on engine and compiled content. Studio depends on content-model/compiler interfaces and may import the engine for real previews. Studio UI never executes its own reimplementation of game rules. No cycle between packages.

**Supported adapters:** canonical source-to-model reader; deterministic compiler to versioned normalized bundle(s); runtime loader from compiled bundle; source editor adapter; isolated playtest loader that accepts validated drafts. Keep buildRegistry (or equivalent public API) as a single validation entry point. Distinguish source authoring data, compiled content, and serializable player state.

**IDs:** retain existing snake_case entity IDs and every persisted reference. Add stable text IDs distinct from game entity IDs. IDs survive wording changes and file moves. Renames should update cross-references in one transaction or be refused with an actionable list of blockers. Never change IDs implicitly on a display-name edit. Explicit migrations are necessary for persisted state references.

**Compiler:** from the same source revision, repeated builds must produce byte-stable output (normalized ordering/formatting and no timestamps in hashed content), fail with file/entity/path diagnostics, validate all cross-references and placeholders and reject invalid releases. The shipped game never parses CSV at each startup; it loads validated built artifacts. Do not require a runtime CMS service.

**Save/version contract:** the owner explicitly waives backwards compatibility with existing saves. Bump SAVE_VERSION when necessary and expose a clear new-game flow for incompatible saved data; never crash or get stuck on an unreadable save. Ordinary save/load/autosave for **new games produced by each merged PR** must continue to work. Keep editor previews isolated from player save slots. No legacy save migration code or compatibility adapters need be developed solely for old saves.

**Localization contract:** language-independent mechanics plus keyed strings and variant identities. Variant selection must stay independent of gameplay RNG and respect “no immediate repeat” semantics. Modal and narrow journal channels have separate keys. Locale bundles have explicit fallback, placeholder validation and missing-key reporting. Existing English prose must remain equivalent through extraction.

**Publish contract:** draft != released content. Validations and build tests run before content is accepted. Git review is the source of published history. Content changes should be auditable as readable file diffs. Hosted authoring must never grant unauthenticated repository write access.

## 5. PR conventions (mandatory for each PR)

Every deliverable is a **single independently mergeable PR** with:

1. A concise feature contract, exact migration steps, changed directories and upgrade/rollback notes; link its parent requirements in this plan.
2. Tests added with the feature, including at least one negative/validation case where applicable; shipped production validation separately from frozen fixtures.
3. Green npm test, npm run content:check, npm run typecheck, npm run build and npm run test:e2e (or the documented workspace replacements, including separate studio tests when present). Report any unrun test and why.
4. At least one meaningful manual demonstration of a **working** behavior; attach commands, screenshot or text transcript to the PR. “Code compiles” is not sufficient for an editor feature.
5. No placeholder buttons presented as functional, no disconnected second content schema, no silent fixture rewrites and no unreviewed production gameplay/balance changes.
6. When migrating code/data contracts, use temporary adapters **within the PR** if necessary to prove parity; remove dead adapters when the new path is tested. Old player saves do not require preservation.
7. A rollback must restore a playable game for a fresh start and must never leak an editor draft into the published game; legacy save continuity is not required.
8. Tests of malicious or malformed authored content and safe error reporting where user input crosses trust boundaries.
9. Updates to AGENTS.md, docs/TDD.md, ARCHITECTURE.md, docs/NARRATIVE_STYLE.md or README.md only if that PR changes the relevant implemented contract; distinguish [implemented] from [proposal].
10. Keep scope small enough for review. If implementation becomes larger than described, update the plan with a separate approved PR instead of silently splitting an acceptance criterion or delivering half a working feature.

**Test evidence template:** PR ID; manual setup; action performed; observed before/after; automated test commands + results; bundle/snapshot diffs; save migration result; compatibility check; screenshots for visible UI; risks/gates resolved.

## 6. Delivery sequence

The PRs form a linear path with explicit optional gate-dependent late phases. Their numbers define preferred merge order. Do not claim a future step as implemented when an earlier scaffolding PR lands.

### PR-01 — Baseline contracts, regression tests and authoring inventory

**Delivers:** a tested snapshot of current player behavior that later migration PRs can compare; no game UI change.

**Implementation:** catalogue all content entity kinds, fields, nested translatable strings, refs, id uniqueness, Vite globs and fixture divergence; record current build outputs, important selectors and edge cases. Add parity fixtures testing shipwreck initial event, region discovery, activity costs/timing, quests, creation-tree unlocks, interrupted work, local production, event branching, seeded narrative variants, reload and preserved save behavior. Write a small inventory report under docs/ including known gaps and desired export mapping.

**Acceptance:** existing game plays as before; smoke tests and content validation remain green; inventory accounts for all schema text locations and every special runtime-written sentence. A future agent can mechanically verify old versus migrated outcomes from stable seeds and commands. No rebalancing or prose edits.

**Manual demo:** new game → shipwreck choice → beach discovery → craft action → save/reload; record expected journal, work and state results.

### PR-02 — npm-workspaces skeleton and game application move

**Delivers:** real monorepo structure with the unchanged playable game as apps/game, root npm workspaces and stable scripts. **Not** yet a studio.

**Implementation:** move game-specific Vite entry, source, assets, CSS and config carefully; retain canonical content/ and test fixtures; configure TypeScript paths/project references only where needed; root commands proxy tests/build/e2e; update Playwright paths, pre-push hooks and GitHub Pages workflow to publish the same game URL and same file tree. Ensure Vite base resolves /mysteryless-island/ and static assets correctly (relative base is currently ./). Use a temporary compatibility directory or imports rather than changing behavior. Preserve useful npm run dev/test/check entrypoints.

**Acceptance:** clean npm ci, npm run dev, npm run check work from repo root; player game remains at current URL with 320px/mobile and desktop smoke coverage; old saves may require a fresh start; starting a new game, saving and reloading must work. One deploy still publishes only the game. Test from fresh start, including saving/reloading under this PR.

**Manual demo:** load the unchanged GitHub Pages game after branch preview or local production build; traverse a region and reload a saved action.

### PR-03 — Extract the shared content-model package

**Delivers:** game imports one reusable @mysteryless/content-model package; working content validation still matches baseline.

**Implementation:** extract src/content/schema.ts, registry.ts and text-keys.ts into packages/content-model, export typed APIs (parse, buildRegistry, ContentError, entity types, stable text identity and reference diagnostics); keep the game loader as an adapter. Preserve strict Zod behavior and stripping of underscore-prefixed author notes. Expose typed helpers needed by editors (entity listing, reference enumeration, validation errors), but do not create new feature behavior. Avoid copies of schema/validator inside apps.

**Acceptance:** parity snapshots from PR-01 match; existing production and fixture validations give equivalent pass/fail results and file/path error messages; importing the package in a minimal Node script works.

**Manual demo:** introduce an invalid item reference, show the shared validator rejects it with a location; revert and play.

### PR-04 — Extract engine and state contracts without gameplay changes

**Delivers:** pure @mysteryless/engine package used by the game, allowing later studio previews to reuse actual simulation code.

**Implementation:** relocate core engine, rules, state schemas, RNG, selectors and pure helpers without changing command semantics. Keep scheduling, UI and browser persistence in apps/game or clearly named adapters; decide exact placement of narrative formatting helpers based on their dependencies. Avoid DOM/Date/localStorage access from engine code. Preserve functioning save/load for a newly started game; change SAVE_VERSION when data contract changes and present a clear incompatible-save reset path. No backward migration of old saves is required; test engine against frozen fixtures.

**Acceptance:** identical seeded command traces, game-time advancement, pending action resumption, outcome rolls, work input reservations, timers, production and journal selection. npm run check remains green; standalone Node import can run Engine.newGame and dispatch without a browser.

**Manual demo:** simulate a timed gather with a deterministic seed from the package and repeat the same sequence in the browser.

### PR-05 — Deterministic content-compiler v1 and runtime adapter

**Delivers:** content can be compiled at build time and loaded by the game without loading authored source JSON directly in its production bundle.

**Implementation:** add packages/content-compiler with a Node CLI accepting source directory, output directory, mode (production/fixture) and diagnostics options. Validate source with shared registry; generate manifest including formatVersion, source schema version, stable content IDs and hash; emit normalized gameplay data to an immutable bundle. Keep a reader/adapter producing the same Registry; keep fixture mode independent. In the first iteration compile the current JSON without extracting prose yet. Ensure in-browser runtime does not parse CSV or load a CMS. Update Vite build scripts to run compilation before bundling or to import a generated manifest; do not require side effects during arbitrary package imports.

**Acceptance:** same input yields identical bytes/hash across two builds; invalid references/time increments fail before emitting publishable output; game still plays with same behavior; fixture build uses only fixtures; no authoring paths or credentials leaked to dist.

**Manual demo:** edit a copied production JSON file, compile, inspect its manifest, run a game build and verify authored behavior; repeat compilation and compare hashes.

### PR-06 — Stable translatable-text IDs and extraction audit

**Delivers:** a mechanically checked English text catalog with key-level traceability and a compiler that preserves current visible English wording, including alternatives.

**Implementation:** enumerate every user-facing source field in schema and game code; define separate UI/system text classification, modal prose, journal prose, labels, warnings and narrative variants. Design stable IDs independent of path/order, with deterministic generated initial IDs recorded to source (not recomputed silently when arrays move). Create an extraction/mapping script and catalog lint; preserve interpolation placeholders and narrative variant order/indices. Show old path → text key → locale entry and source references in a report. Keep compatibility between old Text shapes and new keyed references during the transition; no forced replacement of all JSON in one commit unless proven safe by parity tests.

**Acceptance:** 100% of shipped text fields are classified; stable explicit IDs survive file moves; extraction rerun is idempotent and does not modify game mechanics; snapshot of modal/journal English output matches prior build in first-variant test mode; no missing keys. Unchanged gameplay seed traces.

**Manual demo:** change the English label for one discovery using its catalog entry, compile, and see the expected change only in the target UI text.

### PR-07 — English runtime catalog resolution and locale bundles

**Delivers:** game loads a build-produced English locale bundle through a shared text resolver; compiler enforces key/placeholder correctness.

**Implementation:** split mechanics and locale data in build output while retaining the canonical authoring source structure approved at D3. Define format for single text and variant groups; create independent locale bundles with stable keys and the same variant identity/order; validate missing/duplicate keys, unsafe placeholder changes and semantic text type mismatches. Resolve strings at presentation/runtime boundaries; preserve the seeded choice and no-repeat semantics. Add a locale abstraction that defaults to English; do not invent translated game copy. Avoid adding runtime reload of authored CSV/JSON source.

**Acceptance:** English matches baseline; invalid or missing locale keys fail release validation (or satisfy explicitly decided fallback policy); no gameplay RNG drift when text variants change; switching the resolver to an identical test locale does not change inventory/quests/progression.

**Manual demo:** change only a locale catalog string, build, and verify the game displays the change; confirm production bundle contains independent mechanics and text assets.


### PR-08 — Runtime language switching and text-bearing state redesign

**Delivers:** an English-capable language picker/resolver whose runtime can switch catalogs without resetting gameplay; test with a deliberately synthetic second locale, not hand-written final translation.

**Decision gate:** D4 (switch behavior / fallback). Old saved games do **not** need to survive this PR per resolved D5.

**Implementation:** add locale selection in app state and persist the user's preferred locale separately from the game save. Replace reliance on irreversible rendered strings for journal/popup entries with serializable message descriptors where feasible: { textId, variantId/index, vars, renderedFallback? }, timestamp and turn. At selection time capture variant identity once; changing language must not reroll text or advance gameplay RNG. For dynamically synthesized phrases, introduce stable template references/structured fragments and keep an explicit safe fallback for truly unresolvable historical lines. Update selectors/UI and popup serialization to resolve at render time. Reuse the same registry and catalog resolver for events, exploration, game templates and UI chrome. Keep save controls and autosave fully functioning for newly created sessions; bump SAVE_VERSION if necessary and handle old saves with a clear restart. Do not change event order, clock, actions, rewards or effects.

**Acceptance:** choose a synthetic test locale during an active game; region name, event modal, newly generated log and (if selected at D4) past journal entries change language without duplicating entries or selecting new variants. Switching back to English restores original English. Command trace and RNG states remain unchanged; create, save, refresh and load a **new** game successfully. No missing-key placeholder appears silently.

**Manual demo:** play through shipwreck and spring discovery, switch to test locale and back, finish an action, save/reload. If old save exists, a new-game action restores the playable state.

### PR-09 — Studio scaffold, navigation and read-only content browser

**Delivers:** a working independent React/Vite Studio application; browsing actual validated game entities is possible, but there are no save/write buttons yet.

**Implementation:** create apps/studio with own entry, dev/build/test scripts, TypeScript configuration, routing at /studio/, responsive accessible shell, navigation for Regions, Items, Events, Tasks, Crafting, Buildings, Translations and Project. Consume @mysteryless/content-model and compiler-generated readable metadata/manifest; show list/detail for currently shipped data, stable IDs, basic search/filter and a friendly invalid-content state. Use the supplied studio visual mockup only as a design reference, not a fidelity requirement that overrides current game style guides. Keep studio CSS/React out of player game bundle; document local dev port and commands.

**Acceptance:** root npm run dev:studio opens the application; the Forest exists and shows its current metadata/landmarks; searching finds an event and an item; broken JSON produces a readable error without a blank screen. App has zero write authority and does not affect player game.

**Manual demo:** navigate Regions → Forest → Landmarks → Spring; browse Shipwreck event and Rock Knife recipe.

### PR-10 — Local authoring workspace, change tracking and safe writes

**Delivers:** editors can make an intentional content change and persist it to canonical source files via an authenticated **local-only** authoring service, then see resulting git diffs.

**Decision gates:** D1 and D3. If undecided, implement only read-only Studio from PR-09 and ask before adding file-write functionality.

**Implementation:** implement a local Node development server/CLI with narrowly scoped endpoints (workspace snapshot, validate, write change, revert change), bound to loopback with appropriate origin/token checks; no unrestricted filesystem path supplied by clients. Source adapter reads existing JSON and maps typed entities to source file+path; editor changes are validated, written atomically (temp file/rename) and preserve unrelated content. Include optimistic conflict detection using file hash or revision token; refuse stale overwrites. Provide undo/redo for the active draft and dirty-state indicator, explicit Save Draft, Cancel/Revert. Support malformed source recovery with backup/error rather than overwriting it. Preserve comments (_note) and the repository's formatting conventions as reasonably as possible; snapshot diff tests prevent unintended rewriting of entire content trees. Ensure no dev write server is bundled in GitHub Pages output.

**Acceptance:** update Forest title from studio, save, inspect exactly the intended JSON diff, re-open editor and see it persisted; validator and game build use changed source; reject invalid ID/cross-ref, stale revision, outside-root file path and malformed input. Writing a draft does **not** publish game content automatically. Clean restart/revert returns same working game.

**Manual demo:** edit a harmless display label, save, use git diff, run game with changed content, revert and run again.

### PR-11 — Region CRUD and typed metadata editor

**Delivers:** author can create a region, edit its properties and delete an unreferenced draft region without touching source code.

**Implementation:** typed region form for id (created once), name, title, description, order, climate baseC, travelHours, map x/y, siteCapabilities, artwork, shelterWhen, hintWhen, unlockWhen and firstVisit/arrival configuration as supported. Use selectors for references; validate missing required fields, duplicate IDs, step-compatible durations and appropriate coordinate constraints. New region scaffolding uses valid defaults approved by schema only, **not** invented biome/gameplay. Explicitly show all required fields and don't create dummy valid-looking text. Provide reference-aware deletion with blocking dependencies; globally referenced region IDs cannot be silently renamed. A draft-only region that has no landmark or activities may be valid if schema permits.

**Acceptance:** create region with ID and authored title, see it in Studio and in game's validated registry/map when built; edit climate/travel position and see correct effect; duplicate ID and deletion of referenced region are blocked; player can still navigate existing regions and start a fresh game.

**Manual demo:** create a temporary 'coastal_grotto' with an unlock rule, build/play to verify it can become visible, then delete/revert and confirm no lingering reference.

### PR-12 — Landmarks, regional views, and dual-channel prose editor

**Delivers:** fully usable authoring for look-around view lines, discovery landmarks, and their modal vs journal texts.

**Implementation:** region > explore inspector; edit view[].{text,when}, nothingLeft, landmark id/label/hours/effort, visibleWhen, requires/requiresText, siteCapabilities, effects, and per-landmark long text + short journal. Allow multiple text variants with clear semantics (alternatives, **not** ordered paragraphs); distinct presentation fields for modal and journal. Include live character guidance (journal recommended <=80 characters, not a hard schema rejection until approved), placeholder checks, rich paragraph breaks with safe plain-text persistence, edit/reorder/remove, and fallback warning when journal is absent. Do not add fictional discoveries to production content as the demo; use test fixture or revert.

**Acceptance:** author a new landmark in an existing region via UI; look around lists it under authored conditions, duration and effort apply, discovery applies stated effects, modal shows full passage and journal shows its short summary; a variant edit does not change game outcomes. Deletion reports downstream references. Test multiline/newline, unsafe/missing placeholders, variants and no-immediate-repeat behavior.

**Manual demo:** add a temporary forest landmark with a distinct two-sentence modal and 10-word journal; reach it in a new game, then revert.

### PR-13 — Region activities, outputs and action authoring

**Delivers:** editor supports complete Region.activities CRUD, timed work, yields, conditional outcomes, log text and action tags.

**Implementation:** typed activity list and inspector for global/local, building grouping, icon, name/id, hours, effort, visibleWhen, requires, requiresText, cost, yields with min/max/chance/condition, outcomes (weight, when, text, effects), thoughts/afterwards and tags. Reuse read-only structured JSON fallback for fields whose rich widgets arrive in PR-14 but do not require code edits to save; all saved data passes schema. Warn when icon vocabulary doesn't contain requested value instead of inventing icon type. Provide reusable action template only with exact existing semantics.

**Acceptance:** author a gather action from a temporary region, see its button after the applicable discovery, spend game time/resources, receive expected yields/log; probability tests can seed expected outcomes; invalid quantity, time step, unknown item, mismatched tool are rejected. Existing actions keep working.

**Manual demo:** add a temporary gather-stone activity in the test region via Studio, execute it once with a deterministic seed, show inventory and journal.

### PR-14 — Shared visual condition, effect and outcome builder

**Delivers:** a reusable and accessible graphical editor for every **currently implemented** Condition and Effect variant used by the preceding Studio forms, events, tasks and creation.

**Implementation:** recursive AND/OR/NOT group controls; leaf condition forms for item quantity, seen, flag, timer, region/at, stat, warmth, phase, effort, day, did, today, reached, quest, discovered, explored, tool, site, built/sheltered and building status; effect forms for give/take/stat delta/timer/flag/unflag/log/weighted roll/startQuest/unlock/build/startCycle. Reference pickers filtered by entity kind, local-vs-global scope shown, help text consistent with engine semantics, validation at each nested node, preview of generated JSON and human-readable explanation. Reuse rule builder for visibility, eligibility and effects without conflating them. No arbitrary executable expressions or user code. Keep recursive depth and UI responsiveness bounded; large rule trees accessible via keyboard. Changes must round-trip through source, compiler and engine identically.

**Acceptance:** create combinations of nested conditions and effects without entering JSON, preview exact resulting data, edit and save; negative refs, invalid recursion and unsatisfiable conditions flagged or warned appropriately. Engine's evaluation must agree with the Studio tester for a chosen game state; randomized outcomes retain seeded determinism.

**Manual demo:** "Show action only after spring found and when water can owned" then grant a stat/resource on success; play through before and after the condition.

### PR-15 — Items, tools, consumables and item-action editor

**Delivers:** complete authoring of current Item fields, item actions and consumption without changing code.

**Implementation:** item CRUD with ID, name/plural, category, artwork, maximum quantity, tool capabilities/tags/amount/hoursFactor, consumption verb/duration/stats/effects/log/tags, nested item actions (id/label, building, uses, cost, visibleWhen, requires, outcomes, effects, log) and any other fields in the **current** schema. Use generated metadata to prevent omitted fields and keep dynamic forms aligned with Zod; display gameplay impact and references. Show inventory/consumables preview and capacity constraints. Existing special cases like water can and raw fish must remain correctly authored and interpreted by generic engine mechanics.

**Acceptance:** add a new item and a consumable action using Studio; connect it to a supported yield or event, play and consume it; quantity/cap/reference validation and proper tool requirements hold. Remove an unreferenced temporary item; referenced deletion is rejected with dependency list. All current items round-trip with no semantic changes.

**Manual demo:** add a temporary edible plant item with a consume log, grant it in a temporary event, eat it, observe stats and journal; revert.

