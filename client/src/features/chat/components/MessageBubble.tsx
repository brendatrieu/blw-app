import { getSafetyArticle } from "../../safety/content.js";
import { Markdown } from "../../../lib/markdown/Markdown.js";

/**
 * The BLW chat cites safety articles inline as `[slug]` (see
 * server/src/ai/prompts/blw-chat.ts). Turning a recognized slug into a real
 * markdown link before handing the text to <Markdown> reuses its existing
 * internal-link handling instead of writing a second renderer — an
 * unrecognized bracket (or a recipe reply, which never cites anything) just
 * passes through unchanged.
 */
function linkifyCitations(text: string): string {
  return text.replace(/\[([a-z0-9-]+)\]/g, (match, slug: string) => {
    const article = getSafetyArticle(slug);
    return article ? `[${article.title}](/safety/${slug})` : match;
  });
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}

export function MessageBubble({ role, text, pending }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
            : "border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
        } ${pending ? "opacity-70" : ""}`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : text ? (
          <div className="[&>div]:max-w-none [&>div]:gap-2 [&>div]:text-[15px]">
            <Markdown content={linkifyCitations(text)} />
          </div>
        ) : (
          <span className="inline-flex gap-1 py-1" aria-label="Thinking">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)] [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)] [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)] [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
