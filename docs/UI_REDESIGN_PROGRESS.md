# Illustrated book UI delivery

The user approved the implementation sequence on 2026-10-20 and requested a separate commit
and feature-branch push for every delivered milestone. The large area panorama remains above
the route map and all three tabs: Area, Crafting, and Building. Tab changes do not hide it.

Milestones 1–3 were merged in PR #8 on 2026-10-20. Subsequent work starts from current main
on `art/area-master-review`; its first review checkpoint contains the unapproved beach master
and actual-file previews, not a delivered artwork milestone or production integration.

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
4. **Coordinated region artwork — master candidate in review.** Locate the actual approved simpler beach master,
   or produce a concrete master candidate for approval. Generate beach, forest, and meadows
   against that one master, verify 1600 × 440 exports, compare the complete set, and integrate
   the approved files on all tabs. Never substitute searched images as previews.
5. **Functional component styling — pending.** Consistent item illustrations and consumable
   rows, quantities/capacity from existing content, informational task markers, and matching
   creation-tree tooltip treatment while preserving compact nodes and shared grab panning.
6. **Remaining screens and verification — pending.** Popups, menus, progress, ending screen,
   light/dark treatments, fonts, narrow screens, keyboard/touch behavior, and complete checks.

Finish, inspect, verify, commit, and push each milestone before starting the next. Record its
acceptance evidence here. Screenshots must show the actual running UI; artwork previews must
show the actual exported files. A missing master does not block the first three milestones.
Do not mark the artwork milestone delivered until its required approval and whole-set review
are complete.

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
- Milestone 4 is not delivered: a new beach candidate is being reviewed before companion
  generation. Its raw output is 2041 × 770, not the required 1600 × 440 production export.
  See [the candidate review packet](../assets/art/candidates/area-book-v1/README.md).
  A fresh production build and six labelled browser previews at 1280/375 px confirm the
  proposed CSS framing above Area, Crafting, and Building. The original image checksum is
  unchanged. No production catalog entry, crop/resize export, or companion image exists yet.
