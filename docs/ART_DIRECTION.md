# Visual Art Direction — Jules Verne Survival Game

> **Mandatory instructions for Codex and all image-generation workflows in this repository.**
> Applies to every newly generated or edited game illustration, icon, item drawing, location scene, and decorative visual asset. Treat consistency as a release requirement, not a preference.

For UI presentation, start with [VISUAL_STYLE.md](VISUAL_STYLE.md). Read this detailed guide
when creating or editing illustrations or visual assets, rather than loading it for ordinary
coding or layout-only work. The [approved reference index](../assets/art/references/README.md)
records the initial user-selected images and their roles. The UI composite guides integration;
the island engraving guides geography and composition, with its dense detail simplified to
the low-density target below. These references do not change gameplay or authorize a UI rebuild.

## 1. North star

The game should feel like **reading an illustrated 19th-century Jules Verne adventure novel**, especially the black-and-white illustrations associated with **Jules Férat** and *The Mysterious Island*. Its interface is a **clean, minimalist, mostly white book page**, not an antique-themed game dashboard.

**Canonical look:** restrained black-and-white book engraving / pen-and-ink illustration, simplified for a modern text-first browser game. Clear silhouettes, selective fine hatching, soft gray values, generous unmarked white space. Quiet, precise, observational, adventurous.

**Important preference established during art iteration:** the user preferred the **black-and-white** version and repeatedly requested **fewer lines, fewer details, and less visual noise**. A detailed full-page engraving is **not** the target. The target is an *edited-down* Victorian illustration.

## 2. Non-negotiable invariants

