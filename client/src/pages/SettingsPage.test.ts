import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ACCOUNT_DELETE_CONFIRMATION } from "@blw/shared";
import {
  AiSection,
  BabyFields,
  DeleteAccountForm,
  PRIVACY_BROWSER_OPT_OUT,
  PRIVACY_DESCRIPTION,
  PRIVACY_SETTINGS_HINT,
  PRIVACY_SWITCH_LABEL,
  PrivacySection,
  validateAiKey,
  validateBaby,
  validateDeleteAccount,
  type BabyErrors,
  type BabyFormValues,
} from "./SettingsPage.js";

function values(overrides: Partial<BabyFormValues> = {}): BabyFormValues {
  return { name: "Priya", birthDate: "2026-03-15", notes: "", ...overrides };
}

function renderBabyFields(errors: BabyErrors) {
  return renderToString(
    createElement(BabyFields, { values: values(), onChange: () => {}, idPrefix: "new-baby", errors }),
  );
}

function renderInProviders(element: Parameters<typeof renderToString>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: ["/settings"] }, element),
    ),
  );
}

describe("validateBaby", () => {
  it("passes with a name and a birth date", () => {
    expect(validateBaby(values())).toEqual({});
  });

  it("asks for the name under the name field", () => {
    expect(validateBaby(values({ name: "" })).name).toBe("Name is required");
    expect(validateBaby(values({ name: "   " })).name).toBe("Name is required");
  });

  it("asks for the birth date under the birth-date field", () => {
    expect(validateBaby(values({ birthDate: "" })).birthDate).toBe("Birth date is required");
  });

  // The old `babyFormError` returned ONE sentence for the whole form, so a
  // parent missing both fields was told about one of them. Item 235 wants
  // both messages, each under its own control.
  it("reports both missing fields at once, and clears each as it is fixed", () => {
    expect(validateBaby(values({ name: "", birthDate: "" }))).toEqual({
      name: "Name is required",
      birthDate: "Birth date is required",
    });
    expect(validateBaby(values({ name: "Priya", birthDate: "" }))).toEqual({
      birthDate: "Birth date is required",
    });
  });

  it("does not require notes", () => {
    expect(validateBaby(values({ notes: "" }))).toEqual({});
  });
});

describe("BabyFields (render)", () => {
  it("renders each supplied error as an alert under its own field", () => {
    const html = renderBabyFields({ name: "Name is required", birthDate: "Birth date is required" });
    expect(html).toContain("Name is required");
    expect(html).toContain("Birth date is required");
    expect((html.match(/role="alert"/g) ?? []).length).toBe(2);
    // Each message sits after the control it belongs to.
    expect(html.indexOf('id="new-baby-name"')).toBeLessThan(html.indexOf("Name is required"));
    expect(html.indexOf('id="new-baby-birthdate"')).toBeLessThan(html.indexOf("Birth date is required"));
  });

  it("renders no alert markup at all with no errors — the pre-submit state", () => {
    const html = renderBabyFields({});
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("is required");
  });
});

describe("validateAiKey", () => {
  it("accepts any non-blank key — the server is what actually checks it", () => {
    expect(validateAiKey({ apiKey: "sk-ant-whatever" })).toEqual({});
    expect(validateAiKey({ apiKey: "not-a-real-prefix" })).toEqual({});
  });

  it("requires a key, treating whitespace as blank", () => {
    expect(validateAiKey({ apiKey: "" }).apiKey).toBe("API key is required");
    expect(validateAiKey({ apiKey: "   " }).apiKey).toBe("API key is required");
  });
});

describe("AiSection (render)", () => {
  it("leaves Save key enabled with no key typed, and shows no error markup before a submit attempt", () => {
    const html = renderInProviders(createElement(AiSection, null));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Save key</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Save key</);
    expect(html).not.toContain("API key is required");
  });

  it("opts out of native constraint validation", () => {
    expect(renderInProviders(createElement(AiSection, null))).toMatch(/<form[^>]*novalidate/i);
  });
});

describe("validateDeleteAccount", () => {
  const good = { phrase: ACCOUNT_DELETE_CONFIRMATION, password: "hunter2hunter2" };

  it("accepts the exact phrase plus a password", () => {
    expect(validateDeleteAccount(good)).toEqual({});
    // Surrounding whitespace is forgiven; the phrase itself is not.
    expect(validateDeleteAccount({ ...good, phrase: `  ${ACCOUNT_DELETE_CONFIRMATION}  ` })).toEqual({});
  });

  it("rejects a missing or mistyped phrase with the same sentence", () => {
    expect(validateDeleteAccount({ ...good, phrase: "" }).phrase).toBe("Type the confirmation phrase exactly");
    expect(validateDeleteAccount({ ...good, phrase: "delete my account" }).phrase).toBe(
      "Type the confirmation phrase exactly",
    );
  });

  it("requires the password", () => {
    expect(validateDeleteAccount({ ...good, password: "" }).password).toBe("Password is required");
  });

  it("reports both at once, and clears each as it is fixed", () => {
    expect(validateDeleteAccount({ phrase: "", password: "" })).toEqual({
      phrase: "Type the confirmation phrase exactly",
      password: "Password is required",
    });
    expect(validateDeleteAccount({ phrase: ACCOUNT_DELETE_CONFIRMATION, password: "" })).toEqual({
      password: "Password is required",
    });
  });
});

