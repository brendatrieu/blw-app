import {
  usageEventEnvelopeSchema,
  type UsageContext,
  type UsageEvent,
  type UsageEventEnvelope,
  type UsageEventName,
} from "@blw/shared";
import { currentUsageContext } from "./context.js";
import { UNMATCHED_ROUTE, currentPathname, toRoutePattern } from "./routes.js";

/**
 * Turns a call site's `name` + `props` into a validated envelope, or into
 * nothing at all.
 *
 * This is the only door into the queue, and it is a one-way valve: the
 * shared schema runs here, at the moment of the mistake, rather than at
 * flush time when the stack that caused it is long gone. In development a
 * rejected event THROWS — a bad call site should fail loudly on the machine
 * of whoever wrote it. In production it returns null and the app carries on:
 * analytics is never allowed to break a screen a parent is using.
 */

/** The exact props type for one event name, straight off the shared union. */
export type UsagePropsFor<N extends UsageEventName> = Extract<UsageEvent, { name: N }>["props"];

export interface BuildEventOptions {
  id?: string;
  now?: Date;
  /**
   * The pathname the event happened on. `undefined` reads the browser;
   * `null` means "this event has no screen" and sends `route: null`.
   */
  pathname?: string | null;
  context?: UsageContext;
  /** Throw instead of returning null. Defaults to "are we in a dev build". */
  strict?: boolean;
}

/** Reasonably unique even where `crypto.randomUUID` is missing (old iOS, http origins). */
export function usageEventId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isDevBuild(): boolean {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
}

/**
 * The route an event is stamped with. Explicit `null` stays null (an event
 * with no screen); anything else resolves through the closed pattern list,
 * so a raw pathname can never reach the envelope.
 */
export function resolveEventRoute(pathname: string | null | undefined): UsageEventEnvelope["route"] {
  if (pathname === null) return null;
  const resolved = pathname ?? currentPathname();
  if (resolved === null) return null;
  return toRoutePattern(resolved);
}

/**
 * The route pattern for props that REQUIRE one (`client_error`,
 * `offline_entered`): the same resolution, with the catch-all standing in
 * where there is no browser to ask.
 */
export function requiredRoutePattern(pathname?: string | null): UsageEventEnvelope["route"] & string {
  return resolveEventRoute(pathname) ?? UNMATCHED_ROUTE;
}

export function buildEvent<N extends UsageEventName>(
  name: N,
  props: UsagePropsFor<N>,
  options: BuildEventOptions = {},
): UsageEventEnvelope | null {
  const context = options.context ?? currentUsageContext();
  const candidate = {
    id: options.id ?? usageEventId(),
    name,
    props,
    route: resolveEventRoute(options.pathname),
    // Deliberately the SAME string as `context.app_version`: the shared
    // schema cross-checks them, so there is no way to store two versions
    // that disagree.
    appVersion: context.app_version,
    occurredAt: (options.now ?? new Date()).toISOString(),
    context,
  };

  const parsed = usageEventEnvelopeSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;

  const strict = options.strict ?? isDevBuild();
  const issue = parsed.error.issues[0];
  const message = `usage: refused to build "${name}" — ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid"}`;
  if (strict) throw new Error(message);
  // Never the payload itself: the reason an event was refused can be that it
  // held something it should not, and logging it would defeat the check.
  console.error(message);
  return null;
}
