// Shared card primitives. Rules and private state stay in each game's engine.
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pioche's fan geometry, also used for a poker pocket. Coordinates are relative to centre. */
export function fanSlot(i: number, n: number, width: number, cardW: number) {
  const centre = i - (n - 1) / 2;
  const spread = Math.max(0, width - cardW - 24);
  const step = n > 1 ? Math.min(cardW * .72, spread / (n - 1)) : 0;
  const norm = n > 1 ? centre / ((n - 1) / 2) : 0;
  return { x: centre * step, y: norm * norm * cardW * 1.5 * .07, rot: centre * Math.min(5, 40 / n) };
}
