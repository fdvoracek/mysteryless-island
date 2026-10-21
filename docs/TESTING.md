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
before delivery. It also validates the shipped content and builds the production bundle;
test source files are not bundled into the playable game.
