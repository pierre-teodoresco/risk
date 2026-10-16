// Draughts men are ridged plastic discs; a king is two men stacked under a gold crown.
import * as THREE from "three";
import { plastic } from "@/games/duel/ui/grid3d";

const DISC = (() => {
  const pts = [[0, 0], [0.4, 0], [0.42, 0.03], [0.42, 0.1], [0.4, 0.13], [0.33, 0.135], [0.3, 0.12], [0.26, 0.135], [0, 0.135]];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 40);
})();
const CROWN = new THREE.TorusGeometry(0.2, 0.035, 10, 32);
const WHITE = plastic("#f4ecdc");
const BLACK = plastic("#2a2a35", { roughness: 0.3 });
const GOLD = plastic("#e8b21f", { metalness: 0.4, roughness: 0.3 });

export function draughtsPiece(kind: string) {
  const g = new THREE.Group();
  const mat = kind[0] === "w" ? WHITE : BLACK;
  g.add(new THREE.Mesh(DISC, mat));
  if (kind[1] === "k") {
    const top = new THREE.Mesh(DISC, mat);
    top.position.y = 0.14;
    const crown = new THREE.Mesh(CROWN, GOLD);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.29;
    g.add(top, crown);
  }
  return g;
}
