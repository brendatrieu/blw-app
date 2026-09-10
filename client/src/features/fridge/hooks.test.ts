import { describe, expect, it } from "vitest";
import { fridgeStatusChangeLabel } from "./hooks.js";

describe("fridgeStatusChangeLabel (item 147)", () => {
  it("labels a finish as 'Marked finished: <title>'", () => {
    expect(fridgeStatusChangeLabel({ id: "1", title: "Avocado", from: "active", to: "finished" })).toBe(
      "Marked finished: Avocado",
    );
  });

  it("labels a discard as 'Marked discarded: <title>'", () => {
    expect(fridgeStatusChangeLabel({ id: "1", title: "Avocado", from: "active", to: "discarded" })).toBe(
      "Marked discarded: Avocado",
    );
  });

});
