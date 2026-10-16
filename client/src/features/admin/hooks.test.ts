// Ledger 840: the mutations that can carry the admin's password (830), or a
// live reset link, are dropped from react-query's mutation cache as soon as
// the panel lets go of them (the panels reset on settle), not five minutes
// later. react-query is replaced so each hook hands back its options.
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
  useQuery: (options: unknown) => options,
}));

import { useCreateResetLink, useGrantCollaborator, useRevokeCollaborator } from "./hooks.js";

describe("password-carrying admin mutations", () => {
  it("are kept for no time once nothing observes them", () => {
    for (const hook of [useGrantCollaborator, useRevokeCollaborator, useCreateResetLink]) {
      expect((hook() as unknown as { gcTime?: number }).gcTime, hook.name).toBe(0);
    }
  });
});
