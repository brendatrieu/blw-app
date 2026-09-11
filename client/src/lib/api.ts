// Small typed fetch helper shared by every feature's query layer. Kept
// dependency-free (no axios etc.) since the server API is same-origin
// (dev proxy / prod static serving both route /api -> Fastify).

export class ApiError extends Error {
  readonly status: number;
  /**
   * The parsed JSON error body, when there was one (`undefined` for an empty
   * or non-JSON response). Some errors carry more than a message — the
   * custom-food DELETE conflict answers `{ error, mealCount, storageCount }`
   * and the UI has to say "used in N meals and N storage items" — and
   * `message` alone throws those counts away.
   */
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Reads an error response once: the `{ error }` string for `message`, plus
 * the whole parsed body so callers that need its extra fields can validate
 * it themselves (a Response body can only be consumed once, so this can't be
 * two separate passes).
 */
async function extractError(response: Response): Promise<{ message: string; body: unknown }> {
  const fallback = response.statusText || `Request failed with status ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return { message: body.error, body };
    }
    return { message: fallback, body };
  } catch {
    // Non-JSON or empty error body — fall through to the status text.
    return { message: fallback, body: undefined };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const { message, body } = await extractError(response);
    throw new ApiError(response.status, message, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
