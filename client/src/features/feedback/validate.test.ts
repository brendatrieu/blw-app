import { describe, expect, it } from "vitest";
import { isFormValid } from "../../lib/forms.js";
import { FEEDBACK_FIELD_IDS, FEEDBACK_FIELD_ORDER, validateFeedback } from "./validate.js";

/**
 * The rule that decides whether the API is reached at all. It matters more
 * than a one-field form usually would: the server charges the hour's budget
 * by the ATTEMPT, before it parses the body, so a blank box that got through
 * would cost a parent one of five sends and hand back a 400 for it.
 */
describe("validateFeedback", () => {
  it("asks for the message rather than naming the field", () => {
    expect(validateFeedback({ message: "" })).toEqual({ message: "Tell us a little more" });
  });

  it("reads a box of whitespace as a blank box, exactly as the server's schema does", () => {
    for (const message of [" ", "   ", "\n", "\t\n  "]) {
      expect(validateFeedback({ message }), JSON.stringify(message)).toEqual({
        message: "Tell us a little more",
      });
    }
  });

  it("accepts anything with a character in it — empty errors is the app's 'valid'", () => {
    for (const message of ["a", "  hi  ", "The storage list keeps scrolling to the top."]) {
      expect(validateFeedback({ message }), message).toEqual({});
      expect(isFormValid(validateFeedback({ message })), message).toBe(true);
    }
  });

  it("points a failed submit at the control that is actually on screen", () => {
    expect(FEEDBACK_FIELD_ORDER).toEqual(["message"]);
    expect(FEEDBACK_FIELD_IDS.message).toBe("feedback-message");
  });
});
