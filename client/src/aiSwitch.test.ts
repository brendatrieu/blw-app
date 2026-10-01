// Item 589: the client with AI features switched off. Mocked to false here
// (rather than read from the shipped constant) so these pins keep holding
// the day the switch is flipped back on.
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { METRICS_FEATURES, SYMPTOM_DISCLAIMER, type SymptomResult } from "@blw/shared";

vi.mock("@blw/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blw/shared")>()),
  AI_FEATURES_ENABLED: false,
}));
vi.mock("./features/tour/TourProvider.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./features/tour/TourProvider.js")>()),
  useTour: () => ({ openTour: () => {} }),
}));
vi.mock("./features/admin/hooks.js", () => ({
  useIsAdmin: () => ({ isAdmin: true, isResolved: true }),
  useFeedbackSummary: () => ({ data: undefined }),
}));

import { App } from "./App.js";
import { MorePage } from "./pages/MorePage.js";
import { DeleteAccountForm, SettingsPage } from "./pages/SettingsPage.js";
import { SymptomResultView } from "./features/symptom/components/SymptomResultView.js";
import { AdoptionPanel } from "./pages/AdminMetricsPage.js";

function render(element: ReactElement): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, element),
    ),
  );
}

function collectRoutePaths(node: ReactNode, out: string[] = []): string[] {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) node.forEach((n) => collectRoutePaths(n, out));
    return out;
  }
  const el = node as ReactElement<{ path?: string; children?: ReactNode }>;
  if (typeof el.props.path === "string") out.push(el.props.path);
  collectRoutePaths(el.props.children, out);
  return out;
}

const AI_WORDING = /API key|Anthropic|\bAI\b|\bchats?\b|\/settings"/i;

function fallback(reason: "no_ai_key" | "ai_unavailable"): SymptomResult {
  return {
    kind: "fallback",
    reason,
    triageLevel: "contact_doctor_24h",
    candidates: [],
    nextSteps: ["Share this list with your pediatrician."],
    whenToSeekHelp: ["Any trouble breathing — call emergency services."],
    disclaimer: SYMPTOM_DISCLAIMER,
  };
}

describe("AI features switched off (item 589)", () => {
  it("More has no Chat row, even for an admin", () => {
    const html = render(createElement(MorePage));
    expect(html).toContain("Symptom Check");
    expect(html).not.toContain('href="/chat"');
    expect(html).not.toContain(">Chat<");
  });

  it("mounts no /chat route, so /chat and /chat/:threadId land on Not found", () => {
    const paths = collectRoutePaths((App as unknown as () => ReactNode)());
    expect(paths).toContain("/symptom-check");
    expect(paths).toContain("*");
    expect(paths.some((path) => path.startsWith("/chat"))).toBe(false);
  });

  it("Settings has no key section and never mentions keys, Anthropic, AI or chats", () => {
    const html = render(createElement(SettingsPage));
    expect(html).toContain("Delete account");
    // Item 638: the same red-outline Delete button as everywhere else, last
    // in its row after Export.
    expect(html).toMatch(/<button[^>]*class="[^"]*border-\[var\(--color-danger\)\][^"]*"[^>]*>Delete account<\/button>/);
    expect(html.indexOf("Export my data")).toBeLessThan(html.indexOf("Delete account"));
    expect(html).toContain("symptom checks");
    expect(html).not.toMatch(AI_WORDING);
    expect(html).not.toContain("anthropic-api-key");
    const deleteForm = render(createElement(DeleteAccountForm, { onCancel: () => {} }));
    expect(deleteForm.replace(/<!-- -->/g, "")).toContain("storage, and symptom checks.");
    expect(deleteForm).not.toMatch(AI_WORDING);
  });

  it("the symptom result explains the fixed rule, with no key note and no Settings link", () => {
    for (const reason of ["no_ai_key", "ai_unavailable"] as const) {
      const html = render(
        createElement(SymptomResultView, { result: fallback(reason), onReopenAlarm: () => {} }),
      );
      expect(html).toContain("fixed rule the app applies on its own");
      expect(html).not.toMatch(AI_WORDING);
    }
  });

  it("admin Metrics feature adoption has no Chat row", () => {
    const features = METRICS_FEATURES.map((feature) => ({ feature, users: 1, share: 1 }));
    const html = render(
      createElement(AdoptionPanel, {
        data: { featureAdoption: { windowDays: 28, denominator: 1, features } },
      }),
    );
    expect(html).toContain(">Symptom check<");
    expect(html).not.toContain(">Chat<");
  });

  it("a past AI result in the history still shows what the parent saw then", () => {
    const past = {
      ...fallback("no_ai_key"),
      kind: "ai",
      narrative: "Egg fits the timing best.",
    } as unknown as SymptomResult;
    expect(
      render(createElement(SymptomResultView, { result: past, onReopenAlarm: () => {} })),
    ).toContain("Egg fits the timing best.");
  });
});
