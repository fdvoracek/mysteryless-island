import { expect, it } from "vitest";
import { defaultCreateKind } from "../../src/studio/documents";

it.each([
  ["items", undefined, "items"], ["activities", undefined, "activities"], ["regions", undefined, "regions"],
  ["area:forest", { kind: "regions" }, "activities"], ["all", { kind: "quests" }, "quests"],
  ["all", { kind: "settings" }, "items"], ["all", undefined, "items"],
  ["story", { kind: "events" }, "items"], ["map", undefined, "items"], ["trees", undefined, "items"],
])("defaults scope %s to %s", (scope, selected, expected) => expect(defaultCreateKind(scope, selected)).toBe(expected));
