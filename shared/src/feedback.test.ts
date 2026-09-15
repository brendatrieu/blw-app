import { describe, expect, it } from "vitest";
import { FEEDBACK_MESSAGE_MAX, createFeedbackInputSchema } from "./feedback.js";

describe("feedback message cap", () => {
  it("is 2000 characters, as an absolute number rather than whatever the constant says", () => {
    expect(FEEDBACK_MESSAGE_MAX).toBe(2000);
    const base = { routePattern: null, appVersion: "0.0.0-dev" };
    expect(createFeedbackInputSchema.safeParse({ ...base, message: "x".repeat(2000) }).success).toBe(true);
    expect(createFeedbackInputSchema.safeParse({ ...base, message: "x".repeat(2001) }).success).toBe(false);
    expect(createFeedbackInputSchema.safeParse({ ...base, message: "   " }).success).toBe(false);
  });
});
