import { Component, type ReactNode } from "react";
import { Button } from "./ui/Button.js";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level crash guard with a recover link, per the polish pass (ledger
 * item 6). Not wired into the tree by this agent — main.tsx is outside its
 * ownership. To activate: wrap the router in main.tsx —
 *
 *   <ErrorBoundary><App /></ErrorBoundary>
 *
 * Renders whatever `children` were mounted with until a render throws, then
 * swaps to a friendly full-screen fallback instead of a blank white app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-3 p-6 text-center"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <p className="text-5xl leading-none" aria-hidden="true">
            🙈
          </p>
          <h1 className="font-h1 text-[var(--color-text)]">Something went wrong</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            This screen hit a snag. Your data is safe — reloading usually fixes it.
          </p>
          <Button
            onClick={() => {
              window.location.assign("/");
            }}
          >
            Back to safety
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
