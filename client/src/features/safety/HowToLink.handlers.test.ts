// Tapping the how-to link must open the guide OVER the form, not navigate
// away and unmount it (the verifier lost typed text on all three forms and
// the Serve sheet's note). React's useState is swapped for a tiny store so
// the component can be called as a plain function; idiom from
// Sheet.handlers.test.ts.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      return [store.states[i], (v: unknown) => (store.states[i] = v)];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

import { Sheet } from "../../components/ui/Sheet.js";
import { Markdown } from "../../lib/markdown/Markdown.js";
import { getGuide } from "./content.js";
import { HowToLink } from "./HowToLink.js";

interface El {
  type: unknown;
  props: { children?: unknown; onClick?: () => void; onClose?: () => void; [k: string]: unknown };
}

const render = () => {
  h.store.i = 0;
  return HowToLink({ slug: "how-to-serve-from-storage" }) as unknown as El;
};
const kids = (el: El) => el.props.children as El[];

describe("HowToLink opens its guide in a sheet over the form", () => {
  it("starts closed, opens on tap with the guide body, and closes again", () => {
    const guide = getGuide("how-to-serve-from-storage")!;
    let [button, sheet] = kids(render());
    expect(button!.type).toBe("button");
    expect(button!.props.type).toBe("button"); // never submits the surrounding form
    expect(sheet!.type).toBe(Sheet);
    expect(sheet!.props.open).toBe(false);

    button!.props.onClick!();
    [button, sheet] = kids(render());
    expect(sheet!.props.open).toBe(true);
    expect(sheet!.props.title).toBe(guide.title);
    const body = sheet!.props.children as El;
    expect(body.type).toBe(Markdown);
    expect(body.props.content).toBe(guide.body);

    sheet!.props.onClose!();
    [, sheet] = kids(render());
    expect(sheet!.props.open).toBe(false);
  });
});
