# Area book collection — unapproved master candidate

Status: **awaiting user approval**. Not production artwork; no region references this image.
Milestones 1–3 are committed and pushed. Milestone 4 is not delivered.
Those earlier changes were merged in PR #8. This packet is a separate draft-PR review
checkpoint on `art/area-master-review`, based on the merged main branch.

The approved simpler beach image discussed in another chat was not available in the
repository. The local `Downloads/beach.png` and similarly named engraved beach file were
inspected: both depict the same dense geography reference, not a designated simplified master.

## Actual candidate

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
shading, and a quiet scene without labels or UI. It remains a proposed style, not an approved
master, and no forest/meadows companions have been generated.

## Export limitation and review

Two built-in calls requested 1600 × 440; neither produced those dimensions. No crop, resize,
or overwrite has been applied to the candidate. The production catalog remains empty.

The proposed in-context preview uses the original image in a **40:11 CSS slot**, with
`object-fit: cover; object-position: 50% 65%`. This trims top/bottom, including some upper cliff,
without stretching. Such screenshots are labelled temporary composition previews; they are
not final artwork exports or evidence of production integration. A normal image crop/resize
to 1600 × 440 requires the user's explicit authorization for standard export tools because
the image tool did not honor the requested canvas. The actual export must then be inspected.

Before continuing: approve or revise the candidate style and proposed framing. After approval,
record the actual final master path/checksum, attach that same master and unchanged shared
style brief to every companion generation call, and review beach/forest/meadows together at
full and in-game size. Keep final paths/dimensions/checksums and whole-set findings together.
Only then integrate the coordinated set and deliver milestone 4.

## Inspect the proposed framing

- [Full source and CSS crop comparison](beach-preview.html)
- [Captured comparison](beach-preview-comparison-1280.png), with the full-source image's
  natural aspect ratio checked in Chromium.
- Desktop: [Area](beach-preview-area-1280.png), [Crafting](beach-preview-craft-1280.png),
  [Building](beach-preview-build-1280.png)
- Phone: [Area](beach-preview-area-375.png), [Crafting](beach-preview-craft-375.png),
  [Building](beach-preview-build-375.png)
- [Browser capture record](preview-record.json): actual dimensions, source checksum, slot
  position outside tabpanels, crop styling, and preview status.

The current production build passed before capture. All six previews were captured from the
built game with temporary DOM insertion and no page errors. The candidate checksum was checked
before/after capture and did not change. Runtime content and source remain untouched.
Independent review found and corrected a stretched full-source HTML preview; the final browser
measurement is 1200 × 452.71875 for a 2041 × 770 source, preserving its proportions. Final
review approved the packet's accuracy; this is not user approval of the proposed master.
