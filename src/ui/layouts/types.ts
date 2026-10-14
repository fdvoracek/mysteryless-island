/**
 * A layout decides WHERE the panels go and HOW the story reads. It contains no game logic:
 * the renderer (../render.ts) fills the same panels in every layout.
 *
 * To add a layout: copy one of the files in this folder (e.g. scene.ts + scene.css),
 * change the skeleton, story style and CSS, and add it to the list in index.ts.
 * To remove one: delete its two files and its line in index.ts.
 */

export interface StoryStyle {
  /** where the newest text goes: on top (classic log) or at the bottom (reads like a book) */
  order: "newest-first" | "oldest-first";
  /** one block per log line, or one paragraph per action */
  unit: "line" | "turn";
  /**
   * how older text looks:
   * - "fade": fades out step by step (classic)
   * - "muted": stays readable, in a quieter colour and size
   * - "inline": shrinks into one quiet line (goes into the #logOlder panel if the layout has one)
   */
  older: "fade" | "muted" | "inline";
  /** the newest block is set larger */
  latestLarge: boolean;
  /** prefix each paragraph with its time of day, and add a heading when the day changes */
  timestamps: boolean;
  /** how many blocks to keep on screen */
  limit: number;
}

export interface Layout {
  /** used in the URL (?layout=journal), in storage and as the CSS scope class "layout-<id>" */
  id: string;
  /** shown in the layout menu */
  name: string;
  /**
   * HTML for the game area. Build it from the panels in panels.ts; every required panel
   * must appear exactly once. The outer element must be <div class="wrap" id="wrap">.
   */
  skeleton: () => string;
  story: StoryStyle;
  /** optional external stylesheets (e.g. web fonts), loaded the first time the layout is used */
  stylesheets?: string[];
}
