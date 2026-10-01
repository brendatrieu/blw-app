import { describe, expect, it } from "vitest";
import { greetingForHour, timeOfDayGreeting } from "./greeting.js";

describe("greetingForHour", () => {
  it("is Good morning from midnight up to (not including) noon", () => {
    expect(greetingForHour(0)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
  });

  it("is Good afternoon from noon up to (not including) 6pm", () => {
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good afternoon");
  });

  it("is Good evening from 6pm through the rest of the day", () => {
    expect(greetingForHour(18)).toBe("Good evening");
    expect(greetingForHour(23)).toBe("Good evening");
  });
});

describe("timeOfDayGreeting", () => {
  it("reads the hour off the given Date", () => {
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 9))).toBe("Good morning");
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 20))).toBe("Good evening");
  });
});
