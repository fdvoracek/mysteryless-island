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
  /** All controls, in the same order in every layout. */
  actions: () => `<div class="action-sections">
    <div class="action-section" id="areaActions"><div class="buttons" id="actions"></div></div>
    <div class="action-section" id="workBox" hidden><div id="work"></div></div>
    <fieldset class="box action-section" id="buildingsBox" hidden><legend>buildings</legend>
      <div id="buildings"></div>
    </fieldset>
    <fieldset class="box action-section" id="consumablesBox" hidden><legend>consumables</legend>
      <div id="consumables"></div>
    </fieldset>
  </div>`,
  /** time of day and survival bars */
  status: () => `<fieldset class="box status-box"><legend id="clock"></legend><div id="status"></div></fieldset>`,
  tasks: () => `<fieldset class="box" id="questsBox"><legend>tasks</legend><div id="quests"></div></fieldset>`,
  inventory: () => `<fieldset class="box" id="inventoryBox"><legend>inventory</legend><div id="inventory"></div></fieldset>`,
};

/** ids that must exist in every layout skeleton (logOlder is optional) */
export const REQUIRED_IDS = [
  "wrap", "log", "tabs", "actions", "clock", "status", "workBox", "work",
  "consumablesBox", "consumables",
  "quests", "questsBox", "buildings", "buildingsBox", "inventory", "inventoryBox",
] as const;
