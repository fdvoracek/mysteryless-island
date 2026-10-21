# Area book collection — unapproved master candidate

Status: **revised after user rejected the first preview; awaiting review**. No region references either candidate.
Milestones 1–3 are committed and pushed. Milestone 4 is not delivered.
Those earlier changes were merged in PR #8. This packet is a separate draft-PR review
checkpoint on `art/area-master-review`, based on the merged main branch.

The approved simpler beach image discussed in another chat was not available in the
repository. The local `Downloads/beach.png` and similarly named engraved beach file were
inspected: both depict the same dense geography reference, not a designated simplified master.

## Current revised candidate

- File: [beach-master-candidate-v2.png](beach-master-candidate-v2.png)
- Verified dimensions: **2116 × 743 px**, PNG. This is not a 1600 × 440 export.
- SHA-256: `64353ba51fdededeb848177d0080c60e8958a3e4f1e8fdacf91e403a24b28336`
- Tool: built-in image generation; model and internal settings were not exposed.
- Original tool output: `exec-be767c19-70fe-4dca-bcb0-d77f995dbd74.png` in generated-images collection `01a153fe-393f-7800-81aa-0fcf182be204`.
- The panoramic UI reference supplied composition and engraving treatment; the island engraving supplied geography. Neither reference's parchment/tint, interface, or dense all-over hatching was requested.

The first preview failed visual review: its almost uniform outlines and weak tonal depth did not resemble the supplied engraved book-page design. This revised file uses selectively hatched cliff and rock planes, darker foreground anchors, and a lighter mountain/sky. It remains a **candidate**, not an approved master or production asset. Its generated dimensions still require a verified final export before any game integration.

## Rejected earlier candidate and preview history

- File: [beach-master-candidate.png](beach-master-candidate.png)
- Verified dimensions: **2041 × 770 px**, PNG. This is not a 1600 × 440 export.
- SHA-256: `b7dd121582e5c4c86de57c8c6c49db00ac97a7380e3fda50c57eb3f51f404a2a`
- Tool: built-in image generation. Model and other internal settings were not exposed.
- Original tool output: `exec-66529cb6-b423-482e-bf54-598bbee8a97b.png`
  under generated-images collection `01a153fe-393f-7800-81aa-0fcf182be204`.
- Prompts: [prompts.md](prompts.md), including the exact initial brief and refinement.
- Input geography reference: [island engraving](../../references/island-engraving-reference.png),
  SHA-256 `2c3501e74b5f04049bb649e861b9521c5cc1e9aa44532844baaf51e37e7a8ba5`.
  This reference supplied geography, not the production line-density target.

The first output (2043 × 770) still had excessive hatch clusters, especially in water and
trees. The second call simplified those areas while preserving the geography. The actual
second file was inspected: neutral monochrome, much more white space, fine contours, sparse
shading, and a quiet scene without labels or UI. Review then found the result visually too flat. It is retained only as rejected history; no forest/meadows companions have been generated.

## Export limitation and review

Three built-in calls requested 1600 × 440 or its 40:11 ratio; none produced those dimensions. No crop, resize, or overwrite has been applied to either candidate. The production catalog remains empty.

The earlier in-context preview used the rejected image in a **40:11 CSS slot**. Its six screenshots remain as a record of the rejected presentation and must not be read as previews of the revised candidate or completed runtime integration. The revised HTML comparison below loads the revised source itself. Any future screenshot and final export must identify its actual source and dimensions.

Before production integration: approve or revise the candidate style and proposed framing. After approval,
record the actual final master path/checksum, attach that same master and unchanged shared
style brief to every companion generation call, and review beach/forest/meadows together at
full and in-game size. Keep final paths/dimensions/checksums and whole-set findings together.
Only then integrate the coordinated set and deliver milestone 4.

## Inspect the revised framing and actual UI

- [Revised full source and CSS crop comparison](beach-preview.html)
- Revised desktop: [Area](revised-area-light-1280.png), [Crafting](revised-craft-light-1280.png),
  [Building](revised-build-light-1280.png)
- Revised phone: [Area](revised-area-light-375.png), [Crafting](revised-craft-light-375.png),
  [Building](revised-build-light-375.png)
- [Earlier rejected comparison](beach-preview-comparison-1280.png), which shows the old candidate only.
- [Browser capture record](preview-record.json): revised source dimensions/checksum, CSS crop,
  six current-UI captures, and preview-only status.

The six revised screenshots were captured from the running game on 2026-10-21 after the page-style CSS update, using temporary DOM insertion of the same revised source on all three tabs. The original rejected screenshots remain in the packet as history. Runtime content has no approved panorama.
