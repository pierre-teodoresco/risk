import { SUIT_SYMBOL, rankLabel, type Card } from "../cards";
export function CardFace({ card }: { card: Card }) {
  const red = card.suit === "h" || card.suit === "d", symbol = SUIT_SYMBOL[card.suit], rank = rankLabel(card.rank);
  return <svg viewBox="0 0 100 144" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="98" height="142" rx="8" fill="#fffaf0" stroke="#d9cdb7" strokeWidth="1.5" />
    <g fill={red ? "#b84435" : "#253b35"} textAnchor="middle" fontFamily="Georgia, serif">
      <text x="15" y="25" fontSize="23" fontWeight="700">{rank}</text><text x="15" y="43" fontSize="18">{symbol}</text>
      <g transform="rotate(180 50 72)"><text x="15" y="25" fontSize="23" fontWeight="700">{rank}</text><text x="15" y="43" fontSize="18">{symbol}</text></g>
      <text x="50" y="94" fontSize="62">{symbol}</text>
      {card.rank > 10 && card.rank < 14 && <path d="M35 52L30 39L42 44L50 32L58 44L70 39L65 52Z" fill="none" stroke={red ? "#b84435" : "#253b35"} strokeWidth="2" />}
    </g>
  </svg>;
}
export function CardBack() {
  return <svg viewBox="0 0 100 144" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="98" height="142" rx="8" fill="#f6edda" stroke="#d9cdb7" strokeWidth="1.5" />
    <rect x="7" y="7" width="86" height="130" rx="4" fill="#31594e" />
    <path d="M50 18L84 72L50 126L16 72Z M50 35L73 72L50 109L27 72Z" fill="none" stroke="#d7bd7e" strokeWidth="1.5" />
    <text x="50" y="84" textAnchor="middle" fontFamily="Georgia, serif" fontSize="36" fill="#e8d6a6">♠</text>
  </svg>;
}
