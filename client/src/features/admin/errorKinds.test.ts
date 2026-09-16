import { describe, expect, it } from "vitest";
import { describeErrorKind } from "./errorKinds.js";

/**
 * The whole point of this module is that the owner can read a row without
 * knowing the codebase, so the table below is the copy itself: if a sentence
 * changes, the change is deliberate and shows up here.
 */

describe("describeErrorKind", () => {
  const cases: Array<[string, string, string, string, string]> = [
    [
      "render_crash",
      "none",
      "Screen crashed",
      "A page hit a bug and showed the error screen.",
      "A code bug: reproduce on that route and fix it.",
    ],
    [
      "unhandled",
      "none",
      "Uncaught error",
      "Code threw outside a page (a background task or timer).",
      "Same as a crash, without a route to blame.",
    ],
    [
      "api_5xx",
      "503",
      "Server error (503)",
      "The server failed to answer the request.",
      "Check the server logs on the VM around the last-seen time.",
    ],
    [
      "api_network",
      "none",
      "Request never reached the server",
      "Offline, a dropped connection, or the server was down.",
      "Only a problem when it clusters on one route.",
    ],
    [
      "chunk_load",
      "none",
      "Stale app after an update",
      "An open app asked for a file a deploy replaced; a reload fixes it.",
      "Expected after every deploy; not a bug.",
    ],
  ];

  it.each(cases)("describes %s as something a person can act on", (kind, status, label, meaning, action) => {
    expect(describeErrorKind(kind, status)).toEqual({ label, meaning, action });
  });

  it("appends a status only where it says something the label does not", () => {
    // "5xx" is the bucket the label already spells out, and "none" means the
    // kind carries no status at all — neither earns a parenthesis.
    expect(describeErrorKind("api_5xx", "500").label).toBe("Server error (500)");
    expect(describeErrorKind("api_5xx", "5xx").label).toBe("Server error");
    expect(describeErrorKind("api_5xx", "none").label).toBe("Server error");
  });

  it("never appends a status to a kind that has none", () => {
    // A render crash recorded alongside a stray status is still a crash.
    expect(describeErrorKind("render_crash", "500").label).toBe("Screen crashed");
    expect(describeErrorKind("chunk_load", "404").label).toBe("Stale app after an update");
  });

  it("humanises an unknown kind and invents nothing around it", () => {
    expect(describeErrorKind("some_new_kind", "none")).toEqual({
      label: "Some new kind",
      meaning: "",
      action: "",
    });
  });
});
