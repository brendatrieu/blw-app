// The admin's in-panel password confirm (ledger 830): its markup, its
// handlers (useState is a tiny store, harness idiom from
// AccessPanel.handlers.test.ts), and the rule that no mutation, and so no
// password, is ever written to IndexedDB.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    session: { data: { user: { email: "owner@example.test" } } } as { data: { user: { email: string } } | null },
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      const set = (value: unknown) => {
        store.states[i] = value;
      };
      return [store.states[i], set];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

vi.mock("../../lib/auth.js", () => ({ useSession: () => h.session }));

import { PASSWORD_PROMPT_DESCRIPTION, PasswordPrompt, passwordPromptError } from "./PasswordPrompt.js";

interface Rendered {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}

function collect(node: unknown, match: (element: Rendered) => boolean, out: Rendered[] = []): Rendered[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, match, out);
    return out;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return out;
  const element = node as Rendered;
  if (match(element)) out.push(element);
  collect(element.props.children, match, out);
  return out;
}

let confirmed: string[];
let pending: boolean;

function prompt(error: string | null = null): Rendered {
  h.store.i = 0;
  const render = PasswordPrompt as unknown as (props: Record<string, unknown>) => Rendered;
  return render({ id: "pw", pending, error, onConfirm: (value: string) => confirmed.push(value) });
}

function type(value: string) {
  const [input] = collect(prompt(), (element) => element.props.id === "pw");
  (input!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

function submit() {
  (prompt().props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
}

function fieldError(tree: Rendered): unknown {
  return collect(tree, (element) => element.props.htmlFor === "pw")[0]?.props.error;
}

beforeEach(() => {
  h.session = { data: { user: { email: "owner@example.test" } } };
  h.store.states = [];
  confirmed = [];
  pending = false;
});

describe("PasswordPrompt", () => {
  it("is a password field the browser can fill, with one line of why and a Confirm", () => {
    const html = renderToString(
      createElement(PasswordPrompt, { id: "pw", pending: false, error: null, onConfirm: () => {} }),
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Your password");
    expect(html).toContain(PASSWORD_PROMPT_DESCRIPTION);
    expect(html).toContain(">Confirm<");
    // renderToString drops autoFocus, so the element itself is checked.
    const [input] = collect(prompt(), (element) => element.props.id === "pw");
    expect(input!.props.autoFocus).toBe(true);
  });

  it("sends the password once and empties the field straight away", () => {
    type("owner-password");
    submit();
    expect(confirmed).toEqual(["owner-password"]);
    const [input] = collect(prompt(), (element) => element.props.id === "pw");
    expect(input!.props.value).toBe("");
  });

  it("asks for a password instead of sending an empty one, and ignores a second tap while sending", () => {
    submit();
    expect(confirmed).toEqual([]);
    expect(fieldError(prompt())).toBe("Password is required");

    pending = true;
    type("owner-password");
    submit();
    expect(confirmed).toEqual([]);
  });

  it("tells a password manager whose password it is: the signed-in admin's own email (840)", () => {
    const [username] = collect(prompt(), (element) => element.props.autoComplete === "username");
    expect(username!.props).toMatchObject({ type: "text", value: "owner@example.test", readOnly: true, hidden: true });
    // Not a second thing to fill in: the form still sends the password only.
    type("owner-password");
    submit();
    expect(confirmed).toEqual(["owner-password"]);

    h.session = { data: null };
    expect(collect(prompt(), (element) => element.props.autoComplete === "username")).toHaveLength(0);
  });

  it("shows the server's reason in the field", () => {
    expect(fieldError(prompt("That password is not right."))).toBe("That password is not right.");
  });
});

describe("passwordPromptError", () => {
  it("keeps the fixable refusals in the prompt and hands back everything else", () => {
    expect(passwordPromptError("invalid_password")).toBe("That password is not right.");
    expect(passwordPromptError("rate_limited")).toBe("Too many attempts. Wait a few minutes and try again.");
    expect(passwordPromptError("unknown_user")).toBeNull();
    expect(passwordPromptError("owner_only")).toBeNull();
  });
});

describe("offline persistence", () => {
  it("never writes a mutation (and the password in its variables) to IndexedDB", () => {
    const main = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/shouldDehydrateMutation: \(\) => false/);
  });
});
