// Standard 52-card deck and best-five evaluation. No network, clock or hidden state.
export const SUITS = ["s", "h", "d", "c"] as const;
export type Suit = (typeof SUITS)[number];
export type Card = { id: string; rank: number; suit: Suit };
export const SUIT_SYMBOL: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const rankLabel = (rank: number) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] ?? String(rank);
export const makeDeck = (): Card[] => SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ id: `${suit}${i + 2}`, rank: i + 2, suit })));
export type HandValue = { category: number; score: number; cards: Card[] };
const score = (category: number, ranks: number[]) => [category, ...Array.from({ length: 5 }, (_, i) => ranks[i] ?? 0)].reduce((s, r) => s * 15 + r, 0);

function five(cards: Card[]): HandValue {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const groups = [...new Set(ranks)].map((r) => ({ r, n: ranks.filter((x) => x === r).length })).sort((a, b) => b.n - a.n || b.r - a.r);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const straight = new Set(ranks).size === 5 ? ranks[0] - ranks[4] === 4 ? ranks[0] : ranks.join() === "14,5,4,3,2" ? 5 : 0 : 0;
  let category = 0, tie = ranks;
  if (straight && flush) { category = 8; tie = [straight]; }
  else if (groups[0].n === 4) { category = 7; tie = groups.map((g) => g.r); }
  else if (groups[0].n === 3 && groups[1].n === 2) { category = 6; tie = groups.map((g) => g.r); }
  else if (flush) category = 5;
  else if (straight) { category = 4; tie = [straight]; }
  else if (groups[0].n === 3) { category = 3; tie = groups.map((g) => g.r); }
  else if (groups[0].n === 2) { category = groups[1].n === 2 ? 2 : 1; tie = groups.map((g) => g.r); }
  return { category, score: score(category, tie), cards };
}

/** Seven cards use any five, including all five community cards. */
export function evaluate(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error("Expected 5–7 cards");
  let best: HandValue | null = null;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
    for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
      for (let e = d + 1; e < cards.length; e++) {
        const value = five([cards[a], cards[b], cards[c], cards[d], cards[e]]);
        if (!best || value.score > best.score) best = value;
      }
  return best!;
}
export function currentCategory(cards: Card[]) {
  if (cards.length >= 5) return evaluate(cards).category;
  const counts = [...new Set(cards.map((c) => c.rank))].map((r) => cards.filter((c) => c.rank === r).length).sort((a, b) => b - a);
  return counts[0] === 4 ? 7 : counts[0] === 3 ? 3 : counts[0] === 2 ? counts[1] === 2 ? 2 : 1 : 0;
}
