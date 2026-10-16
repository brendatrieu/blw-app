// Item 827: Settings › Account › Sign out. SignOutButton is called as a plain
// function with its hooks mocked (idiom from SettingsPage.handlers).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    calls: [] as string[],
    signOutFails: false,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useQueryClient: () => ({ clear: () => {} }) };
});
vi.mock("../lib/signout.js", () => ({
  createSignOutDeps: () => ({}),
  performSignOut: () => {
    h.calls.push("performSignOut");
    return h.signOutFails ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve();
  },
}));

import { Button } from "../components/ui/Button.js";
import { SignOutButton } from "./SettingsPage.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function render(): El {
  h.store.i = 0;
  return (SignOutButton as unknown as () => El)();
}

beforeEach(() => {
  h.store.states = [];
  h.calls = [];
  h.signOutFails = false;
});

describe("Settings › Sign out (item 827)", () => {
  it("sits in Settings › Account, under the signed-in address", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const account = source.slice(source.indexOf("function AccountSection()"));
    expect(account).toMatch(/Signed in as \{session\?\.user\.email\}<\/p>\s*<SignOutButton \/>/);
  });

  it("is a full-size (44px) secondary Button reading Sign out", () => {
    const button = render();
    expect(button.type).toBe(Button);
    expect(button.props.variant).toBe("secondary");
    expect(button.props.size).toBeUndefined(); // md: min-h-11
    expect(button.props.children).toBe("Sign out");
    expect(button.props.disabled).toBe(false);
  });

  it("clears the account through performSignOut and leaves the redirect to RequireAuth", async () => {
    (render().props.onClick as () => void)();
    const pending = render();
    expect(pending.props.children).toBe("Signing out…");
    expect(pending.props.disabled).toBe(true);
    await vi.waitFor(() => {
      expect(h.calls).toEqual(["performSignOut"]);
    });
    // Still pending: the page unmounts once the session reads signed out.
    expect(render().props.disabled).toBe(true);
  });

  it("offers the button again when the server never heard (offline)", async () => {
    h.signOutFails = true;
    (render().props.onClick as () => void)();
    await vi.waitFor(() => {
      expect(render().props.disabled).toBe(false);
    });
    expect(h.calls).toEqual(["performSignOut"]);
    expect(render().props.children).toBe("Sign out");
  });
});
