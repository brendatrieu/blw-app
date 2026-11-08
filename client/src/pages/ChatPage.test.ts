import { describe, expect, it } from "vitest";
import { DELETE_CHAT_CONFIRM } from "./ChatPage.js";

describe("ChatPage", () => {
  it("asks before deleting a chat, with 'cannot' spelled out (ledger 955)", () => {
    expect(DELETE_CHAT_CONFIRM).toBe("Delete this chat? This cannot be undone.");
  });
});
