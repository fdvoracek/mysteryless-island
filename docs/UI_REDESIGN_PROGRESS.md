# Illustrated book UI delivery

The user approved the implementation sequence on 2026-10-20 and requested a separate commit
and feature-branch push for every delivered milestone. The top panorama is one image for the
whole game, above the route map and Area, Crafting, and Building. Travel and tab changes do
not change it.

Milestones 1–3 were merged in PR #8 on 2026-10-20. Subsequent work starts from current main
on `art/area-master-review`. The user rejected the first beach preview as unlike the supplied
design. A revised engraved image and page-style CSS were reviewed. The user then chose one top
image for the whole game and requested integration of the current proposal before more frame
or footer work.

Follow [VISUAL_STYLE.md](VISUAL_STYLE.md) and [ART_DIRECTION.md](ART_DIRECTION.md). The supplied
panoramic UI mockup supplies composition and hierarchy; use a white, neutral book-page
treatment without its parchment texture, warm artwork tint, large background map, or repeated
compass decoration. Preserve the selected font, themes, gameplay, and existing controls.

## Milestones

1. **Visual foundation — verified.** Shared spacing, typography hierarchy, thin borders,
   buttons, panel treatment, readable disabled/focus states, and coherent light/dark tokens.
2. **Classic layout — verified.** Global panorama frame, route map, journal area heading,
   flexible three-column workspace and sidebar, responsive phone stack, persistent work summary.
3. **Validated artwork support — verified.** Optional content-driven illustration metadata,
   validated references, selector views, shared image rendering, reserved dimensions, alt-text
   policy, missing-image fallback, and GitHub Pages base-path compatibility. No save migration.
4. **One game-wide panorama — implemented.** The revised beach engraving is copied unchanged
   to `public/illustrations/island-panorama.png` and selected by `game.json` → `panorama`.
   Its actual 2116 × 743 source is cropped without stretching in the 40:11 banner slot.
   Region artwork is a fallback only if the global setting is removed. Separate area headers
   are deferred by the user's direction.
5. **Functional component styling — started early after visual feedback, incomplete.** The
   actual journal, action, and sidebar columns now have stronger book-page hierarchy. Consistent item illustrations and consumable
   rows, quantities/capacity from existing content, informational task markers, and matching
   creation-tree tooltip treatment while preserving compact nodes and shared grab panning.
6. **Remaining screens and verification — pending.** Popups, menus, progress, ending screen,
   light/dark treatments, fonts, narrow screens, keyboard/touch behavior, and complete checks.

Finish, inspect, verify, commit, and push each milestone before starting the next. The CSS
correction was requested ahead of the remaining component work and does not mark milestone 5
complete. Record acceptance evidence here. Screenshots must show the actual running UI and
artwork previews must show their actual source files.

## Acceptance evidence

- Milestone 1: `npm run check` passed (322 unit tests, production build, 22 Chromium tests).
  Independent browser review covered light/dark at 1280, 375, and 320 px, selected fonts,
  keyboard focus, disabled controls, and both creation trees. No horizontal page overflow.
  Fixed an Escape-dismissal regression exposed by the new spacing: removing an overlapping
  tree tooltip no longer reopens it under a stationary pointer; explicit inspection still works.
  Delivered as `be0a27a` on `feature/illustrated-book-ui`; remote commit verified.
- Milestone 2: `npm run check` passed (322 unit tests, production build, 23 Chromium tests).
  Independent review checked desktop and 375/320 px phone layouts in both themes, selected
  fonts, and creation-tree interactions without page overflow. New browser coverage confirms
  the global slot stays outside tabpanels and the journal heading changes only after arrival.
  The panorama scaffold is genuinely empty/hidden; approved production artwork is still pending.
  Delivered as `a07c465` on `feature/illustrated-book-ui`; remote commit verified.
- Milestone 3: `npm run check` passed (347 unit tests, production build, 28 Chromium tests).
  New authoring/selector tests verify references, dimensions, alt text, safe local paths,
  optional metadata, unchanged game state, and panorama changes only upon arrival.
  Five real-browser helper tests exercise Pages subpaths, actual loads, stable image elements,
  cached failures, stale callbacks, and removing metadata. Independent source and integration
  review found no material issues. No production assets or save changes were introduced.
  Delivered as `4b9f43b` on `feature/illustrated-book-ui`; remote commit verified.
- Earlier review checkpoint: the first 2041 × 770 candidate was rejected as too flat. The
  revised 2116 × 743 source was shown in temporary previews with a CSS page-style correction.
  `npm run check` passed on the second complete run (347 unit tests, build, 28 Chromium tests);
  an intermittent tree-tooltip check passed alone and in the repeat. See [the review history](../assets/art/candidates/area-book-v1/README.md).
- Milestone 4: the user selected a **single** top image for now and asked to implement the
  revised proposal. The production file has the same SHA-256 as the inspected source,
  `64353ba51fdededeb848177d0080c60e8958a3e4f1e8fdacf91e403a24b28336`.
  The actual game rendered it on Area, Crafting, and Building at 1280 and 375 px with a
  loaded natural size of 2116 × 743, CSS cover at 50% 55%, and no horizontal page overflow.
  `npm run check` passed (348 unit tests, production build, 28 Chromium tests). No save change.
