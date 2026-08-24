// Server-Sent Events plumbing for the chat streaming route. Generic over the
// event payload (chat is the only caller today, but nothing here is
// chat-specific) — the typed event names live in @blw/shared so client and
// server agree on the wire contract.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ChatSseEvent } from "@blw/shared";

const HEARTBEAT_MS = 15_000;

export interface SseChannel {
  /** Writes one `event: <name>\ndata: <json>\n\n` frame. A no-op once the
   * channel is closed or the client has disconnected — callers never need
   * to guard every emit with a closed-check. */
  emit(event: ChatSseEvent, data: unknown): void;
  /** Ends the response and stops the heartbeat. Idempotent. */
  close(): void;
  /** Aborted when the client disconnects (`request.raw`'s `close` event) —
   * long-running work (the model call, the tool loop) should check this and
   * stop rather than run to completion for a listener that is gone. */
  readonly signal: AbortSignal;
}

/**
 * Opens a `text/event-stream` response and hijacks it from Fastify's normal
 * lifecycle so nothing else tries to send a second response afterward.
 *
 * `X-Accel-Buffering: no` matters behind the eventual Caddy reverse proxy —
 * without it, a buffering proxy can hold the whole stream until it ends,
 * which defeats the point of streaming. `Cache-Control: no-transform` stops
 * an intermediate proxy from "helpfully" re-encoding the body.
 */
export function openSseChannel(request: FastifyRequest, reply: FastifyReply): SseChannel {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Tells Fastify this response is being managed by hand from here on — it
  // will not attempt to serialize a return value or send its own reply.
  reply.hijack();

  const controller = new AbortController();
  let closed = false;

  const heartbeat = setInterval(() => {
    if (closed) return;
    try {
      // A bare comment line: valid SSE, ignored by every parser, just
      // enough traffic to keep idle proxies/load balancers from timing the
      // connection out during a long tool call.
      reply.raw.write(": heartbeat\n\n");
    } catch {
      // Socket already gone — the request's own "close" listener below will
      // catch up and run cleanup.
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  function emit(event: ChatSseEvent, data: unknown): void {
    if (closed) return;
    try {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // A write after the client disconnected is a lost message, not a
      // crash — the abort signal is what callers should be checking.
    }
  }

  function close(): void {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try {
      reply.raw.end();
    } catch {
      // Already closed by the other side.
    }
  }

  request.raw.on("close", () => {
    controller.abort();
    close();
  });

  return { emit, close, signal: controller.signal };
}
