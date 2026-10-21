# Frozen engine scenario

`content/` is a test-only snapshot of the game definitions at commit `0be02db`. Unit and
browser tests use it to exercise engine and UI behavior without depending on edits to the
shipped game's labels or prose. Do not automatically sync it with production `content/`.
Change a fixture only when a test scenario intentionally changes, and update its assertions
in the same commit.

The production build still uses the shipped `content/`. `npm run content:check` validates its
schema and references without matching particular wording. Browser tests use a separate
`dist-test/` build so that GitHub Pages always receives the production `dist/` build.