describe("DeleteAccountForm (render)", () => {
  // The destructive confirm follows the same rule as every other submit
  // (item 235): enabled, so a tap says what is wrong — the guard is that
  // `validateDeleteAccount` has to pass before the mutation is reached.
  it("leaves the confirm enabled on an empty form, and shows no error markup before a submit attempt", () => {
    const html = renderInProviders(createElement(DeleteAccountForm, { onCancel: () => {} }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Delete my account forever</);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""[^>]*>Delete my account forever</);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Password is required");
  });

  it("opts out of native constraint validation", () => {
    expect(renderInProviders(createElement(DeleteAccountForm, { onCancel: () => {} }))).toMatch(
      /<form[^>]*novalidate/i,
    );
  });

  // Item 257: this destructive confirm has no header chevron or sheet close
  // of its own, so it keeps a dismiss — as an icon-only × named "Don't
  // delete", not a "Cancel" text button competing with the red submit.
  it("dismisses with an icon-only × instead of a Cancel button", () => {
    const html = renderInProviders(createElement(DeleteAccountForm, { onCancel: () => {} }));
    expect(html).not.toContain(">Cancel<");
    expect(html).toContain("aria-label=\"Don&#x27;t delete\"");
    expect(html).toMatch(/aria-label="Don&#x27;t delete"[^>]*class="[^"]*h-11 w-11/);
  });
});

// ---------------------------------------------------------------------------
// Privacy (item 321)
// ---------------------------------------------------------------------------

/** React escapes text nodes; the copy pins have to compare like for like. */
function escaped(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const settingsSource = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PrivacySection — the copy", () => {
  it("says exactly what the ledger asked for, word for word", () => {
    expect(PRIVACY_SWITCH_LABEL).toBe("Share anonymous usage data");
    expect(PRIVACY_DESCRIPTION).toBe(
      "Which screens and features get used, never notes, names, or your baby's details. " +
        "Turning this off also deletes what was already collected.",
    );
    expect(PRIVACY_BROWSER_OPT_OUT).toBe("Your browser asked not to be tracked, so this is off.");
  });

  it("renders the heading, the switch and both sentences", () => {
    const html = renderInProviders(createElement(PrivacySection));
    expect(html).toContain("Privacy");
    expect(html).toContain(escaped(PRIVACY_SWITCH_LABEL));
    expect(html).toContain(escaped(PRIVACY_DESCRIPTION));
    // A real switch, named for assistive tech.
    expect(html).toContain('role="switch"');
    expect(html).toContain(`aria-label="${PRIVACY_SWITCH_LABEL}"`);
  });

  it("shows the shipped default (on) for an account that has never written a preference", () => {
    const html = renderInProviders(createElement(PrivacySection));
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain(escaped(PRIVACY_BROWSER_OPT_OUT));
  });
});

describe("PrivacySection — Do Not Track / Global Privacy Control", () => {
  it("renders OFF and disabled, with the reason, when the browser has asked not to be tracked", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    const html = renderInProviders(createElement(PrivacySection));
    // A switch reading "on" while nothing is sent would be a lie; one that
    // could be switched on would override the parent's own browser setting.
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("disabled");
    expect(html).toContain(escaped(PRIVACY_BROWSER_OPT_OUT));
  });

  it("honours Global Privacy Control the same way", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    const html = renderInProviders(createElement(PrivacySection));
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain(escaped(PRIVACY_BROWSER_OPT_OUT));
  });
});

describe("the Settings page mentions the switch", () => {
  it("carries a one-line hint pointing at Privacy (item 321)", () => {
    expect(PRIVACY_SETTINGS_HINT).toContain("Privacy");
    expect(settingsSource).toContain("{PRIVACY_SETTINGS_HINT}");
  });

  it("puts Privacy between Appearance and Account", () => {
    const order = [...settingsSource.matchAll(/<(\w+Section) \/>/g)].map((match) => match[1]);
    expect(order).toEqual(["BabiesSection", "AiSection", "AppearanceSection", "PrivacySection", "AccountSection"]);
  });
});
