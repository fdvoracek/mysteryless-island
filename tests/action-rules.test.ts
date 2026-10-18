import { describe, expect, it } from "vitest";
import { itemActionCost } from "../src/core/action-rules";
import type { ItemAction } from "../src/content/schema";
import { loadRegistry, startGame } from "./helpers";

describe("shared action rules", () => {
  it("checks and spends uses plus an explicit cost of the same item", () => {
    const reg = loadRegistry();
    const action: ItemAction = { id: "bundle", label: "bundle", hours: 0.25, effort: "light", uses: 1, cost: { firewood: 2 }, effects: [{ give: { timber: 1 } }] };
    reg.items.get("firewood")!.actions = [action];
    const e = startGame(reg, 1);
    e.state.items.firewood = 2;
    expect(itemActionCost("firewood", action)).toEqual({ firewood: 3 });
    expect(e.checkItemAction("firewood", action).enabled).toBe(false);
    expect(e.dispatch({ type: "itemAction", item: "firewood", action: "bundle" }).ok).toBe(false);
    expect(e.state.items.firewood).toBe(2);
    e.state.items.firewood = 3;
    expect(e.dispatch({ type: "itemAction", item: "firewood", action: "bundle" }).ok).toBe(true);
    expect(e.state.items.firewood).toBe(0);
    expect(e.state.items.timber).toBe(1);
  });

  it("uses the same step-aligned duration for a fractional tool factor and the clock", () => {
    const reg = loadRegistry();
    reg.items.get("knife")!.tool!.hoursFactor = 1.5;
    const action: ItemAction = { id: "trim", label: "trim", hours: 0.25, effort: "light", requires: { tool: "sharp" }, effects: [{ give: { timber: 1 } }] };
    reg.items.get("firewood")!.actions = [action];
    const e = startGame(reg, 1);
    e.state.items.firewood = 1;
    const start = e.state.time;
    expect(e.hoursFor(action.hours, [action.requires])).toBe(0.5);
    e.dispatch({ type: "itemAction", item: "firewood", action: "trim" });
    expect(e.state.time - start).toBe(30);
  });
});
