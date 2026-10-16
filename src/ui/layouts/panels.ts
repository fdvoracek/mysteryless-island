/**
 * The panels every layout places somewhere. The ids are fixed: the renderer, the tests and the
 * styles in ../styles.css rely on them. A layout only decides where each panel goes.
 */
export const panel = {
  /** the story */
  story: () => `<section class="log" id="log" aria-live="polite" aria-label="story"></section>`,
  /** optional: a second story area for older text (used with story.older = "inline") */
  storyOlder: () => `<div class="log-older" id="logOlder" aria-label="earlier"></div>`,
  /** places you can walk to (region tabs) */
  places: () => `<nav class="tabs" id="tabs" aria-label="places"></nav>`,
  /** buttons for the current place */
  actions: () => `<div class="buttons" id="actions"></div>`,
  /** time of day and survival bars */
  status: () => `<fieldset class="box status-box"><legend id="clock"></legend><div id="status"></div></fieldset>`,
  tasks: () => `<fieldset class="box" id="questsBox"><legend>tasks</legend><div id="quests"></div></fieldset>`,
  /** buildings in this place: what stands here (its state, sow/harvest…) and what you can build */
  buildings: () => `<fieldset class="box" id="buildingsBox"><legend>buildings</legend><div id="buildings"></div></fieldset>`,
  stores: () => `<fieldset class="box" id="storesBox"><legend>stores</legend><div id="stores"></div></fieldset>`,
  inventory: () => `<fieldset class="box" id="inventoryBox"><legend>inventory</legend><div id="inventory"></div></fieldset>`,
};

/** ids that must exist in every layout skeleton (logOlder is optional) */
export const REQUIRED_IDS = [
  "wrap", "log", "tabs", "actions", "clock", "status",
  "quests", "questsBox", "buildings", "buildingsBox", "stores", "storesBox", "inventory", "inventoryBox",
] as const;
