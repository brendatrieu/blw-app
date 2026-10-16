import { BlockList, isIPv6 } from "node:net";
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config.js";

/**
 * The private ranges Docker hands its networks (RFC 1918, plus IPv6 unique
 * local). Loopback is deliberately not here: it is a direct client in dev and
 * in tests, never the proxy.
 */
const PRIVATE_NETWORKS = new BlockList();
PRIVATE_NETWORKS.addSubnet("10.0.0.0", 8);
PRIVATE_NETWORKS.addSubnet("172.16.0.0", 12);
PRIVATE_NETWORKS.addSubnet("192.168.0.0", 16);
PRIVATE_NETWORKS.addSubnet("fc00::", 7, "ipv6");

/**
 * Fastify's `trustProxy` (ledger 839): which hops of X-Forwarded-For to
 * believe. Production is Caddy -> app on the compose network, and the app
 * publishes no port, so the only peer that can reach it from a private
 * address is Caddy. Exactly that one hop is trusted:
 *
 * - hop 0 is the socket peer. It is trusted only when it is on a private
 *   network, so a client that reaches the app directly (dev, tests, a
 *   loopback healthcheck) is keyed by its own address whatever
 *   X-Forwarded-For it sends.
 * - hop 1, the right-most X-Forwarded-For entry, is the address Caddy itself
 *   wrote. Nothing further left is ever believed, so even a proxy that
 *   appended to a client-supplied header (Caddy 2 does not: it drops
 *   X-Forwarded-For from untrusted clients) would not let a client choose
 *   its key.
 *
 * Fastify 5.12 turns a bare hop count into "trust nothing", hence a function.
 */
export function trustCaddyHop(address: string, hop: number): boolean {
  return hop === 0 && typeof address === "string" && PRIVATE_NETWORKS.check(address, isIPv6(address) ? "ipv6" : "ipv4");
}

/**
 * The rate-limit key for a client address. An IPv6 client owns at least a
 * /64 and can pick any address in it, so IPv6 is keyed by its /64 (as
 * better-auth's own limiter does); IPv4, and IPv4 mapped into IPv6, is keyed
 * by the address.
 */
export function rateLimitKey(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  const [head = "", tail] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return `${groups.slice(0, 4).map((group) => group.padStart(4, "0")).join(":")}::/64`;
}

/**
 * Per-route override for the better-auth credential endpoints (sign-in,
 * sign-up, password reset, change/verify password): the ones worth
 * brute-forcing, or that send email, so they get a far tighter budget than
 * the global ceiling. One bucket per client across all of them.
 */
export function authRateLimitConfig(env: Env) {
  return {
    rateLimit: {
      max: env.AUTH_RATE_LIMIT_MAX,
      timeWindow: "1 minute",
    },
  };
}

/**
 * Global per-client rate limit. Registered at the root scope before any
 * route so that per-route `config.rateLimit` overrides resolve against it.
 */
export function registerRateLimit(app: FastifyInstance, env: Env): void {
  void app.register(fastifyRateLimit, {
    global: true,
    max: env.GLOBAL_RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    // `request.ip` is the client Caddy saw, never Caddy itself (trustCaddyHop).
    keyGenerator: (request) => rateLimitKey(request.ip),
    // The builder's return value is thrown, so it has to be a real Error
    // carrying the status; a plain object surfaces as a 500.
    errorResponseBuilder: (_request, context) => {
      const error = new Error(`Too many requests. Try again in ${context.after}.`) as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = context.statusCode;
      error.code = "RATE_LIMITED";
      return error;
    },
  });
}
