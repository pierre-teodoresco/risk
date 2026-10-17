import type { Metadata } from "next";
import "@/games/grand-tour/ui/grand-tour.css";
import "@/games/grand-tour/ui/tour.css";
import GrandTour from "@/games/grand-tour/ui/GrandTour";
import { Pawn } from "@/games/grand-tour/ui/Pawn";
import { PAWN_HEX } from "@/games/grand-tour/i18n";

export const metadata: Metadata = {
  title: "Grand Tour — Achète, construis, ruine la table.",
  description: "Jeu d’immobilier autour du monde en ligne pour 2 à 6 joueurs, entre amis, sans compte.",
};
export default function Page() {
  return <GrandTour faces={PAWN_HEX.map((_, emblem) => <Pawn key={emblem} emblem={emblem} size={256} />)} />;
}
