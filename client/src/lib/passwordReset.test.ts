import { describe, expect, it } from "vitest";
import { isDeadLinkError, readResetToken, validateNewPassword } from "./passwordReset.js";

describe("validateNewPassword", () => {
  it("accepts a matching pair inside the server's limits", () => {
    expect(validateNewPassword({ password: "a".repeat(8), confirm: "a".repeat(8) })).toEqual({});
    expect(validateNewPassword({ password: "a".repeat(128), confirm: "a".repeat(128) })).toEqual({});
  });

  it("uses the same 8-128 rules as sign-up, without trimming", () => {
    expect(validateNewPassword({ password: "", confirm: "" }).password).toBe("Password is required");
    expect(validateNewPassword({ password: "short", confirm: "short" }).password).toBe(
      "Enter a password of at least 8 characters",
    );
    expect(validateNewPassword({ password: "a".repeat(129), confirm: "a".repeat(129) }).password).toBe(
      "Use 128 characters or fewer",
    );
    expect(validateNewPassword({ password: "        ", confirm: "        " })).toEqual({});
  });

  it("asks for the same password twice", () => {
    expect(validateNewPassword({ password: "long-enough", confirm: "long-enougH" }).confirm).toBe(
      "The passwords don't match",
    );
    expect(validateNewPassword({ password: "long-enough", confirm: "" }).confirm).toBe("The passwords don't match");
  });
});

describe("readResetToken", () => {
  it("reads better-auth's ?token= first, then the copy parked in history state", () => {
    expect(readResetToken("?token=abc123", null)).toBe("abc123");
    expect(readResetToken("?token=abc123", { resetToken: "older" })).toBe("abc123");
    expect(readResetToken("", { resetToken: "abc123" })).toBe("abc123");
  });

  it("has nothing for an expired/used link, a bare visit, or odd state", () => {
    expect(readResetToken("?error=INVALID_TOKEN", null)).toBeNull();
    expect(readResetToken("", null)).toBeNull();
    expect(readResetToken("?token=", { resetToken: "" })).toBeNull();
    expect(readResetToken("", { resetToken: 42 })).toBeNull();
    expect(readResetToken("", { from: "/meals" })).toBeNull();
  });
});

describe("isDeadLinkError", () => {
  it("is better-auth's spent/expired/unknown token, or an account that is gone", () => {
    expect(isDeadLinkError({ code: "INVALID_TOKEN" })).toBe(true);
    expect(isDeadLinkError({ code: "USER_NOT_FOUND" })).toBe(true);
    expect(isDeadLinkError({ code: "PASSWORD_TOO_SHORT" })).toBe(false);
    expect(isDeadLinkError({})).toBe(false);
    expect(isDeadLinkError(null)).toBe(false);
  });
});
