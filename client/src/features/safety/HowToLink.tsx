import { useState } from "react";
import { Sheet } from "../../components/ui/Sheet.js";
import { Markdown } from "../../lib/markdown/Markdown.js";
import { getGuide } from "./content.js";

/**
 * The small "How it works" link a form shows to its how-to guide (item 603).
 * The link text is the guide's own title ("How to log a meal"), so it names
 * where it goes. It opens the guide in a Sheet over the form rather than
 * navigating: a parent is usually stuck partway through, and leaving the page
 * would unmount the form and throw away what they typed. The full guide page
 * is `/guides/<slug>`, under More. An unknown slug renders nothing;
 * `HowToLink.test.ts` pins every slug the app passes here to a real guide.
 */
export function HowToLink({ slug, className = "" }: { slug: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const guide = getGuide(slug);
  if (!guide) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Item 699: the 44px tap target stays, but `-my-3` cancels the 12px
        // it adds above and below the 20px text line, so the link sits as
        // close to its neighbors as a line of text would.
        className={`-my-3 inline-flex min-h-11 items-center gap-1.5 self-start text-left text-sm font-medium text-[var(--color-accent)]${className ? ` ${className}` : ""}`}
      >
        <span aria-hidden="true">📖</span>
        <span className="underline">{guide.title}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={guide.title} showClose>
        <Markdown content={guide.body} />
      </Sheet>
    </>
  );
}
