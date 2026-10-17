// Hold’em best-five evaluation; card primitives live in the shared card module.
import type { Card } from "../cards/standard";
export { SUITS, SUIT_SYMBOL, rankLabel, makeDeck, type Card, type Suit } from "../cards/standard";
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
