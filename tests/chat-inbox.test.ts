import { test } from "node:test";
import assert from "node:assert/strict";
import { inConversation, unreadMessages } from "../lib/chat-inbox";
import type { Message } from "../lib/game";

const message = (id: string, from = "Bob", to: string | null = "Alice"): Message =>
  ({ id, from, to, text: "hello", at: 1000 });

test("a private message stays unread when another conversation or the table is open", () => {
  const privateMessage = message("private");
  assert.equal(inConversation(privateMessage, "Alice", ""), false);
  assert.equal(inConversation(privateMessage, "Alice", "Charlie"), false);
  assert.equal(inConversation(privateMessage, "Alice", "Bob"), true);
  assert.equal(inConversation(message("reply", "Alice", "Bob"), "Alice", "Bob"), true);
  assert.equal(inConversation(message("public", "Bob", null), "Alice", "Bob"), false);
});

test("unread IDs detect arrivals when retention keeps the message count at 200", () => {
  const previous = Array.from({ length: 200 }, (_, i) => message(String(i)));
  const retained = [...previous.slice(1), message("new")];
  assert.deepEqual(unreadMessages(retained, "Alice", previous.map((m) => m.id)).map((m) => m.id), ["new"]);
  assert.deepEqual(unreadMessages(retained, "Alice", retained.map((m) => m.id)), []);
});

test("only incoming messages addressed to this player or the table count as unread", () => {
  const messages = [message("private"), message("public", "Charlie", null), message("own", "Alice", "Bob"), message("other", "Bob", "Charlie")];
  assert.deepEqual(unreadMessages(messages, "Alice", []).map((m) => m.id), ["private", "public"]);
  assert.deepEqual(unreadMessages(messages, "Alice", ["private"]).map((m) => m.id), ["public"]);
});
