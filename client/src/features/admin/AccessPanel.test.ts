import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AdminCollaborator } from "@blw/shared";

const h = vi.hoisted(() => ({
  collaborators: {
    data: undefined as { collaborators: AdminCollaborator[] } | undefined,
    isLoading: false,
    isError: false,
  },
  grant: { isPending: false },
  revoke: { isPending: false },
}));

vi.mock("./hooks.js", () => ({
  useCollaborators: () => h.collaborators,
  useGrantCollaborator: () => ({ mutate: () => {}, isPending: h.grant.isPending }),
  useRevokeCollaborator: () => ({ mutate: () => {}, isPending: h.revoke.isPending }),
}));

import {
  ACCESS_PANEL_DESCRIPTION,
  ACCESS_PANEL_TITLE,
  AccessPanel,
  collaboratorErrorMessage,
  collaboratorProvenance,
  collaboratorSourceLabel,
} from "./AccessPanel.js";

/** An env-bootstrapped owner: no row to revoke, and it is the viewer. */
const OWNER: AdminCollaborator = {
  userId: null,
  email: "owner@example.com",
  source: "env",
  grantedAt: null,
  grantedBy: null,
  isSelf: true,
  canRevoke: false,
};

/** A collaborator granted from this very panel. */
const MATE: AdminCollaborator = {
  userId: "user-2",
  email: "mate@example.com",
  source: "database",
  grantedAt: "2026-09-01T10:00:00.000Z",
  grantedBy: "owner@example.com",
  isSelf: false,
  canRevoke: true,
};

function render(): string {
  return renderToString(createElement(AccessPanel, null));
}

beforeEach(() => {
  h.collaborators = { data: { collaborators: [OWNER, MATE] }, isLoading: false, isError: false };
  h.grant.isPending = false;
  h.revoke.isPending = false;
});

describe("AccessPanel (item 327)", () => {
  it("names itself and says what a collaborator can and cannot see", () => {
    const html = render();
    expect(html).toContain(`>${ACCESS_PANEL_TITLE}</h2>`);
    expect(html).toContain("they see these aggregates, never anybody&#x27;s data");
    expect(ACCESS_PANEL_DESCRIPTION).toContain("signs up as a parent first");
  });

  it("lists who has access, and how each of them got it", () => {
    const html = render();
    expect(html).toContain("owner@example.com");
    expect(html).toContain("mate@example.com");
    expect(html).toContain("Set in the server environment");
    expect(html).toContain("Granted from this page by owner@example.com");
  });

  it("marks the viewer's own row", () => {
    const html = render();
    const rows = html.split("<li ").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain(">you<");
    expect(rows[1]).not.toContain(">you<");
  });

  it("offers Revoke only where the server says it is possible", () => {
    // The env admin (and the viewer themselves) cannot be demoted from here;
    // the server enforces both independently, so an absent button is a
    // courtesy rather than the rule.
    const html = render();
    expect(html.split(">Revoke<").length - 1).toBe(1);
    const rows = html.split("<li ").slice(1);
    expect(rows[0]).not.toContain(">Revoke<");
    expect(rows[1]).toContain(">Revoke<");
  });

  it("keeps the revoke control at a full touch target", () => {
    expect(render()).toMatch(/<button[^>]*class="[^"]*min-h-11[^"]*"[^>]*>Revoke<\/button>/);
  });

  it("offers a grant-by-email form", () => {
    const html = render();
    expect(html).toContain(">Grant access by email<");
    expect(html).toContain('id="admin-grant-email"');
    expect(html).toContain('type="email"');
    expect(html).toContain(">Grant access<");
  });

  it("says it is working rather than going quiet", () => {
    h.grant.isPending = true;
    expect(render()).toContain(">Granting…<");
  });

  it("shows skeletons while the list loads", () => {
    h.collaborators = { data: undefined, isLoading: true, isError: false };
    const html = render();
    expect(html).toContain('aria-label="Loading"');
    expect(html).toContain("skeleton");
    expect(html).not.toContain("<li ");
  });

  it("says so when the list cannot be read", () => {
    h.collaborators = { data: undefined, isLoading: false, isError: true };
    const html = render();
    expect(html).toContain("Couldn&#x27;t load who has access.");
    expect(html).toContain('role="alert"');
  });
});

describe("collaborator error messages", () => {
  it("turns the re-auth refusal into the same sentence the delete flow uses", () => {
    // One rule, one wording: grant/revoke and account deletion share the
    // server's freshness window, so they must not describe it differently.
    expect(collaboratorErrorMessage("reauth_required")).toBe(
      "For your safety this needs a fresh sign-in. Sign out, sign back in, and try again.",
    );
  });

  it("explains every refusal the server can answer with", () => {
    expect(collaboratorErrorMessage("unknown_user")).toContain("Ask them to sign up first");
    expect(collaboratorErrorMessage("cannot_demote_self")).toContain("your own access");
    expect(collaboratorErrorMessage("env_admin")).toContain("server's environment");
    // An unexpected code is never echoed to the screen.
    expect(collaboratorErrorMessage("weird_new_code")).toBe("Something went wrong. Try again in a moment.");
    expect(collaboratorErrorMessage("weird_new_code")).not.toContain("weird");
    expect(collaboratorErrorMessage("invalid_request")).toContain("email address");
    expect(collaboratorErrorMessage("rate_limited")).toContain("Wait a few minutes");
    expect(collaboratorErrorMessage("not_found")).toContain("no longer have access");
  });

  it("never echoes an unknown server code; it says something went wrong instead", () => {
    expect(collaboratorErrorMessage("totally_new_code")).toBe("Something went wrong. Try again in a moment.");
    expect(collaboratorErrorMessage("totally_new_code")).not.toContain("totally_new_code");
  });
});

describe("collaborator source labels", () => {
  it("distinguishes a deployment fact from a grant made here", () => {
    expect(collaboratorSourceLabel(OWNER)).toBe("Set in the server environment");
    expect(collaboratorSourceLabel(MATE)).toBe("Granted from this page");
  });

  it("names the granting admin when the audit trail knows one", () => {
    expect(collaboratorProvenance(MATE)).toBe("Granted from this page by owner@example.com");
    expect(collaboratorProvenance(OWNER)).toBe("Set in the server environment");
  });
});
