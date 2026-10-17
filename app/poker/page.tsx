import type { Metadata } from "next";
import Poker from "@/games/poker/ui/Poker";
import "@/games/poker/ui/poker.css";
export const metadata: Metadata = {
  title: "Poker — Texas Hold’em entre amis",
  description: "Un tournoi de Texas Hold’em no-limit pour 2 à 8 amis, avec des jetons fictifs. Gratuit, sans compte.",
};
export default function Page() { return <Poker />; }
