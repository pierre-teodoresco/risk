import type { Metadata } from "next";
import Mappa from "@/components/Mappa";
import { gameName } from "@/games/registry";
export const metadata: Metadata = {
  title: `${gameName("mappa")} — Le monde est à vous.`,
  description:
    "Un atlas, quelques amis et un monde à conquérir. Jeu de stratégie multijoueur privé, gratuit, pour 3 à 6 joueurs.",
};
export default function Page() {
  return <Mappa />;
}