1. **Monochrome only:** black, white, and neutral grays. No sepia, parchment yellow, brown ink, colored washes, accent colors, or warm tint **inside artwork**. The surrounding interface may have its own restrained CSS accents, but do not bake them into the images.
2. **White or transparent backgrounds:** use true white (#FFFFFF) for scenes on white UI; use transparent PNG/SVG when practical for objects/icons. No aged-paper texture, beige overlay, grunge, vignette, or decorative frame baked into assets.
3. **Low line density:** avoid all-over parallel hatching, excessive crosshatching, tiny stippling, and high-frequency textures. Leave large areas (sky, beach, water, empty background) largely untouched.
4. **Simplified forms:** recognizable, anatomically/geographically plausible silhouettes; a few carefully placed strokes for material, light, and depth. Use only details needed to communicate the subject.
5. **Consistent stroke language:** fine, controlled engraved/etched ink contours, limited hatch groups, and subtle gray wash or sparse tone where necessary. Do not mix with cartoon outlines, painterly brushes, photorealistic textures, or modern vector pictograms.
6. **Moderate contrast:** predominantly white/light-gray image area; medium-gray distance; dark accents reserved for a few focal objects and foreground shadows. Avoid huge black fills or harsh poster-like contrast.
7. **Uncluttered composition:** one clear focal point, strong visual hierarchy, ample negative space, and no unrelated props added for atmosphere.
8. **No text in generated illustrations:** headings, labels, quantities, buttons, borders, and typography belong in HTML/CSS, not raster artwork.
9. **No unsolicited redesign:** when asked to add a location, item, or feature, create only the needed artwork. Do not redesign the game UI, invent a new palette, or add ornamental chrome.
10. **Match existing assets before making new ones:** compare line weight, grayscale, framing, detail density, lighting, and whitespace against approved images. If a result looks more elaborate or stylistically different, reject and regenerate it.

## 3. Reference priority and asset library

Use this priority order for visual guidance:

1. **Approved production assets** in the repository, especially the most recently approved simplified black-and-white images.
2. **Curated references** placed by maintainers in `assets/art/references/` (if present).
3. This written specification.
4. Historical Jules Férat / 19th-century Verne book engravings as **historical inspiration only**, simplified substantially to match this game's visual density.

The historical references are **not** permission to imitate their full engraving density. When historical accuracy and interface readability conflict, **readability and established game consistency win**.

If the repository has no approved reference images yet, **ask for the approved reference files or explicitly flag that visual matching is provisional**. Never claim exact coherence based only on the text prompt. Once references exist, provide them to image-generation tools as image references when supported.

Suggested repository organization (adapt to existing structure rather than duplicating it):

```text
AGENTS.md
assets/art/
  references/        # human-approved style anchors, never overwritten
  locations/         # beach, forest, cliff, mountain, etc.
  items/             # knife, water can, shells, rope, etc.
  structures/        # campfire, shelter, fish trap, etc.
```

## 4. Asset-specific composition

### A. Location illustrations
- Wide, horizontal, observational illustrations with calm framing and one obvious landmark.
- Keep sky, sand, or water broad and minimally marked; suggest depth with **three simple planes** (foreground, middle, distance).
- Use sparse outlines and a handful of hatch clusters; distant objects are lighter and simpler.
- No people unless the requested scene explicitly requires them; no decorative border or caption.
- Default reference world: a deserted island with a beach, roughly 30 m cliff on one side, dunes backed by forest, and a mountain in the distance. Preserve geographical continuity when depicting the same location.
- Illustrations should support the story without dominating the reading interface.

### B. Inventory and crafting items
- Single item or simple bundle, centered, instantly identifiable at small size.
- Consistent three-quarter or simple side view, understated shadow, white/transparent background.
- Use minimal contours and just enough hatching to suggest wood, stone, fabric, or metal.
- No labels, UI frames, ground plane, dramatic lighting, or elaborate decorative flourishes.
- Items from the same category should share approximate scale and viewing angle.

### C. Buildings, tools, and action illustrations
- Show the functional structure clearly, without busy environmental scenery.
- For a campfire or shelter, suggest construction and materials using a few well-chosen lines.
- Use the same tonal range and line density as item and location assets.

### D. UI decoration
- Prefer actual CSS: 1 px rules, restrained serif typography, ample spacing, understated small-cap section headings.
- A tiny compass rose or chapter divider may be used **sparingly** if it supports navigation or book structure.
- Do not add faux paper textures, ornate corner frames, repeating flourishes, or background maps that compete with prose.
- Never use generated imagery to replace actual interactive UI components.

## 5. Master generation prompt

Use this exact base prompt and append the requested subject, framing, and dimensions. Do not omit the style constraints:

> Create a minimalist **black-and-white illustration for a text-first browser survival game**, visually consistent with a single restrained 19th-century Jules Verne adventure-book edition inspired by Jules Férat. Render as a **simplified fine-line wood engraving / pen-and-ink book illustration**: crisp, delicate contours, **very sparse selective hatching**, subtle neutral-gray tones, clear recognizable forms, restrained contrast, and **large clean white areas**. Prioritize calm composition, visual readability, and minimal detail over historical engraving complexity. Match the approved reference assets in line thickness, tonal balance, composition, and density. The illustration must feel quiet, precise, and coherent with other illustrations from the same book. **Pure white or transparent background as appropriate. Absolutely monochrome. No color, sepia, parchment texture, typography, captions, frames, UI, gradients, heavy crosshatching, dense lines, excessive texture, photorealism, painterly brushwork, cartoon styling, or extra decorative objects.**

Append a task-specific section:

```text
SUBJECT: [specific requested object/location/structure]
STORY CONTEXT: [what the player should understand]
COMPOSITION: [focal point, angle, foreground/midground/background]
OUTPUT TYPE: [location panorama / item / structure / small ornament]
BACKGROUND: [pure white / transparent]
ASPECT RATIO / DIMENSIONS: [required by the actual UI slot]
CONTINUITY: [existing geography, props, material details]
REFERENCE ASSETS: [paths to approved image files]
DETAIL BUDGET: low — simplify further if uncertain
```

## 6. Negative prompt / rejection criteria

**Reject or regenerate** if any of these appear:

- Color or warm sepia; yellowed or visibly textured paper.
- Dense engraving, tightly spaced hatch lines, all-over shading, excessive microdetail.
- Busy skies, overly textured water, forests made of thousands of individual leaves.
- Dramatic cinematic lighting, exaggerated fantasy styling, game concept-art polish.
- Anime, comic book, pixel art, 3D render, watercolor painting, modern flat vector icons.
- Heavy dark backgrounds, thick black outlines, high-contrast silhouette poster treatment.
- Unrequested people, animals, ships, buildings, labels, or ornamental objects.
- Decorative border, UI widgets, or words embedded in an illustration.
- Different line weights, perspectives, grays, or shadow conventions between related assets.
- A new asset that visually overwhelms nearby text or makes the page feel crowded.

**A successful asset should look intentionally unfinished compared with a traditional densely engraved book plate.** Simplicity is the distinguishing quality.

## 7. Mandatory Codex workflow for every new image

1. **Inspect** the existing relevant assets and this file. Identify at least one approved style anchor; use multiple anchors if asset types differ.
2. **Define** the asset's purpose, actual display dimensions, subject, composition, and continuity requirements. Do not invent details not needed by gameplay.
3. **Generate** using the master prompt and explicit reference assets where supported. Maintain the same model/settings when practical, but do not assume identical settings guarantee matching results.
4. **Review visually** at full size **and at the intended in-game size**. Compare side by side with approved art for line density, whitespace, value distribution, and overall restraint.
5. **Simplify first** if it feels inconsistent: remove hatch groups, tiny objects, background clutter, and tonal variation. Do not add detail to make it look more impressive.
6. **Check in context** against the mostly white game UI. Artwork should complement the text, not become the primary interface.
7. **Present for approval** when introducing a new visual category or when matching is uncertain. Do not silently accept an inconsistent image.
8. **Save** the approved image with a descriptive stable filename in the appropriate art directory; preserve source/reference information where practical. Never overwrite approved references automatically.

If the available image-generation tool cannot accept image references or inspect outputs, **state the limitation and request human review**. Do not guarantee exact consistency.

## 8. Quick review checklist

Before adding any asset, confirm:

- [ ] Pure monochrome, neutral grays only; no sepia or parchment.
- [ ] White/transparent background; no frame or embedded UI text.
- [ ] Clearly **less detailed than a traditional Jules Férat engraving**.
- [ ] Sparse hatching, minimal linework, no high-frequency visual noise.
- [ ] Generous blank areas; one clear focal point.
- [ ] Matches approved images in stroke weight, shading, and visual scale.
- [ ] Fits its actual UI size without becoming muddy or overwhelming.
- [ ] Preserves established island geography and item design where applicable.
- [ ] No unrelated objects, people, or decorative flourishes.
- [ ] Reviewed alongside existing assets, not in isolation.

**When in doubt: use fewer lines, lighter shading, and more white space. Consistency beats novelty.**

## 9. Example requests

### Location: forest edge

> [MASTER PROMPT] SUBJECT: Quiet forest just behind the beach dunes. COMPOSITION: Low sandy dune in foreground, a simple dark tree line in midground, two or three distinct trunks at the edge, white open sky. Avoid drawing every leaf or blade of grass. OUTPUT TYPE: wide location illustration. BACKGROUND: white. DETAIL BUDGET: very low.

### Item: rock knife

> [MASTER PROMPT] SUBJECT: Primitive rock knife with a chipped stone blade and simple wrapped grip. COMPOSITION: isolated three-quarter view, small restrained cast shadow, crisp outline and very few hatch marks. OUTPUT TYPE: inventory item. BACKGROUND: transparent. DETAIL BUDGET: very low.

### Structure: campfire

> [MASTER PROMPT] SUBJECT: Small stone-ring campfire with three short logs and a modest flame. COMPOSITION: centered, isolated, no surrounding campsite, only essential outlines and shadows. OUTPUT TYPE: building illustration. BACKGROUND: transparent. DETAIL BUDGET: very low.

## 10. Working principle

This is an illustrated **book that happens to be interactive**, not a richly decorated game that happens to contain text. Art must be disciplined, subtle, and unmistakably part of one visual family.
