import { describe, expect, it } from "vitest";
import {
  CONTAINER_GONE_FLAG,
  COPY_FAILED,
  allClashesLabel,
  clashCountLine,
  clashLine,
  containerGoneBlocked,
  containerGoneCopyWarning,
  copiedLabel,
  foodDeletedCopyWarning,
  mayRunOutCopyWarning,
  pastBestByCopyWarning,
  pastUseWithinCopyWarning,
  servingsLeftHeading,
} from "./copy.js";

describe("plan wording for gone containers and deleted foods (903b)", () => {
  it("says finished and discarded apart, in the chair's words", () => {
    expect(CONTAINER_GONE_FLAG).toEqual({ finished: "Marked finished in Storage.", discarded: "Marked discarded in Storage." });
    expect(containerGoneCopyWarning("Egg muffins", "finished")).toBe("Egg muffins is marked finished in Storage. You can still copy.");
    expect(containerGoneCopyWarning("Egg muffins", "discarded")).toBe("Egg muffins was discarded. You can still copy, then swap it out.");
    expect(foodDeletedCopyWarning("My mash")).toBe("My mash was deleted. You can still copy, then swap it out.");
    expect(containerGoneBlocked("Egg muffins", "Lunch", "finished")).toBe("Egg muffins has run out, so Lunch isn't served yet.");
    expect(containerGoneBlocked("Egg muffins", "Lunch", "discarded")).toBe("Egg muffins was discarded, so Lunch isn't served yet.");
  });
});

describe("Copy to… wording (PP-COPY rounds 2-5)", () => {
  it("clashes: one in its row, the count in the footer, and the All row in days or, when a day has two, meals", () => {
    expect(clashLine("Thu 15", "Dinner")).toBe("Thu 15 already has a Dinner planned.");
    expect(clashCountLine(3)).toBe("3 of the selected meals are already planned.");
    expect(allClashesLabel([{ date: "a" }, { date: "b" }, { date: "c" }])).toBe("All 3 days");
    expect(allClashesLabel([{ date: "a" }, { date: "a" }, { date: "b" }])).toBe("All 3 meals");
  });

  it("the confirmation and the warnings box, counted right in the singular", () => {
    expect(copiedLabel(2)).toBe("Copied to 2 meals");
    expect(copiedLabel(1)).toBe("Copied to 1 meal");
    expect(copiedLabel(0)).toBe("Copied to 0 meals");
    expect(servingsLeftHeading(2, 3)).toBe("2 servings left, planned 3 times");
    expect(servingsLeftHeading(1, 1)).toBe("1 serving left, planned 1 time");
    expect(mayRunOutCopyWarning("Muffins", "Fri 16")).toBe("Muffins may run out before Fri 16. You can still copy.");
    expect(pastBestByCopyWarning("Muffins", "Fri 16")).toBe("Muffins will be past the Best by date on Fri 16. You can still copy.");
    expect(pastUseWithinCopyWarning("Broccoli, Carrot", "Thu 15")).toBe("Broccoli, Carrot may not keep until Thu 15. You can still copy.");
    expect(COPY_FAILED).toBe("Couldn't copy that — try again.");
  });
});
