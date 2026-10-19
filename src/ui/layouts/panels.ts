/**
 * The classic layout panels. The ids are fixed: the renderer, the tests and the
 * styles in ../styles.css rely on them.
 */
export const panel = {
  /** the story */
  story: () => `<section class="log" id="log" aria-live="polite" aria-label="story"></section>`,
  /** places you can walk to (region tabs) */
  places: () => `<nav class="tabs" id="tabs" aria-label="places"></nav>`,
  /** All controls in their display order. */
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

/** ids that must exist in the classic skeleton */
export const REQUIRED_IDS = [
  "wrap", "log", "tabs", "actions", "clock", "status", "workBox", "work",
  "consumablesBox", "consumables",
  "quests", "questsBox", "buildings", "buildingsBox", "inventory", "inventoryBox",
] as const;
