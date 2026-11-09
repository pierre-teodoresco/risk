import type { Metadata } from "next";
import JeuOublie from "@/games/jeu-oublie/ui/JeuOublie";
import "@/games/jeu-oublie/ui/jeu-oublie.css";
export const metadata: Metadata = {
  title: "Le jeu de mon enfance que je n'arrive pas à retrouver et qui n'existe plus que dans ma tête",
  description: "Stratégie en temps réel pour 2 à 4 joueurs sur un damier isométrique : escargots, joggeurs, armoires et mamies. Gratuit, sans compte, comme en 2006.",
};
export default function Page() { return <JeuOublie />; }
