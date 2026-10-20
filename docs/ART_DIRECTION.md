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

1. **The designated user-approved visual master for the collection.** Use the same actual image file for every member of a set; never select a different style reference per region.
2. **Approved production assets** from that collection, especially simplified black-and-white images already checked against its master.
3. **Curated references** placed by maintainers in `assets/art/references/`, respecting the roles in the reference index.
4. This written specification.
5. Historical Jules Férat / 19th-century Verne book engravings as **historical inspiration only**, simplified substantially to match this game's visual density.

The historical references are **not** permission to imitate their full engraving density. When historical accuracy and interface readability conflict, **readability and established game consistency win**.

If the repository has no approved reference images yet, **ask for the approved reference files or explicitly flag that visual matching is provisional**. Never claim exact coherence based only on the text prompt. Once references exist, provide them to image-generation tools as image references when supported.

### A single visual master for each collection

Treat related illustrations as scenes from **one illustrated book**, with one visual master
and one shared style brief. For the beach, forest, and meadows, prefer the user's approved
simpler black-and-white beach illustration as the master. Locate and inspect its actual file;
a description of an approval in another chat is not an image reference. If that file is not
available or no master has been designated, resolve that before generating the production set.
Existing geography references are not automatically production style masters.

Record the chosen master path and checksum with the set. Attach that same master to **every**
generation/edit call where references are supported, together with the unchanged base prompt
and shared style brief. Keep available model/settings consistent and record them; identical
settings or wording alone do not establish visual consistency. Change only the subject and
necessary scenery/composition instructions between regions. Do not improvise a new technique,
stroke weight, shading treatment, contrast, detail budget, or visual scale for each image.
Delegated generation work must receive the same master and brief.

If a master must first be established, review and obtain approval for that actual candidate
before generating its companions. Do not promote a later region's different style to a new
master silently. A deliberate style revision requires reviewing the complete affected set.

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
- The beach, forest, and meadows form one coordinated area set. Final exports are **1600 × 440 px** each, with the same panoramic framing, visual scale, depth treatment, and comparable horizon/foreground allocation; do not invent a separate crop or zoom style per region. This size applies to area panoramas, not item icons or every other asset category.
- Lock fine-line engraving technique, apparent line thickness at the final display size, sparse hatching, neutral grayscale, restrained contrast, low detail density, and large untouched white areas across the entire set. Only the scenery changes: coastal cliff and dunes; quiet forest and spring; open meadows and willows. Keep subjects faithful to the game's content and discovery rules.
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

For area sets, also supply one shared block unchanged in every call:

```text
COLLECTION: [stable set name]
VISUAL MASTER: [same approved file path, supplied as an image reference]
FINAL EXPORT: 1600 x 440 px; identical panoramic framing and visual scale
STYLE LOCK: match the master's engraving technique and apparent line weight;
very sparse hatching, low detail density, restrained contrast, neutral grayscale,
large untouched white areas; consistent depth and foreground/horizon allocation
ONLY REGION SCENERY CHANGES: [subject-specific block follows]
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
- An area image that looks like a different artist, technique, tonal range, detail budget, or visual scale from its master or companion regions, even if it looks attractive by itself.

**A successful asset should look intentionally unfinished compared with a traditional densely engraved book plate.** Simplicity is the distinguishing quality.

## 7. Mandatory Codex workflow for every new image

1. **Inspect and lock the master.** Read this guide and the reference index; inspect the actual designated master. A multi-region request is one collection, not independent image tasks.
2. **Define the shared brief.** Record purpose, final dimensions, framing, visual scale, style constraints, and continuity, with separate scenery descriptions. Reuse the same master and style block for every region and delegated task.
3. **Generate as a coordinated set.** Supply the master image on every supported call. Keep the base prompt/settings stable; retain the actual tool outputs with their real filenames. New candidates remain unapproved until reviewed.
4. **Verify final files.** Inspect each actual exported file and read its real dimensions. Area panoramas must be 1600 × 440 px. A requested size or filename is not proof of the output size. Any crop/resample must preserve the agreed framing without stretching, and its final export must be reviewed again. Report unsupported export limitations instead of claiming success.
5. **Compare the whole set.** Display the actual final files side by side with the master at equal scale, both full size and intended in-game size. For area sets, review beach, forest, and meadows together. Check line weight, hatching, grayscale, contrast, detail density, white space, framing, and visual scale. Individual approval-quality images can still fail as a collection.
6. **Reject drift before delivery.** Regenerate or simplify any inconsistent member against the same master. Remove hatch groups, clutter, and tonal variation first. Replacing or editing one member requires comparing the complete set again; do not deliver a known mismatch as finished.
7. **Check in context.** Review final artwork against the mostly white game UI. Artwork should complement the text, not become the primary interface.
8. **Present truthful previews.** Follow the file/preview requirements below. Request approval for a new master/category or unresolved matching choice, with concrete inspected candidates; never silently accept inconsistency.
9. **Record and save.** Keep approved assets at descriptive stable paths, preserving original references. Store a short set record alongside the outputs: master path/checksum, shared prompt/style brief, subject variants, available model/settings, final file paths/dimensions/checksums, review result, and approval status. Do not invent unavailable tool settings or approval history. Do not mix rejected candidates into approved production assets.

If the available image-generation tool cannot accept image references or inspect outputs, **state the limitation and request human review**. Do not guarantee exact consistency.

### Actual files and truthful previews

- Only describe an image as generated when an actual generation/edit tool produced its file.
  Pending or failed generation is not a completed asset.
- Every preview must show the **actual file it claims to represent**. Candidate previews must
  show the candidate file and say it is unapproved; final previews must show the final export
  being supplied to the user. Open and inspect that file before presenting it. Identify its
  filename/path and verified dimensions, and keep derived previews traceable to that export.
- Never substitute image-search results, stock images, unrelated previous generations, or
  separate illustrative mockups as previews of delivered files. Research references, if any,
  must be labelled separately and never presented as generated output.
- A comparison view must load the final files themselves, for example in an HTML image grid;
  do not ask an image model to redraw the set as a comparison sheet. A screenshot/thumbnail
  derived from those files is a preview, not a separate production export. Label outside the
  artwork, and link each preview to its actual source file.
- If a file cannot be retrieved or visually inspected, state that explicitly. Do not claim
  that it was reviewed, matches its companions, or is ready to use.

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
- [ ] Every collection member used the same actual approved master and shared style brief.
- [ ] Complete area set compared side by side at equal scale; no stylistic outlier remains.
- [ ] Final area files verified as 1600 × 440 px with consistent framing and visual scale.
- [ ] Every preview comes from the inspected final file, with a source path and verified dimensions.
- [ ] Set record identifies the master, outputs, checksums, review result, and approval status.

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
