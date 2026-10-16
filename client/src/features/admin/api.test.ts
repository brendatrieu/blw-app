// Ledger 840: the admin's password (830) travels in the request body only. A
// URL is printed by the server's request log and kept in browser history;
// a body is neither.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResetLink, grantCollaborator, revokeCollaborator } from "./api.js";

const PASSWORD = "made-up-admin-password-840";

function stubFetch(body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the admin's password goes in the body, never the URL", () => {
  it("revoke sends it as the DELETE body", async () => {
    const calls = stubFetch({ collaborators: [] });
    await revokeCollaborator("user-2", PASSWORD);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/admin/collaborators/user-2");
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ password: PASSWORD });
  });

  it("revoke without one sends no body at all", async () => {
    const calls = stubFetch({ collaborators: [] });
    await revokeCollaborator("user-2");
    expect(calls[0]!.url).toBe("/api/admin/collaborators/user-2");
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it("grant and the reset link send it beside the email", async () => {
    const calls = stubFetch({ collaborators: [] });
    await grantCollaborator({ email: "mate@example.test", password: PASSWORD });
    const linkCalls = stubFetch({
      url: "https://littlemeals.test/reset-password/abc",
      expiresAt: "2026-10-16T10:00:00.000Z",
    });
    await createResetLink({ email: "parent@example.test", password: PASSWORD });

    for (const [call, url] of [
      [calls[0]!, "/api/admin/collaborators"],
      [linkCalls[0]!, "/api/admin/password-reset-link"],
    ] as const) {
      expect(call.url).toBe(url);
      expect(call.init?.method).toBe("POST");
      expect(JSON.parse(String(call.init?.body))).toMatchObject({ password: PASSWORD });
    }
  });
});
