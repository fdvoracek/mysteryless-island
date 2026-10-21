# Visual style

Required before changing player-visible UI, layout, CSS, typography, icons, or artwork.
For illustration or visual-asset creation/editing, also read [ART_DIRECTION.md](ART_DIRECTION.md)
and inspect the relevant [approved references](../assets/art/references/README.md).
Routine gameplay, persistence, content-text, and tooling work without visual changes need not
load either guide. Carry these reading requirements into delegated visual work.

## Direction

The game should feel like reading an illustrated nineteenth-century Jules Verne adventure
novel: a quiet, mostly white book page, restrained serif text, generous whitespace, and sparse
black-and-white illustrations. Text and clear interactions lead the page. This is the adopted
direction for future visual work; storing the guides does not implement a new interface.

## Interface rules

- Keep the classic layout's route map, journal, central actions, and status panels coherent.
  Preserve the responsive phone layout and readable text at narrow widths.
- On wide screens, frame the story, action, and sidebar columns with thin shared-edge rules.
  Place the route map in the space above the middle frame so the story and sidebar begin closer
  to the panorama. Small crossed corner joints and a fine second rule on the middle frame's
  top edge reflect the approved reference; keep inner status boxes simpler. Stack the map and
  three framed sections at narrower widths.
- Use the shared `--font` system and respect the player's font choice. Build hierarchy with
  spacing, type size, weight, and restrained small-cap headings, without adding competing fonts.
- Prefer white/light neutral surfaces, ink text, thin rules, and understated outlines. Preserve
  readable contrast, focus states, and existing theme support. Artwork's strict monochrome rule
  does not ban restrained CSS accents for selection or status; pair color with other cues.
- Keep decoration sparse: no faux parchment, paper textures, ornate frames, heavy shadows,
  busy background imagery, or repeated flourishes. A small divider or navigation ornament
  should earn its space rather than compete with prose.
- Implement labels, buttons, borders, progress, and navigation with HTML/CSS and the shared
  functional icon system. Generated pictures must not contain or replace interactive controls.
- Illustrations support the reading experience. Define the actual display slot and check the
  image at that size; keep details readable and whitespace generous. Adding art does not justify
  new panels, new mechanics, or an unsolicited redesign.
- Use the shared creation-tree layout and interactions for both crafting and building. Keep
  nodes compact, details in floating tooltips, aligned branches, simple stems/forks, and
  two-axis grab panning with hidden scrollbars. Preserve click, touch, and keyboard access.

## Using the references

The latest [panoramic UI composition](<../assets/art/references/Vintage Parchment Survival Adventure UI.png>)
guides the illustrated header, route-map placement, journal/action/sidebar hierarchy, and item
row composition. Use the white, neutral treatment above rather than its parchment texture,
warm artwork tint, background landscape, or repeated compass ornaments. The large panorama
is one game-wide image above all three tabs, including Crafting and Building. It does not
change with the player's location; do not make separate area headers for now.

Start with [the reference index](../assets/art/references/README.md), which assigns each image
a role. The four-panel UI composition guides hierarchy, illustration placement, spacing, and
the relation between the journal, actions, and status. It shows alternative views, not four
simultaneous game layouts. Its sample labels, costs, times, quest lists, and control locations
do not override game content or [architectural behavior](../ARCHITECTURE.md).

The island engraving guides geography, composition, and the engraving vocabulary. It is much
denser than the written target for new game artwork: simplify hatching and shading, retain
more white space, and avoid overwhelming nearby text. Read the art guide only when creating
or editing such assets; a layout-only task does not need its generation prompts and checklist.

## Review

For visual changes, inspect the result in the actual game at desktop and phone widths. Check
hierarchy, whitespace, text contrast, focus, tooltip placement, overflow, and usable controls.
Compare imagery at its intended display size with the relevant approved reference. Preserve
existing gameplay and interactions; a mockup supplies visual direction, not executable rules.
Keep new decisions in this guide or the art guide, and keep reference files unchanged.

Review the single top illustration at its actual display size and verify its source dimensions,
crop, and Pages URL. Item and building artwork still follows the art guide's consistency and
actual-file preview requirements. A multi-area panorama set is deferred unless the user changes
the one-banner direction.
