import { Link } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Shared renderer for markdown content authored in `content/` (currently the
// safety library; the plan's ask-anything chat cites the same articles
// later). Styled to the app's CSS-variable theme so it tracks light/dark
// automatically: readable measure, blockquotes as amber warning/emergency
// callouts, internal `/`-prefixed links routed client-side instead of full
// page loads, and wide tables scrolling inside their own container instead
// of the page.

const components: Components = {
  h2: ({ node: _node, ...props }) => (
    <h2 className="mt-2 text-lg font-semibold text-[var(--color-text)]" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="mt-1 text-base font-semibold text-[var(--color-text)]" {...props} />
  ),
  p: ({ node: _node, ...props }) => <p className="text-[var(--color-text)]" {...props} />,
  ul: ({ node: _node, ...props }) => (
    <ul className="flex flex-col gap-1 pl-5 text-[var(--color-text)] list-disc" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="flex flex-col gap-1 pl-5 text-[var(--color-text)] list-decimal" {...props} />
  ),
  li: ({ node: _node, ...props }) => <li className="pl-1 [&>p]:inline" {...props} />,
  strong: ({ node: _node, ...props }) => (
    <strong className="font-semibold text-[var(--color-text)]" {...props} />
  ),
  hr: () => <hr className="border-[var(--color-border)]" />,
  a: ({ node: _node, href, children, ...rest }) => {
    if (href?.startsWith("/")) {
      return (
        <Link to={href} className="font-medium text-[var(--color-primary)] underline">
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-[var(--color-primary)] underline"
        {...rest}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ node: _node, children }) => (
    <div
      role="note"
      className="flex gap-2 rounded-lg border border-[var(--color-callout-border)] bg-[var(--color-callout-bg)] p-3 [&_p]:m-0 [&_p]:text-[var(--color-text)]"
    >
      <span aria-hidden="true" className="text-base leading-none text-[var(--color-callout-icon)]">
        {"⚠️"}
      </span>
      <div className="flex flex-1 flex-col gap-1 text-sm">{children}</div>
    </div>
  ),
  table: ({ node: _node, children }) => (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th
      className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 font-semibold text-[var(--color-text)]"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-b border-[var(--color-border)] px-2 py-1.5 text-[var(--color-text)]" {...props} />
  ),
};

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="flex max-w-[65ch] flex-col gap-4 text-[15px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
