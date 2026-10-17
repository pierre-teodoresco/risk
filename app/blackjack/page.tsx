import type { Metadata } from "next";
import Blackjack from "@/games/blackjack/ui/Blackjack";
import "@/games/blackjack/ui/blackjack.css";
export const metadata: Metadata = {
  title: "Blackjack — Toute la table face à la maison",
  description: "Blackjack de casino pour 1 à 7 joueurs, seul ou entre amis. Croupier automatique, jetons fictifs, gratuit et sans compte.",
};
export default function Page() { return <Blackjack />; }
