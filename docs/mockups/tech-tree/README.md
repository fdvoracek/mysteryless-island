# Crafting tree visual drafts

Five AI-generated layout studies, created with the built-in image generation tool. These are proposals for review; the running game is not changed.

Each draft keeps item details in one sample hover tooltip. Additional recipes, categories, and future connections illustrate scale; they are not an approved content configuration. The exact existing dependency graph remains in `content/trees/crafting.json`.

| Draft | Layout | Design consideration |
|---|---|---|
| [1. Compact branches](01-compact-branches.png) | Familiar vertical tree with category columns and slim name chips. | Closest to the existing game; long trees need vertical scrolling. |
| [2. Horizontal lanes](02-horizontal-lanes.png) | Categories form rows; technology progresses from left to right. | My preferred starting point for clear branches and many future tiers. |
| [3. Zoomable node map](03-zoomable-node-map.png) | Small icon nodes form clusters on a pannable canvas. | More of a game feel; needs good zoom, search and automatic layout. |
| [4. Branch explorer](04-branch-explorer.png) | Collapsible outline with category navigation and compact rows. | Most space-efficient; a useful direction for narrow screens. |
| [5. Tier matrix](05-tier-matrix.png) | Dense category/depth grid, tracing dependencies on hover. | Strong overview without permanent connector clutter; shown in dark mode. |

My initial preference is **2, horizontal lanes**, for a larger tree with readable categories. **3, zoomable node map**, is a more visual alternative; **4, branch explorer**, is the most compact.

The light/dark palette is independent of layout. A selected direction would still need desktop and phone interaction design, including tap/focus access to tooltip details.

Full generation prompts: [prompts.md](prompts.md).


## Requested vertical revision

[6. Vertical compact tree](06-vertical-compact-tree.png) adapts the horizontal-lanes visual style to a vertically scrolling centre panel. Branch-level category headings are removed; the item type appears as a tag inside the hover tooltip. Item nodes retain only their name, state mark and optional crafting progress.

[Generation prompts for this revision](06-vertical-compact-tree-prompt.md).
