import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandidateList } from "./CandidateCard.js";

describe("CandidateList (owner, 2026-09-30)", () => {
  it("says plainly when nothing new or allergenic was eaten, rather than listing everyday foods", () => {
    const html = renderToString(createElement(CandidateList, { candidates: [] }));
    expect(html).toContain("Nothing new or allergenic was logged in the seven days before this.");
    expect(html).toContain("Foods your baby eats often are unlikely");
  });
});
