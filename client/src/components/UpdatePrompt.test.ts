import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyUpdate,
  dismissUpdate,
  fetchServerVersion,
  isUpdatePromptRoute,
  resetUpdateStateForTests,
  setUpdateReady,
  UPDATE_DISMISSED_KEY,
} from "../pwa/update.js";
import { UpdateCard, UpdateRow } from "./UpdatePrompt.js";

// The modal-open flag comes from useModal's module store; the card's only
// question is "is one open", so it is mocked as a plain switch.
const modal = vi.hoisted(() => ({ open: false }));
vi.mock("./ui/useModal.js", () => ({ useAnyModalOpen: () => modal.open }));

let stored: Record<string, string>;
beforeEach(() => {
  stored = {};
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    },
  });
});
afterEach(() => {
  modal.open = false;
  resetUpdateStateForTests();
  vi.unstubAllGlobals();
});

const card = (path = "/") => renderToString(createElement(MemoryRouter, { initialEntries: [path] }, createElement(UpdateCard)));
const row = () => renderToString(createElement(UpdateRow));
const noop = () => Promise.resolve();

describe("update card (ledger 790)", () => {
  it("nothing waiting: an empty live region", () => {
    expect(card()).toMatch(/^<div role="status" class="absolute inset-x-3"[^>]*><\/div>$/);
    expect(row()).toBe("");
  });

  it("a version waiting: the approved line, Later and Reload, absolute in the header (never fixed)", () => {
    setUpdateReady("abc", noop);
    const out = card();
    expect(out).toContain(">A new version is ready.</p>");
    expect(out).toMatch(/>Later<\/button>.*>Reload<\/button>/);
    expect(out).not.toMatch(/class="[^"]*\bfixed\b/);
    // Not dismissed yet: the More row waits for Later.
    expect(row()).toBe("");
  });

  it("shows on Home and list pages only, never on a form or detail page", () => {
    setUpdateReady("abc", noop);
    for (const path of ["/", "/storage", "/foods", "/recipes", "/meals", "/favorites", "/safety", "/guides", "/more"]) {
      expect(card(path), path).toContain("A new version is ready.");
    }
    for (const path of [
      "/log-meal",
      "/storage/add",
      "/storage/s1/edit",
      "/storage/s1",
      "/foods/new",
      "/foods/peas/edit",
      "/recipes/new",
      "/recipes/r1/edit",
      "/symptom-check",
      "/settings",
      "/meals/m1",
    ]) {
      expect(card(path), path).not.toContain("A new version is ready.");
      expect(isUpdatePromptRoute(path), path).toBe(false);
    }
  });

  it("waits while a sheet or dialog is open (the Serve sheet on the Storage list)", () => {
    setUpdateReady("abc", noop);
    modal.open = true;
    expect(card("/storage")).not.toContain("A new version is ready.");
    modal.open = false;
    expect(card("/storage")).toContain("A new version is ready.");
  });

  it("Later hides the card for that version, stores it, and leaves the More row", () => {
    setUpdateReady("abc", noop);
    dismissUpdate();
    expect(stored[UPDATE_DISMISSED_KEY]).toBe("abc");
    expect(card()).not.toContain("A new version is ready.");
    const out = row();
    expect(out).toContain(">Update available</span>");
    expect(out).toContain(">Reload</button>");
  });

  it("once per version: the same version waiting after a relaunch stays quiet; a newer one pops up", () => {
    stored[UPDATE_DISMISSED_KEY] = "abc";
    setUpdateReady("abc", noop);
    expect(card()).not.toContain("A new version is ready.");
    expect(row()).toContain("Update available");
    setUpdateReady("def", noop);
    expect(card()).toContain("A new version is ready.");
    expect(row()).toBe("");
  });

  it("server version unknown (offline): an earlier Later counts; with none, the card shows", () => {
    setUpdateReady(null, noop);
    expect(card()).toContain("A new version is ready.");
    dismissUpdate();
    expect(stored[UPDATE_DISMISSED_KEY]).toBe("unknown");
    stored[UPDATE_DISMISSED_KEY] = "abc";
    setUpdateReady(null, noop);
    expect(card()).not.toContain("A new version is ready.");
  });

  it("Reload applies the waiting version; nothing reloads without the tap", () => {
    const apply = vi.fn(noop);
    setUpdateReady("abc", apply);
    expect(apply).not.toHaveBeenCalled();
    applyUpdate();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("blocked storage: the card still shows and Later still hides it", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    });
    setUpdateReady("abc", noop);
    expect(card()).toContain("A new version is ready.");
    dismissUpdate();
    expect(card()).not.toContain("A new version is ready.");
  });
});

describe("fetchServerVersion", () => {
  const respond = (body: unknown, ok = true) => () => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
  it("reads the build, or null when it cannot", async () => {
    expect(await fetchServerVersion(respond({ version: "abc" }))).toBe("abc");
    expect(await fetchServerVersion(respond({ version: null }))).toBeNull();
    expect(await fetchServerVersion(respond({ version: "abc" }, false))).toBeNull();
    expect(await fetchServerVersion(() => Promise.reject(new Error("offline")))).toBeNull();
  });
});
