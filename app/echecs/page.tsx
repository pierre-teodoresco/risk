import type { Metadata } from "next";
import "@/games/grand-tour/ui/grand-tour.css";
import "@/games/duel/ui/board2d.css";
import Echecs from "@/games/echecs/ui/Echecs";
export const metadata: Metadata = {
  title: "Échecs — Le roi tombe, la partie aussi.",
  description: "Partie d’échecs en ligne entre amis, avec pendule, sans compte.",
};
export default function Page() {
  return <Echecs />;
}
