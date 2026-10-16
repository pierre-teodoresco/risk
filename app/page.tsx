import "./hub.css";
import "@/games/grand-tour/ui/grand-tour.css";
import "@/games/grand-tour/ui/tour.css";
import "@/games/duel/ui/board2d.css";
import Hub from "@/components/hub/Hub";
import { boxArt } from "@/components/hub/art";
import { GAMES } from "@/games/registry";
export default function Page() {
  // Box art is rendered on the server so its SVG data never reaches the client bundle.
  return <Hub arts={Object.fromEntries(GAMES.map((g) => [g.id, boxArt(g.id)]))} />;
}
