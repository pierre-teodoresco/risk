import type { Message } from "./game";

export function inConversation(message: Message, me: string, recipient: string) {
  return recipient
    ? (message.from === me && message.to === recipient) ||
        (message.from === recipient && message.to === me)
    : message.to === null;
}

/** IDs survive the rolling 200-message window, unlike a message count. */
export function unreadMessages(messages: Message[], me: string, readIds: string[]) {
  const read = new Set(readIds);
  return messages.filter(
    (message) => message.from !== me &&
      (message.to === null || message.to === me) && !read.has(message.id),
  );
}
