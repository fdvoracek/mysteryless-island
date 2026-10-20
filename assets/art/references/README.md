# Approved initial visual references

The user supplied and selected these two images as initial references on 2026-10-20.
They are reference material, not production assets or screenshots of the current game.
The files are preserved byte for byte from the attachments. Do not overwrite, recolor,
crop, or otherwise edit these originals; create separate working/production files.

| Reference | Role | Interpretation |
|---|---|---|
| [UI book layout](ui-book-layout-reference.png) | Interface composition and illustration integration | Follow the quiet page structure, serif hierarchy, thin rules, whitespace, and restrained accents. The four panels show alternative views, not four required layouts. Sample text, costs, timing, and controls are illustrative. |
| [Island engraving](island-engraving-reference.png) | Island geography, scene composition, and engraving vocabulary | Preserve the cliff, beach, dunes/forest, and distant mountain relationship when depicting this scene. Simplify the dense hatching, dark areas, and fine textures for new in-game illustrations, as required by the art guide. |

For new artwork, follow [the art direction](../../../docs/ART_DIRECTION.md), including its
priority for approved production assets when those become available. Reference roles matter:
the UI composite is not a source of rasterized UI controls, and the engraving's line density
does not override the written low-detail requirement. Use [the UI style guide](../../../docs/VISUAL_STYLE.md)
for presentation changes. Inspect the actual reference images relevant to the work, rather
than relying only on this index or written prompts.

These images were provided by the user; no original artist, historical source, or license
metadata was supplied. The art direction's Jules Férat references describe inspiration, not
verified authorship of these files. Add source information here if it becomes available.

## Area collection master

These two initial references are not final 1600 × 440 px area exports. Neither has been
designated here as the simplified production master for the beach/forest/meadows collection.
The dense island engraving remains a geography/composition reference, not a substitute for
the simpler approved beach image discussed in another chat.

Before generating that collection, locate and inspect the actual approved simpler beach file,
or establish an approved master if it is unavailable. Record its stable path, checksum, and
approval in this index or the collection record, and supply it on every generation/edit call.
Use one unchanged shared style brief and compare all final region files with that master.
Do not claim a master has been selected or a production set generated until those files exist
and have been reviewed. See [the mandatory art workflow](../../../docs/ART_DIRECTION.md#7-mandatory-codex-workflow-for-every-new-image)
for actual-file previews and set acceptance.

## File integrity

Both images are PNG, 1536 × 1024 px. SHA-256 checksums identify the preserved originals:

```text
3718ce310e28e7b40f28ca7d62ec11c4fee95e0803b1361120f61d88a81576b8  ui-book-layout-reference.png
2c3501e74b5f04049bb649e861b9521c5cc1e9aa44532844baaf51e37e7a8ba5  island-engraving-reference.png
```
