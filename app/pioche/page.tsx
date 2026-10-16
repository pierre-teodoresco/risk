import type { Metadata } from "next";
import "@/games/pioche/ui/pioche.css";
import Pioche from "@/games/pioche/ui/Pioche";
export const metadata: Metadata = {
  title: "Pioche — Vide ta main avant les autres.",
  description: "Jeu de cartes de défausse en ligne pour 2 à 8 joueurs, entre amis, sans compte.",
};
export default function Page() {
  return <Pioche />;
}
