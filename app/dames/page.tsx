import type { Metadata } from "next";
import "@/games/grand-tour/ui/grand-tour.css";
import "@/games/duel/ui/board2d.css";
import Dames from "@/games/dames/ui/Dames";
export const metadata: Metadata = {
  title: "Dames — Prise obligatoire, rafle majoritaire.",
  description: "Jeu de dames international en ligne entre amis, sans compte.",
};
export default function Page() {
  return <Dames />;
}
