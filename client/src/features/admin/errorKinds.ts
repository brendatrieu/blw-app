import { humanizeKey } from "../../components/charts/helpers.js";

/**
 * What a `client_error` kind means, in words the owner can act on.
 *
 * The Errors panel is the one panel on the dashboard that was unreadable by
 * design. `lib/usage/errors.ts` records a route, a kind and a status and
 * **never** a message or a stack — an exception thrown inside a form can
 * carry a child's name, so the privacy rule is not negotiable. The cost is
 * that a row reads "/storage · Api 5xx", which tells the reader nothing about
 * what happened or what to do next. This module pays that cost back without
 * storing a single extra byte: the kinds are a closed set, so their meanings
 * can live in the client as copy.
 *
 * `action` is deliberately blunt about the kinds that are NOT bugs. A stale
 * chunk after a deploy is expected; treating it like a crash sends the owner
 * hunting for a fault that is not there.
 */

export interface ErrorKindDescription {
  /** The row's plain-language name, e.g. "Server error (503)". */
  label: string;
  /** One sentence: what actually happened. Empty for a kind this module does not know. */
  meaning: string;
  /** One sentence: what to do about it, including "nothing". Empty for an unknown kind. */
  action: string;
}

const KINDS: Record<string, ErrorKindDescription> = {
  render_crash: {
    label: "Screen crashed",
    meaning: "A page hit a bug and showed the error screen.",
    action: "A code bug: reproduce on that route and fix it.",
  },
  unhandled: {
    label: "Uncaught error",
    meaning: "Code threw outside a page (a background task or timer).",
    action: "Same as a crash, without a route to blame.",
  },
  api_5xx: {
    label: "Server error",
    meaning: "The server failed to answer the request.",
    action: "Check the server logs on the VM around the last-seen time.",
  },
  api_network: {
    label: "Request never reached the server",
    meaning: "Offline, a dropped connection, or the server was down.",
    action: "Only a problem when it clusters on one route.",
  },
  chunk_load: {
    label: "Stale app after an update",
    meaning: "An open app asked for a file a deploy replaced; a reload fixes it.",
    action: "Expected after every deploy; not a bug.",
  },
};

/**
 * A kind (and the status recorded with it) as something a person can read.
 *
 * The status is appended to the label only where it adds something: a bare
 * `"none"` means the kind carries no status at all, and `"5xx"` is the bucket
 * the label already says in words. A 503 is worth printing — it is the
 * difference between "the app is down" and "one endpoint is broken".
 *
 * An unrecognised kind falls back to `humanizeKey` with nothing invented
 * around it: a made-up meaning for a kind nobody has written down yet would
 * be worse than no sentence.
 */
export function describeErrorKind(kind: string, status: string): ErrorKindDescription {
  const known = KINDS[kind];
  if (!known) return { label: humanizeKey(kind), meaning: "", action: "" };
  return { ...known, label: `${known.label}${statusSuffix(kind, status)}` };
}

function statusSuffix(kind: string, status: string): string {
  if (kind !== "api_5xx") return "";
  if (status === "none" || status === "5xx" || status === "") return "";
  return ` (${status})`;
}
