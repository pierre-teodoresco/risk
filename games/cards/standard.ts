// Standard playing-card primitives, shared by Poker and Blackjack.
export const SUITS = ["s", "h", "d", "c"] as const;
export type Suit = (typeof SUITS)[number];
export type Card = { id: string; rank: number; suit: Suit };
export const SUIT_SYMBOL: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const rankLabel = (rank: number) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] ?? String(rank);
export const makeDeck = (): Card[] => SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ id: `${suit}${i + 2}`, rank: i + 2, suit })));
