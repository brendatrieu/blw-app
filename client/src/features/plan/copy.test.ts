import { describe, expect, it } from "vitest";
import { CONTAINER_GONE_FLAG, containerGoneBlocked, containerGoneCopyWarning, foodDeletedCopyWarning } from "./copy.js";

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
