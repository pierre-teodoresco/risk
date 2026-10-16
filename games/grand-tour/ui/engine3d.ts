// Grand Tour's 3D board, seen as a diamond from above like the big online board games: thick
// white squares with a flag and a large price, a lawn in the middle with the card piles, small
// props on the special squares, owners' flags and buildings that grow, chunky pawns that hop
// square by square, and two red dice that are shaken, thrown and bounce before the pawn moves.
// React-free on purpose: Board.tsx owns one instance and feeds it state.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BOARD, SQUARES } from "../board";

export type TourHolding = { owner: string; houses: number; mortgaged: boolean };
export type TourPawn = { id: string; color: string; pos: number; out: boolean };
export type TourMove = { by: string; from: number; to: number; jump: boolean; at: number } | null;
export type TourState = {
  holdings: Record<string, TourHolding>;
  pawns: TourPawn[];
  move: TourMove;
  ownerColor: (id: string) => string;
  /** Faces shown and a key that changes with each throw. */
  dice: { values: [number, number]; key: string } | null;
  selected: number | null;
  labels: string[];
  prices: (number | null)[];
  /** Current rent of each owned square ("₲50", "×4"), shown instead of its price. */
  rents: (string | null)[];
  groupColors: (string | null)[];
  flags: (string | null)[];
  active: string | null;
  pot: number;
  /** A card just drawn, to lift from its pile. */
  card: { deck: "chance" | "chest"; at: number } | null;
};
export type TourCallbacks = {
  onSelect?: (i: number) => void;
  /** The dice came to rest. */
  onDice?: (values: [number, number]) => void;
  /** A pawn hopped onto a square (k-th hop of its walk). */
  onHop?: (id: string, square: number, k: number) => void;
  /** A pawn finished its walk. */
  onArrive?: (id: string, square: number) => void;
  /** Something landed with a thud: dice, a building, a flag. */
  onThud?: (kind: "dice" | "build" | "flag") => void;
};
/** `showcase`: a closer camera for posters, slowly circling the board. */
export type TourOptions = { interactive: boolean; autoRotate?: boolean; showcase?: boolean };

// Board units: corners 1.6 wide, other squares 1; the board is 12.2 across.
const CORNER = 1.6, TOTAL = CORNER * 2 + 9, HALF = TOTAL / 2;
const TILE_H = 0.26, SLAB_H = 0.5, GAP = 0.06;
const HOP_MS = 200, HOP_H = 0.55;
const PAWN_SCALE = 1.3;
const LAND_MS = 1150;
const PX = 256;
const INK = "#20232e";
const WHITE = "#fbfaf6";
const DISPLAY = "'Paytone One', 'Arial Rounded MT Bold', system-ui, sans-serif";
const UI = "'Nunito Sans', system-ui, sans-serif";

const trackStart = (n: number) => (n === 1 ? 0 : CORNER + (n - 2));
const trackSize = (n: number) => (n === 1 || n === 11 ? CORNER : 1);
type Side = "bottom" | "left" | "top" | "right" | "corner";
/** Grid cell of square i: Start bottom-right, then clockwise along the bottom, left, top, right. */
function cellOf(i: number): { row: number; col: number; side: Side } {
  if (i === 0) return { row: 11, col: 11, side: "corner" };
  if (i < 10) return { row: 11, col: 11 - i, side: "bottom" };
  if (i === 10) return { row: 11, col: 1, side: "corner" };
  if (i < 20) return { row: 11 - (i - 10), col: 1, side: "left" };
  if (i === 20) return { row: 1, col: 1, side: "corner" };
  if (i < 30) return { row: 1, col: 1 + (i - 20), side: "top" };
  if (i === 30) return { row: 1, col: 11, side: "corner" };
  return { row: 1 + (i - 30), col: 11, side: "right" };
}
function rectOf(i: number) {
  const { row, col, side } = cellOf(i);
  const w = trackSize(col), d = trackSize(row);
  return { x: -HALF + trackStart(col) + w / 2, z: -HALF + trackStart(row) + d / 2, w, d, side };
}
/**
 * Each square is drawn upright in its own frame: x along the track, z across it, 1 × 1.6 for a
 * side square. The frame turns so that every label reads from the camera, which looks at the
 * board from the Start corner; `inner` is the sign of z pointing to the middle of the board.
 */
function frameOf(side: Side) {
  if (side === "right") return { yaw: Math.PI / 2, inner: -1 };
  if (side === "left") return { yaw: Math.PI / 2, inner: 1 };
  if (side === "top") return { yaw: 0, inner: 1 };
  return { yaw: 0, inner: -1 };
}

const mats = new Map<string, THREE.MeshPhysicalMaterial>();
/** Glossy plastic, shared per colour. */
function plastic(color: THREE.ColorRepresentation, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  const key = String(color) + JSON.stringify(extra);
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, ...extra })));
  return m;
}

// ---------- Shared shapes ----------
/** Geometries shared by every board on the page: never disposed with one of them. */
const SHARED = new Set<THREE.BufferGeometry>();
const share = <T extends THREE.BufferGeometry>(g: T) => (SHARED.add(g), g);
const lathe = (profile: number[][], s = 1, seg = 32) => share(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * s, y * s)), seg));
const PAWN = {
  base: lathe([[0, 0], [0.27, 0], [0.29, 0.03], [0.28, 0.07], [0.22, 0.1], [0, 0.1]]),
  body: lathe([[0, 0.08], [0.21, 0.08], [0.17, 0.2], [0.12, 0.36], [0.1, 0.44], [0.16, 0.47], [0.16, 0.5], [0, 0.5]]),
  head: share(new THREE.SphereGeometry(0.15, 28, 20)),
};
const ARROW = (() => {
  const g = new THREE.ConeGeometry(0.13, 0.22, 4);
  g.rotateX(Math.PI);
  return share(g);
})();
const HOUSE = (() => {
  const walls = share(new RoundedBoxGeometry(0.22, 0.17, 0.2, 2, 0.02));
  walls.translate(0, 0.085, 0);
  const roof = new THREE.ConeGeometry(0.19, 0.13, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1, 1, 0.88);
  roof.translate(0, 0.235, 0);
  const door = new THREE.BoxGeometry(0.06, 0.09, 0.01);
  door.translate(0, 0.045, 0.101);
  return { walls, roof: share(roof), door: share(door) };
})();
const TOWER = (() => {
  const body = new RoundedBoxGeometry(0.42, 0.62, 0.34, 2, 0.03);
  body.translate(0, 0.31, 0);
  const top = new RoundedBoxGeometry(0.48, 0.08, 0.4, 2, 0.02);
  top.translate(0, 0.66, 0);
  return { body: share(body), top: share(top) };
})();
const WINDOW = share(new THREE.BoxGeometry(0.07, 0.07, 0.01));
const POLE = share(new THREE.CylinderGeometry(0.015, 0.015, 0.62, 8));
const FLAG = (() => {
  const g = new THREE.PlaneGeometry(0.3, 0.19, 6, 1);
  g.translate(0.15, 0, 0);
  return share(g);
})();
const COIN = share(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 28));
const CARD = share(new RoundedBoxGeometry(0.9, 0.035, 1.3, 2, 0.03));
const DIE = share(new RoundedBoxGeometry(0.72, 0.72, 0.72, 5, 0.13));
const DIE_SIZE = 0.72;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function dieFace(value: number) {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = "#e8333b";
    g.fillRect(0, 0, 128, 128);
    const spots: Record<number, number[][]> = {
      1: [[64, 64]],
      2: [[38, 38], [90, 90]],
      3: [[36, 36], [64, 64], [92, 92]],
      4: [[38, 38], [90, 38], [38, 90], [90, 90]],
      5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]],
      6: [[38, 32], [90, 32], [38, 64], [90, 64], [38, 96], [90, 96]],
    };
    for (const [x, y] of spots[value]) {
      g.fillStyle = "#9e1a22";
      g.beginPath();
      g.arc(x, y + 2, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x, y, 11, 0, Math.PI * 2);
      g.fill();
    }
  });
}
// BoxGeometry faces: +x, −x, +y, −y, +z, −z. Opposite faces add up to 7.
const FACE_VALUES = [2, 5, 1, 6, 3, 4];
const UP: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, 0),
  6: new THREE.Euler(Math.PI, 0, 0),
  2: new THREE.Euler(0, 0, Math.PI / 2),
  5: new THREE.Euler(0, 0, -Math.PI / 2),
  3: new THREE.Euler(-Math.PI / 2, 0, 0),
  4: new THREE.Euler(Math.PI / 2, 0, 0),
};
let DICE_MATS: THREE.MeshPhysicalMaterial[] | null = null;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeBack = (t: number) => {
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Fits text on one or two lines inside `width`, shrinking the font until it does. */
function fitLines(g: CanvasRenderingContext2D, text: string, width: number, max: number, min: number, font: (px: number) => string, maxLines = 2) {
  let size = max, lines: string[] = [];
  for (; size > min; size -= 2) {
    g.font = font(size);
    lines = [];
    for (const w of text.split(" ")) {
      const last = lines.at(-1);
      if (last && g.measureText(last + " " + w).width <= width) lines[lines.length - 1] = last + " " + w;
      else lines.push(w);
    }
    if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= width)) break;
  }
  g.font = font(size);
  return { size, lines };
}
const money = (n: number) => `₲${n}`;

type Built = { obj: THREE.Object3D; born: number };
type Tile = {
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshPhysicalMaterial;
  label: THREE.Mesh;
  tex: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  lift: number;
  press: number;
  appear: number;
  flash: number;
  buildings: THREE.Group;
  built: Built[];
  flag: THREE.Group | null;
  flagBorn: number;
  prop: THREE.Object3D | null;
  owner: string | null;
  houses: number;
  w: number;
  d: number;
  inner: number;
};
type PawnObj = { group: THREE.Group; mat: THREE.MeshPhysicalMaterial; shown: number; path: number[]; stepStart: number; hops: number; squash: number };
type Die = { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; q0: THREE.Quaternion; q1: THREE.Quaternion; axis: THREE.Vector3; spin: number };
type Float = { sprite: THREE.Sprite; tex: THREE.CanvasTexture; born: number; base: THREE.Vector3 };
type Burst = { points: THREE.Points; born: number; vel: Float32Array };

export class TourBoard {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
  private controls: OrbitControls;
  private tiles: Tile[] = [];
  private pawns = new Map<string, PawnObj>();
  private dice: Die[] = [];
  /** idle: resting or hidden; shake: held in the air; air: thrown, waiting for the result; land: falling onto the result. */
  private diceMode: "idle" | "shake" | "air" | "land" = "idle";
  private diceT0 = 0;
  private diceKey = "";
  private diceValues: [number, number] | null = null;
  private state: TourState | null = null;
  private hover = -1;
  private ray = new THREE.Raycaster();
  private down: [number, number] | null = null;
  private raf = 0;
  private resizeObs: ResizeObserver;
  private boot = performance.now();
  private disposed = false;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private arrow: THREE.Mesh;
  private arrowMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.3, clearcoat: 1, emissive: "#000000" });
  private floats: Float[] = [];
  private pendingFloats: { id: string; text: string; color: string }[] = [];
  private bursts: Burst[] = [];
  private piles: Record<"chance" | "chest", THREE.Group> = { chance: new THREE.Group(), chest: new THREE.Group() };
  private flying: { mesh: THREE.Mesh; born: number; from: THREE.Vector3 } | null = null;
  private cardKey = 0;
  private potGroup = new THREE.Group();
  private potShown = -1;
  private shake = 0;
  private props: { obj: THREE.Object3D; kind: string; phase: number }[] = [];
  private beacon: THREE.MeshStandardMaterial | null = null;
  private owned = new Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>();

  constructor(private host: HTMLElement, private cb: TourCallbacks, private opts: TourOptions) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.02;
    r.domElement.style.display = "block";
    r.domElement.style.touchAction = "none";
    host.appendChild(r.domElement);

    // A bright sky: soft light from above, a warm sun casting the shadows.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa9c8e8, 1.55));
    const sun = new THREE.DirectionalLight(0xfff3dc, 2.3);
    sun.position.set(-6, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdbe9ff, 0.7);
    fill.position.set(9, 5, 9);
    this.scene.add(fill);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.16 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = -SLAB_H - 0.35;
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    this.buildBoard();
    this.buildCentre();
    this.buildDice();
    this.arrow = new THREE.Mesh(ARROW, this.arrowMat);
    this.arrow.visible = false;
    this.arrow.castShadow = true;
    this.scene.add(this.arrow);

    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.12,
      enablePan: false,
      minPolarAngle: 0.35,
      maxPolarAngle: 1.12,
      rotateSpeed: 0.6,
      zoomSpeed: 1.1,
    });
    this.controls.autoRotate = !!opts.autoRotate && !this.reduced;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.enabled = opts.interactive;

    const el = r.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private keep<T extends THREE.Material | THREE.BufferGeometry | THREE.Texture>(x: T) {
    this.owned.add(x);
    return x;
  }

  // ---------- Build ----------
  private buildBoard() {
    const slab = new THREE.Mesh(this.keep(new RoundedBoxGeometry(TOTAL + 0.5, SLAB_H, TOTAL + 0.5, 5, 0.22)), plastic("#e9eef6", { roughness: 0.6, clearcoat: 0.2 }));
    slab.position.y = -SLAB_H / 2;
    slab.castShadow = slab.receiveShadow = true;
    this.scene.add(slab);
    // A darker lip under the slab, like the edge of a game box.
    const lip = new THREE.Mesh(this.keep(new RoundedBoxGeometry(TOTAL + 0.2, 0.2, TOTAL + 0.2, 3, 0.08)), plastic("#9fb3cc", { roughness: 0.7, clearcoat: 0 }));
    lip.position.y = -SLAB_H - 0.05;
    this.scene.add(lip);

    for (let i = 0; i < SQUARES; i++) {
      const { x, z, side } = rectOf(i);
      const corner = side === "corner";
      const { yaw, inner } = corner ? { yaw: 0, inner: -1 } : frameOf(side);
      const w = (corner ? CORNER : 1) - GAP, d = CORNER - GAP;
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = yaw;
      const bodyMat = this.keep(new THREE.MeshPhysicalMaterial({ color: WHITE, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
      const body = new THREE.Mesh(this.keep(new RoundedBoxGeometry(w, TILE_H, d, 3, 0.05)), bodyMat);
      body.position.y = TILE_H / 2;
      body.castShadow = body.receiveShadow = true;
      body.userData.i = i;
      group.add(body);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(PX * w);
      canvas.height = Math.round(PX * d);
      const tex = this.keep(new THREE.CanvasTexture(canvas));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const label = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(w - 0.04, d - 0.04)), this.keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      label.rotation.x = -Math.PI / 2;
      label.position.y = TILE_H + 0.003;
      group.add(label);
      const buildings = new THREE.Group();
      buildings.position.y = TILE_H;
      group.add(buildings);
      this.scene.add(group);
      const tile: Tile = { group, body, bodyMat, label, tex, canvas, lift: 0, press: 0, appear: 0.05 + i * 0.014, flash: 0, buildings, built: [], flag: null, flagBorn: 0, prop: null, owner: null, houses: 0, w, d, inner };
      tile.prop = this.buildProp(i, tile);
      this.tiles.push(tile);
    }
  }

  /** The little object standing on a special square. */
  private buildProp(i: number, t: Tile): THREE.Object3D | null {
    const kind = BOARD[i].kind;
    const g = new THREE.Group();
    g.position.y = TILE_H;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(this.keep(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    // Props stand in the half of the square near the middle of the board, the label keeps the rest.
    const zc = t.inner * 0.32;
    if (kind === "airport") {
      const white = plastic("#ffffff"), blue = plastic("#3d7ff0");
      const plane = new THREE.Group();
      const body = new THREE.Mesh(this.keep(new THREE.CapsuleGeometry(0.075, 0.48, 6, 14)), white);
      body.rotation.z = Math.PI / 2;
      const wing = new THREE.Mesh(this.keep(new RoundedBoxGeometry(0.16, 0.025, 0.64, 2, 0.01)), blue);
      wing.position.x = 0.02;
      const tail = new THREE.Mesh(this.keep(new RoundedBoxGeometry(0.09, 0.15, 0.025, 2, 0.01)), blue);
      tail.position.set(-0.26, 0.09, 0);
      const stab = new THREE.Mesh(this.keep(new RoundedBoxGeometry(0.07, 0.02, 0.24, 2, 0.008)), blue);
      stab.position.set(-0.26, 0.03, 0);
      plane.add(body, wing, tail, stab);
      plane.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      plane.position.set(0, 0.2, zc);
      plane.rotation.y = 0.5;
      g.add(plane);
      this.props.push({ obj: plane, kind: "plane", phase: i });
    } else if (kind === "utility") {
      if (BOARD[i].kind === "utility" && (BOARD[i] as { name: string }).name.startsWith("É")) {
        const bolt = new THREE.Shape([[0.05, 0.3], [-0.12, 0], [0, 0], [-0.06, -0.3], [0.14, 0.05], [0.02, 0.05], [0.1, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
        const geo = new THREE.ExtrudeGeometry(bolt, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
        geo.center();
        const m = add(geo, plastic("#ffcf26", { emissive: "#6b4b00" }), 0, 0.36, zc);
        this.props.push({ obj: m, kind: "spin", phase: i });
      } else {
        const drop = new THREE.LatheGeometry([[0, 0.3], [0.04, 0.22], [0.1, 0.12], [0.13, 0.04], [0.12, -0.03], [0.07, -0.08], [0, -0.09]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
        const m = add(drop, plastic("#3aa6f2", { transmission: 0, clearcoat: 1 }), 0, 0.32, zc);
        this.props.push({ obj: m, kind: "bob", phase: i });
      }
    } else if (kind === "chance") {
      const q = canvasTexture(128, 128, (c) => {
        c.fillStyle = "#ff8a1f";
        c.fillRect(0, 0, 128, 128);
        c.fillStyle = "#ffffff";
        c.font = `100px ${DISPLAY}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("?", 64, 70);
      });
      this.keep(q);
      const m = add(new RoundedBoxGeometry(0.34, 0.34, 0.34, 3, 0.06), this.keep(new THREE.MeshPhysicalMaterial({ map: q, roughness: 0.35, clearcoat: 0.8 })), 0, 0.42, zc);
      this.props.push({ obj: m, kind: "float", phase: i });
    } else if (kind === "chest") {
      const box = new THREE.Group();
      const blue = plastic("#3d7ff0"), gold = plastic("#ffd23f");
      const b = new THREE.Mesh(this.keep(new RoundedBoxGeometry(0.34, 0.24, 0.34, 2, 0.03)), blue);
      b.position.y = 0.12;
      const lid = new THREE.Mesh(this.keep(new RoundedBoxGeometry(0.38, 0.07, 0.38, 2, 0.02)), blue);
      lid.position.y = 0.27;
      const r1 = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.07, 0.315, 0.39)), gold);
      r1.position.y = 0.155;
      const r2 = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.39, 0.315, 0.07)), gold);
      r2.position.y = 0.155;
      const bow1 = new THREE.Mesh(this.keep(new THREE.TorusGeometry(0.06, 0.022, 8, 16)), gold);
      bow1.position.set(-0.05, 0.36, 0);
      bow1.rotation.y = Math.PI / 2;
      const bow2 = bow1.clone();
      bow2.position.x = 0.05;
      box.add(b, lid, r1, r2, bow1, bow2);
      box.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      box.position.z = zc;
      box.rotation.y = 0.35;
      g.add(box);
      this.props.push({ obj: box, kind: "wiggle", phase: i });
    } else if (kind === "tax") {
      const gold = plastic("#ffc928", { metalness: 0.3, roughness: 0.3 });
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(COIN, gold);
        c.position.set(k === 3 ? 0.12 : 0, 0.03 + (k === 3 ? 0 : k * 0.055), zc + (k === 3 ? 0.1 : 0));
        c.castShadow = true;
        g.add(c);
      }
    } else if (kind === "go") {
      const arrow = new THREE.Shape([[-0.5, 0.16], [0.12, 0.16], [0.12, 0.38], [0.55, 0], [0.12, -0.38], [0.12, -0.16], [-0.5, -0.16]].map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(arrow, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
      geo.rotateX(-Math.PI / 2);
      const m = add(geo, plastic("#2fbf62"), -0.12, 0.02, -0.28);
      // Start sends the pawns along the bottom row, towards −x.
      m.rotation.y = Math.PI;
      m.scale.setScalar(0.8);
      this.props.push({ obj: m, kind: "nudge", phase: i });
    } else if (kind === "jail") {
      // A customs booth with bars.
      const booth = new THREE.Group();
      const wall = plastic("#f1f3f8"), roof = plastic("#3d7ff0"), bar = plastic("#5b6273", { metalness: 0.5, roughness: 0.3 });
      const back = new THREE.Mesh(this.keep(new RoundedBoxGeometry(0.62, 0.5, 0.08, 2, 0.02)), wall);
      back.position.set(0, 0.25, -0.26);
      const top = new THREE.Mesh(this.keep(new RoundedBoxGeometry(0.72, 0.08, 0.66, 2, 0.02)), roof);
      top.position.y = 0.54;
      booth.add(back, top);
      for (let k = 0; k < 5; k++) {
        const b = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8)), bar);
        b.position.set(-0.24 + k * 0.12, 0.25, 0.24);
        booth.add(b);
      }
      booth.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      booth.position.set(-0.32, 0, -0.32);
      g.add(booth);
    } else if (kind === "parking") {
      // A palm tree and a parasol: the stopover.
      const trunk = plastic("#b97d4b"), leaf = plastic("#3fbf5a"), red = plastic("#ff5a5f"), white = plastic("#ffffff");
      const palm = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const s = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.045 - k * 0.004, 0.05 - k * 0.004, 0.13, 8)), trunk);
        s.position.set(k * 0.018, 0.065 + k * 0.12, 0);
        palm.add(s);
      }
      for (let k = 0; k < 6; k++) {
        const l = new THREE.Mesh(this.keep(new THREE.ConeGeometry(0.06, 0.36, 4)), leaf);
        l.position.set(0.09, 0.66, 0);
        l.rotation.set(0, (k / 6) * Math.PI * 2, 1.9);
        l.translateY(0.15);
        palm.add(l);
      }
      palm.position.set(-0.3, 0, -0.3);
      const umbrella = new THREE.Group();
      const pole = new THREE.Mesh(POLE, white);
      pole.position.y = 0.31;
      const cloth = new THREE.Mesh(this.keep(new THREE.ConeGeometry(0.3, 0.14, 12)), red);
      cloth.position.y = 0.63;
      umbrella.add(pole, cloth);
      umbrella.position.set(0.35, 0, 0.3);
      umbrella.rotation.z = 0.15;
      g.add(palm, umbrella);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.props.push({ obj: palm, kind: "sway", phase: i });
    } else if (kind === "toJail") {
      // A striped barrier and a flashing beacon.
      const post = plastic("#5b6273"), stripe = canvasTexture(256, 32, (c) => {
        for (let k = 0; k < 8; k++) {
          c.fillStyle = k % 2 ? "#ffffff" : "#ff3b3b";
          c.fillRect(k * 32, 0, 32, 32);
        }
      });
      this.keep(stripe);
      const p1 = add(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 10), post, -0.45, 0.21, 0.1);
      const barGeo = new RoundedBoxGeometry(0.9, 0.07, 0.07, 2, 0.02);
      const bar = add(barGeo, this.keep(new THREE.MeshPhysicalMaterial({ map: stripe, roughness: 0.4, clearcoat: 0.6 })), 0, 0.36, 0.1);
      void p1;
      this.beacon = this.keep(new THREE.MeshStandardMaterial({ color: "#3d8bff", emissive: "#1f5fff", emissiveIntensity: 1 }));
      add(new THREE.SphereGeometry(0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.beacon, -0.45, 0.42, 0.1);
      this.props.push({ obj: bar, kind: "barrier", phase: i });
    } else return null;
    t.group.add(g);
    return g;
  }

  /** The lawn in the middle: card piles, the pot, the dice landing in front. */
  private buildCentre() {
    const lawnTex = this.keep(
      canvasTexture(1024, 1024, (g, W, H) => {
        g.fillStyle = "#86cf5c";
        g.fillRect(0, 0, W, H);
        // Mown stripes, then a sandy path ring and a plaza.
        for (let k = 0; k < 16; k++) {
          g.fillStyle = k % 2 ? "#7cc653" : "#8fd565";
          g.fillRect(k * (W / 16), 0, W / 16, H);
        }
        g.strokeStyle = "#f3e2b0";
        g.lineWidth = 46;
        g.beginPath();
        g.roundRect(120, 120, W - 240, H - 240, 120);
        g.stroke();
        g.fillStyle = "#f3e2b0";
        g.beginPath();
        g.arc(W / 2, H / 2, 210, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#e3cd92";
        g.lineWidth = 10;
        g.beginPath();
        g.arc(W / 2, H / 2, 190, 0, Math.PI * 2);
        g.stroke();
        // Flower beds in the corners.
        const dots = ["#ff7aa2", "#ffd84a", "#ffffff", "#ff8a3d"];
        for (const [cx, cy] of [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]])
          for (let k = 0; k < 26; k++) {
            g.fillStyle = dots[k % 4];
            g.beginPath();
            g.arc(cx + Math.cos(k * 2.4) * (k * 1.6), cy + Math.sin(k * 2.4) * (k * 1.6), 7, 0, Math.PI * 2);
            g.fill();
          }
      }),
    );
    const lawn = new THREE.Mesh(this.keep(new RoundedBoxGeometry(9 - GAP, 0.12, 9 - GAP, 3, 0.05)), this.keep(new THREE.MeshPhysicalMaterial({ map: lawnTex, roughness: 0.85, clearcoat: 0.05 })));
    lawn.position.y = 0.04;
    lawn.receiveShadow = true;
    this.scene.add(lawn);

    // The game's name painted on the lawn, facing the camera.
    const logo = this.keep(
      canvasTexture(1024, 256, (g) => {
        g.font = `150px ${DISPLAY}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        g.lineWidth = 26;
        g.strokeStyle = "#ffffff";
        g.strokeText("grand tour", 500, 128);
        g.fillStyle = "#2b6fd6";
        g.fillText("grand tour", 500, 128);
        g.fillStyle = "#ff8a1f";
        g.fillText(".", 500 + g.measureText("grand tour").width / 2 + 26, 128);
      }),
    );
    const logoMesh = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(4.6, 1.15)), this.keep(new THREE.MeshBasicMaterial({ map: logo, transparent: true, depthWrite: false })));
    logoMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    logoMesh.position.set(-1.25, 0.105, -1.25);
    this.scene.add(logoMesh);

    // Card piles on either side, along the camera's right.
    const deck = (deck: "chance" | "chest") => {
      const color = deck === "chance" ? "#ff8a1f" : "#3d7ff0";
      const face = this.keep(
        canvasTexture(256, 370, (g, W, H) => {
          g.fillStyle = color;
          g.beginPath();
          g.roundRect(0, 0, W, H, 26);
          g.fill();
          g.strokeStyle = "#ffffff";
          g.lineWidth = 12;
          g.beginPath();
          g.roundRect(18, 18, W - 36, H - 36, 18);
          g.stroke();
          g.fillStyle = "#ffffff";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = `170px ${DISPLAY}`;
          g.fillText(deck === "chance" ? "?" : "✦", W / 2, H / 2 + 6);
        }),
      );
      const top = this.keep(new THREE.MeshPhysicalMaterial({ map: face, roughness: 0.5, clearcoat: 0.4 }));
      const side = plastic("#ffffff", { roughness: 0.7, clearcoat: 0 });
      const mats = [side, side, top, side, side, side];
      const pile = this.piles[deck];
      for (let k = 0; k < 6; k++) {
        const c = new THREE.Mesh(CARD, mats);
        c.position.y = 0.12 + k * 0.04;
        c.rotation.y = (k % 3) * 0.04 - 0.04;
        c.castShadow = c.receiveShadow = true;
        pile.add(c);
      }
      pile.rotation.y = Math.PI / 4;
      this.scene.add(pile);
    };
    deck("chance");
    deck("chest");
    const right = new THREE.Vector3(1, 0, -1).normalize();
    this.piles.chance.position.copy(right.clone().multiplyScalar(-2.5)).add(new THREE.Vector3(-0.5, 0, -0.5));
    this.piles.chest.position.copy(right.clone().multiplyScalar(2.5)).add(new THREE.Vector3(-0.5, 0, -0.5));
    this.potGroup.position.set(-0.2, 0.1, -0.2);
    this.scene.add(this.potGroup);
  }

  private buildDice() {
    DICE_MATS ??= FACE_VALUES.map((v) => {
      return new THREE.MeshPhysicalMaterial({ map: dieFace(v), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    });
    for (let k = 0; k < 2; k++) {
      const mesh = new THREE.Mesh(DIE, DICE_MATS);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.dice.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), axis: new THREE.Vector3(1, 0, 0), spin: 0 });
    }
  }

  // ---------- State ----------
  setState(s: TourState) {
    const prev = this.state;
    this.state = s;
    if (!prev || prev.labels !== s.labels || prev.rents.join() !== s.rents.join() || JSON.stringify(prev.holdings) !== JSON.stringify(s.holdings))
      this.tiles.forEach((_, i) => this.drawLabel(i));
    this.tiles.forEach((_, i) => this.syncHolding(i, !prev));
    this.syncPawns(s, !prev);
    if (s.dice && s.dice.key !== this.diceKey) {
      if (this.diceKey === "" || !prev) this.restDice(s.dice.values);
      else this.landDice(s.dice.values);
    }
    if (s.dice) this.diceKey = s.dice.key;
    if (s.card && s.card.at !== this.cardKey) {
      if (prev && this.cardKey) this.liftCard(s.card.deck);
      this.cardKey = s.card.at;
    }
    if (s.pot !== this.potShown) this.drawPot(s.pot);
    const a = s.active ? s.pawns.find((p) => p.id === s.active) : null;
    this.arrow.visible = !!a && !a.out;
    if (a) this.arrowMat.color.set(a.color);
  }
  setOptions(o: TourOptions) {
    this.opts = o;
    this.controls.enabled = o.interactive;
    this.controls.autoRotate = !!o.autoRotate && !this.reduced;
  }

  private drawLabel(i: number) {
    const t = this.tiles[i], s = this.state!, g = t.canvas.getContext("2d")!;
    const W = t.canvas.width, H = t.canvas.height;
    const sq = BOARD[i], side = cellOf(i).side;
    g.clearRect(0, 0, W, H);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const h = s.holdings[String(i)];
    const ownerColor = h ? s.ownerColor(h.owner) : null;
    // The middle of the board is at the top of the canvas when `inner` is −1, else at the bottom.
    const innerTop = t.inner < 0;
    const y = (k: number) => (innerTop ? k : H - k);
    const box = (k0: number, k1: number) => (innerTop ? [k0, k1 - k0] : [H - k1, k1 - k0]);

    if (side === "corner") {
      // Corners carry a big caption turned towards the camera; the prop does the rest.
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(-Math.PI / 4);
      const { size, lines } = fitLines(g, s.labels[i].toUpperCase(), W * 0.82, 64, 26, (px) => `${px}px ${DISPLAY}`);
      g.lineJoin = "round";
      g.lineWidth = 12;
      g.strokeStyle = "#ffffff";
      g.fillStyle = sq.kind === "go" ? "#22a356" : sq.kind === "toJail" ? "#e2373f" : sq.kind === "parking" ? "#ff8a1f" : "#3d6fd6";
      lines.forEach((l, k) => {
        const yy = H * 0.3 + (k - (lines.length - 1) / 2) * size;
        g.strokeText(l, 0, yy);
        g.fillText(l, 0, yy);
      });
      if (sq.kind === "go") {
        g.font = `800 ${size * 0.62}px ${UI}`;
        g.fillStyle = INK;
        g.fillText("+₲200", 0, H * 0.3 + size * 1.05);
      }
      g.restore();
      t.tex.needsUpdate = true;
      return;
    }

    const band = s.groupColors[i];
    const flagEmoji = s.flags[i];
    if (band) {
      // Coloured header near the middle, with the city's name in white.
      const [by, bh] = box(0, H * 0.36);
      g.fillStyle = band;
      g.beginPath();
      g.roundRect(0, by, W, bh, 18);
      g.fill();
      g.fillStyle = "#00000022";
      g.fillRect(0, innerTop ? H * 0.36 - 8 : H - H * 0.36, W, 8);
      const { size, lines } = fitLines(g, s.labels[i].toUpperCase(), W - 26, 52, 22, (px) => `${px}px ${DISPLAY}`);
      g.fillStyle = "#ffffff";
      g.lineJoin = "round";
      g.lineWidth = 8;
      g.strokeStyle = "#00000033";
      lines.forEach((l, k) => {
        const yy = y(H * 0.18) + (k - (lines.length - 1) / 2) * size * 0.98;
        g.strokeText(l, W / 2, yy);
        g.fillText(l, W / 2, yy);
      });
    } else {
      const { size, lines } = fitLines(g, s.labels[i].toUpperCase(), W - 30, 40, 20, (px) => `${px}px ${DISPLAY}`);
      g.fillStyle = INK;
      lines.forEach((l, k) => g.fillText(l, W / 2, y(H * 0.7) + (k - (lines.length - 1) / 2) * size));
    }
    if (flagEmoji && !h?.houses) {
      g.font = `${W * 0.42}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      g.fillText(flagEmoji, W / 2, y(H * 0.57));
    }
    const price = s.prices[i];
    if (price !== null) {
      // The price strip on the outer edge; an owned square shows its rent in its owner's colour.
      const [py, ph] = box(H * 0.8, H);
      const rent = h ? s.rents[i] : null;
      if (h && ownerColor) {
        g.fillStyle = h.mortgaged ? "#b8bcc6" : ownerColor;
        g.beginPath();
        g.roundRect(8, py + 4, W - 16, ph - 12, 16);
        g.fill();
      }
      const text = sq.kind === "tax" ? `−${money(price)}` : h?.mortgaged ? "✕" : rent ?? money(price);
      const fs = Math.min(64, W * 0.27);
      g.font = `${fs}px ${DISPLAY}`;
      g.fillStyle = h ? "#ffffff" : sq.kind === "tax" ? "#e2373f" : INK;
      g.fillText(text, W / 2, py + ph / 2, W - 24);
    }
    t.tex.needsUpdate = true;
  }

  /** Owner's flag and buildings; new ones pop up. */
  private syncHolding(i: number, instant: boolean) {
    const t = this.tiles[i], s = this.state!, h = s.holdings[String(i)];
    const now = instant ? -1e9 : performance.now();
    const owner = h?.owner ?? null;
    t.bodyMat.color.set(h?.mortgaged ? "#dfe2e8" : WHITE);
    if (owner !== t.owner) {
      if (t.flag) t.group.remove(t.flag);
      t.flag = null;
      if (owner) {
        const color = s.ownerColor(owner);
        const flag = new THREE.Group();
        const pole = new THREE.Mesh(POLE, plastic("#e9edf3", { metalness: 0.4 }));
        pole.position.y = 0.31;
        const cloth = new THREE.Mesh(FLAG, plastic(color, { side: THREE.DoubleSide }));
        cloth.position.y = 0.5;
        cloth.name = "cloth";
        flag.add(pole, cloth);
        flag.traverse((o) => ((o as THREE.Mesh).castShadow = true));
        // On the outer corner of the square, away from the label.
        flag.position.set(-t.w / 2 + 0.12, TILE_H, -t.inner * (t.d / 2 - 0.12));
        t.group.add(flag);
        t.flag = flag;
        t.flagBorn = now;
        if (!instant) {
          this.burst(t.group.localToWorld(new THREE.Vector3(0, TILE_H + 0.3, 0)), color);
          this.cb.onThud?.("flag");
        }
      }
      t.owner = owner;
    }
    const houses = h && !h.mortgaged ? h.houses : 0;
    if (houses !== t.houses || (owner && t.built.length && t.built[0].obj.userData.owner !== owner)) {
      const grew = houses > t.houses;
      t.buildings.clear();
      t.built = [];
      if (houses && owner) {
        const color = s.ownerColor(owner);
        const zc = t.inner * 0.08;
        if (houses === 5) {
          const tower = this.tower(color);
          tower.position.set(0.05, 0, zc);
          t.buildings.add(tower);
          t.built.push({ obj: tower, born: grew ? now : -1e9 });
        } else
          for (let k = 0; k < houses; k++) {
            const house = this.house(color);
            // Two rows of two, a little askew like a real street.
            house.position.set((k % 2 ? 0.17 : -0.12), 0, zc + (k < 2 ? -0.18 : 0.2) * t.inner * -1);
            house.rotation.y = (k % 2 ? -0.2 : 0.15);
            t.buildings.add(house);
            t.built.push({ obj: house, born: grew && k >= t.houses ? now : -1e9 });
          }
        for (const b of t.built) b.obj.userData.owner = owner;
      }
      if (grew && !instant) {
        this.burst(t.group.localToWorld(new THREE.Vector3(0, TILE_H + 0.1, 0)), "#ffffff");
        this.cb.onThud?.("build");
      }
      t.houses = houses;
    }
  }
  private house(color: string) {
    const g = new THREE.Group();
    const walls = new THREE.Mesh(HOUSE.walls, plastic("#ffffff"));
    const roof = new THREE.Mesh(HOUSE.roof, plastic(color));
    const door = new THREE.Mesh(HOUSE.door, plastic("#5a4636"));
    g.add(walls, roof, door);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }
  private tower(color: string) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(TOWER.body, plastic("#ffffff"));
    const top = new THREE.Mesh(TOWER.top, plastic(color));
    g.add(body, top);
    const glass = plastic("#6fb6ff", { roughness: 0.15, clearcoat: 1 });
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) {
        const w = new THREE.Mesh(WINDOW, glass);
        w.position.set(-0.12 + c * 0.12, 0.14 + r * 0.13, 0.171);
        g.add(w);
      }
    const band = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.43, 0.05, 0.35)), plastic(color));
    band.position.y = 0.06;
    g.add(band);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  private slot(i: number, k: number, n: number) {
    const { x, z } = rectOf(i);
    if (n <= 1) return new THREE.Vector3(x, TILE_H, z);
    const a = (k / n) * Math.PI * 2 + 0.6, r = 0.28;
    return new THREE.Vector3(x + Math.cos(a) * r, TILE_H, z + Math.sin(a) * r);
  }

  private syncPawns(s: TourState, instant: boolean) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const p of s.pawns) {
      seen.add(p.id);
      let o = this.pawns.get(p.id);
      if (!o) {
        const mat = plastic(p.color, { clearcoat: 1, clearcoatRoughness: 0.12, roughness: 0.3 });
        const group = new THREE.Group();
        const base = new THREE.Mesh(PAWN.base, plastic("#ffffff"));
        const body = new THREE.Mesh(PAWN.body, mat);
        const head = new THREE.Mesh(PAWN.head, mat);
        head.position.y = 0.62;
        group.add(base, body, head);
        group.scale.setScalar(PAWN_SCALE);
        group.traverse((m) => ((m as THREE.Mesh).castShadow = true));
        group.position.copy(this.slot(p.pos, 0, 1));
        this.scene.add(group);
        o = { group, mat, shown: p.pos, path: [], stepStart: now, hops: 0, squash: 0 };
        this.pawns.set(p.id, o);
      }
      o.group.visible = !p.out;
      if (instant) {
        o.shown = p.pos;
        o.path = [];
        continue;
      }
      const mv = s.move;
      const start = this.diceMode === "air" || this.diceMode === "land" || this.diceMode === "shake" ? Infinity : now;
      if (mv && mv.by === p.id && mv.to === p.pos && o.shown !== p.pos && !mv.jump && o.path.length === 0) {
        const forward = (mv.to - mv.from + SQUARES) % SQUARES;
        const steps = forward <= 12 ? forward : forward - SQUARES;
        o.shown = mv.from;
        o.path = Array.from({ length: Math.abs(steps) }, (_, k) => (mv.from + Math.sign(steps) * (k + 1) + SQUARES) % SQUARES);
        o.stepStart = start;
        o.hops = 0;
      } else if (o.path.length === 0 && o.shown !== p.pos) {
        // Jumps (jail, cards) fly in one long bound.
        o.path = [p.pos];
        o.stepStart = start;
        o.hops = 0;
      }
    }
    for (const [id, o] of this.pawns)
      if (!seen.has(id)) {
        this.scene.remove(o.group);
        this.pawns.delete(id);
      }
  }

  // ---------- Dice ----------
  private spot(k: number) {
    // In front of the plaza, slightly apart.
    return new THREE.Vector3(0.75 + k * 0.95, DIE_SIZE / 2 + 0.1, 0.75 - k * 0.55);
  }
  /** Dice already on the table when the board opens. */
  private restDice(values: [number, number]) {
    this.diceValues = values;
    this.dice.forEach((d, k) => {
      d.mesh.visible = true;
      d.mesh.position.copy(this.spot(k));
      d.mesh.quaternion.setFromEuler(UP[values[k]]).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3 + k * 0.5));
    });
    this.diceMode = "idle";
  }
  /** The player presses the roll button: the dice rise and rattle. */
  hold() {
    if (this.diceMode === "land") return;
    this.diceMode = "shake";
    this.diceT0 = performance.now();
    this.dice.forEach((d) => (d.mesh.visible = true));
  }
  /** The player lets go: the dice fly up and spin until the result arrives. */
  release() {
    if (this.diceMode !== "shake") this.hold();
    this.diceMode = "air";
    this.diceT0 = performance.now();
  }
  /** The roll was refused: the dice fall back. */
  cancel() {
    if (this.diceMode === "shake" || this.diceMode === "air") {
      if (this.diceValues) this.landDice(this.diceValues);
      else {
        this.diceMode = "idle";
        this.dice.forEach((d) => (d.mesh.visible = false));
      }
    }
  }
  private landDice(values: [number, number]) {
    this.diceValues = values;
    const now = performance.now();
    const airborne = this.diceMode === "shake" || this.diceMode === "air";
    this.dice.forEach((d, k) => {
      d.mesh.visible = true;
      d.from.copy(airborne ? d.mesh.position : new THREE.Vector3(-3.2 + k * 0.6, 3.6, -3.2 - k * 0.4));
      if (!airborne) d.mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      d.to.copy(this.spot(k));
      d.q0.copy(d.mesh.quaternion);
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.4);
      d.q1.setFromEuler(UP[values[k]]).premultiply(yaw);
      d.axis.set(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
      d.spin = Math.PI * (4 + Math.random() * 2);
    });
    this.diceMode = "land";
    this.diceT0 = this.reduced ? now - LAND_MS : now;
  }
  private updateDice(now: number) {
    const t = (now - this.diceT0) / 1000;
    if (this.diceMode === "shake") {
      // Held above the plaza, rattling harder the longer the button is held.
      const power = Math.min(1, t / 1.2);
      this.dice.forEach((d, k) => {
        const base = new THREE.Vector3(0.6 + k * 0.7, 1.9 + Math.sin(t * 9 + k) * 0.05, 0.6 - k * 0.4);
        d.mesh.position.set(base.x + Math.sin(t * 40 + k * 3) * 0.06 * (0.4 + power), base.y + Math.cos(t * 47 + k) * 0.05 * (0.4 + power), base.z + Math.sin(t * 33 + k * 7) * 0.06 * (0.4 + power));
        d.mesh.rotateOnAxis(new THREE.Vector3(1, 0.6, 0.3).normalize(), 0.12 + power * 0.25);
        d.mesh.rotateOnAxis(new THREE.Vector3(0, 1, 0), 0.06);
      });
    } else if (this.diceMode === "air") {
      // Thrown: rising and spinning while the server answers.
      this.dice.forEach((d, k) => {
        d.mesh.position.y += (3.4 - d.mesh.position.y) * 0.08;
        d.mesh.position.x += (-0.6 + k * 0.8 - d.mesh.position.x) * 0.05;
        d.mesh.rotateOnAxis(new THREE.Vector3(1, 0.4, 0.2).normalize(), 0.42);
        d.mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), 0.2);
      });
      // A lost answer must not leave the dice in the air.
      if (t > 6) this.cancel();
    } else if (this.diceMode === "land") {
      const k = clamp01((now - this.diceT0) / LAND_MS);
      this.dice.forEach((d, j) => {
        const kk = clamp01(k * 1.06 - j * 0.06);
        d.mesh.position.x = THREE.MathUtils.lerp(d.from.x, d.to.x, ease(kk));
        d.mesh.position.z = THREE.MathUtils.lerp(d.from.z, d.to.z, ease(kk));
        // Three bounces of decreasing height.
        const segs = [0.46, 0.32, 0.22];
        let acc = 0, y = d.to.y;
        for (let s = 0; s < segs.length; s++) {
          if (kk <= acc + segs[s]) {
            const u = (kk - acc) / segs[s];
            if (s === 0) y = d.to.y + (d.from.y - d.to.y) * (1 - u * u);
            else y = d.to.y + [0, 0.9, 0.3][s] * 4 * u * (1 - u);
            break;
          }
          acc += segs[s];
        }
        d.mesh.position.y = y;
        const spin = new THREE.Quaternion().setFromAxisAngle(d.axis, d.spin * (1 - ease(Math.min(1, kk * 1.15))));
        d.mesh.quaternion.slerpQuaternions(d.q0, d.q1, ease(Math.min(1, kk * 1.25))).premultiply(spin);
      });
      if (k >= 1) {
        this.diceMode = "idle";
        this.dice.forEach((d) => {
          d.mesh.position.copy(d.to);
          d.mesh.quaternion.copy(d.q1);
        });
        this.shake = 1;
        this.cb.onThud?.("dice");
        if (this.diceValues) this.cb.onDice?.(this.diceValues);
        // Pawns waiting for the dice now set off.
        for (const o of this.pawns.values()) if (o.path.length && o.stepStart === Infinity) o.stepStart = now + 180;
      }
    }
  }

  // ---------- Effects ----------
  /** Floating text over a pawn, once it has finished walking: "+₲200", "−₲50". */
  float(id: string, text: string, color: string) {
    this.pendingFloats.push({ id, text, color });
  }
  private spawnFloat(id: string, text: string, color: string) {
    const o = this.pawns.get(id);
    if (!o) return;
    const tex = canvasTexture(512, 160, (g) => {
      g.font = `110px ${DISPLAY}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = 22;
      g.strokeStyle = "#ffffff";
      g.strokeText(text, 256, 84);
      g.fillStyle = color;
      g.fillText(text, 256, 84);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(2.1, 0.66, 1);
    sprite.renderOrder = 10;
    const base = o.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    sprite.position.copy(base);
    this.scene.add(sprite);
    this.floats.push({ sprite, tex, born: performance.now(), base });
  }
  private burst(at: THREE.Vector3, color: string) {
    if (this.reduced) return;
    const n = 26;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos.set([at.x, at.y, at.z], k * 3);
      const a = Math.random() * Math.PI * 2, up = 1.5 + Math.random() * 2;
      vel.set([Math.cos(a) * (0.6 + Math.random()), up, Math.sin(a) * (0.6 + Math.random())], k * 3);
    }
    const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.12, transparent: true }));
    this.scene.add(points);
    this.bursts.push({ points, born: performance.now(), vel });
  }
  private liftCard(deck: "chance" | "chest") {
    const pile = this.piles[deck];
    const top = pile.children.at(-1) as THREE.Mesh;
    if (this.flying) this.scene.remove(this.flying.mesh);
    const mesh = top.clone();
    mesh.position.copy(pile.localToWorld(top.position.clone()));
    mesh.quaternion.copy(pile.quaternion);
    this.scene.add(mesh);
    this.flying = { mesh, born: performance.now(), from: mesh.position.clone() };
  }
  private drawPot(pot: number) {
    this.potShown = pot;
    this.potGroup.clear();
    if (pot <= 0) return;
    const gold = plastic("#ffc928", { metalness: 0.35, roughness: 0.28 });
    const stacks = Math.min(5, 1 + Math.floor(pot / 150));
    for (let s = 0; s < stacks; s++)
      for (let k = 0; k < 3 + (s % 3); k++) {
        const c = new THREE.Mesh(COIN, gold);
        c.position.set(Math.cos(s * 1.3) * 0.32 * (s ? 1 : 0), 0.05 + k * 0.055, Math.sin(s * 1.3) * 0.32 * (s ? 1 : 0));
        c.castShadow = true;
        this.potGroup.add(c);
      }
  }

  // ---------- Input ----------
  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hit = this.ray.intersectObjects(this.tiles.map((t) => t.body), false)[0];
    return hit ? (hit.object.userData.i as number) : -1;
  }
  private onMove = (e: PointerEvent) => {
    if (!this.cb.onSelect || !this.opts.interactive) return;
    this.hover = this.pick(e);
    this.renderer.domElement.style.cursor = this.hover >= 0 ? "pointer" : "grab";
  };
  private onLeave = () => {
    this.hover = -1;
  };
  private onDown = (e: PointerEvent) => {
    this.down = [e.clientX, e.clientY];
  };
  private onUp = (e: PointerEvent) => {
    if (!this.down || !this.cb.onSelect || !this.opts.interactive) return;
    const moved = Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]);
    this.down = null;
    if (moved > 6) return;
    const i = this.pick(e);
    if (i >= 0) this.cb.onSelect(i);
  };

  // ---------- Frame ----------
  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const showcase = !!this.opts.showcase;
    // Seen from the Start corner, high above: the board is a diamond.
    const polar = showcase ? 0.95 : w / h < 0.8 ? 0.6 : 0.96;
    const dir = new THREE.Vector3(Math.sin(polar) * Math.SQRT1_2, Math.cos(polar), Math.sin(polar) * Math.SQRT1_2);
    // Aimed a little towards Start, so the board sits above the roll button.
    const lead = showcase ? 0 : 1.6;
    const target = new THREE.Vector3(lead, 0, lead);
    // Find the distance at which the whole board fits, with room for the players' cards.
    const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [new THREE.Vector3(sx * (HALF + 0.3), 0.3, sz * (HALF + 0.3)), new THREE.Vector3(sx * (HALF + 0.3), -SLAB_H, sz * (HALF + 0.3))]));
    const fitX = showcase ? 1.05 : w < 700 ? 1 : 0.94, fitY = showcase ? 1.0 : 0.9;
    let lo = 5, hi = 120;
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      this.camera.position.copy(dir).multiplyScalar(mid).add(target);
      this.camera.lookAt(target);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= fitX && p.y <= fitY && p.y >= -(showcase ? fitY : 0.74);
      });
      if (fits) hi = mid;
      else lo = mid;
    }
    const dist = hi;
    this.camera.position.copy(dir).multiplyScalar(dist).add(target);
    this.controls.target.copy(target);
    this.controls.minDistance = dist * 0.6;
    this.controls.maxDistance = dist * 1.2;
    this.controls.minAzimuthAngle = showcase ? -Infinity : Math.PI / 4 - 0.6;
    this.controls.maxAzimuthAngle = showcase ? Infinity : Math.PI / 4 + 0.6;
    this.controls.update();
  }

  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now(), t = (now - this.boot) / 1000;
    const s = this.state;
    // Tiles: pop in, lift on hover and selection, dip when a pawn lands.
    this.tiles.forEach((tile, i) => {
      const k = this.reduced ? 1 : clamp01((t - tile.appear) / 0.4);
      const pop = k < 1 ? easeBack(k) : 1;
      tile.group.scale.set(1, Math.max(0.001, pop), 1);
      const goal = i === s?.selected ? 0.16 : i === this.hover ? 0.08 : 0;
      tile.lift += (goal - tile.lift) * 0.25;
      tile.press *= 0.86;
      tile.flash *= 0.94;
      tile.group.position.y = tile.lift - tile.press * 0.07;
      tile.bodyMat.emissive.setRGB(tile.flash * 0.35 + (i === s?.selected ? 0.12 : 0), tile.flash * 0.3 + (i === s?.selected ? 0.1 : 0), tile.flash * 0.1);
      if (tile.flag) {
        const fk = clamp01((now - tile.flagBorn) / 450);
        tile.flag.scale.setScalar(fk < 1 ? Math.max(0.01, easeBack(fk)) : 1);
        const cloth = tile.flag.getObjectByName("cloth");
        if (cloth && !this.reduced) cloth.rotation.y = Math.sin(t * 3 + i) * 0.25;
      }
      for (const b of tile.built) {
        const bk = clamp01((now - b.born) / 500);
        b.obj.scale.set(1, bk < 1 ? Math.max(0.01, easeBack(bk)) : 1, 1);
      }
    });
    // Props: small idle motions.
    if (!this.reduced)
      for (const p of this.props) {
        const ph = p.phase;
        if (p.kind === "float") {
          p.obj.position.y = 0.42 + Math.sin(t * 2 + ph) * 0.05;
          p.obj.rotation.y = t * 0.8 + ph;
        } else if (p.kind === "spin") p.obj.rotation.y = t * 1.2 + ph;
        else if (p.kind === "bob") p.obj.position.y = 0.32 + Math.sin(t * 2.2 + ph) * 0.04;
        else if (p.kind === "wiggle") p.obj.rotation.z = Math.sin(t * 6 + ph) * 0.04 * (Math.sin(t * 0.7 + ph) > 0.6 ? 1 : 0);
        else if (p.kind === "sway") p.obj.rotation.z = Math.sin(t * 1.3) * 0.04;
        else if (p.kind === "plane") p.obj.position.y = 0.2 + Math.sin(t * 1.6 + ph) * 0.03;
        else if (p.kind === "nudge") p.obj.position.x = Math.sin(t * 3) * 0.04;
        else if (p.kind === "barrier") p.obj.rotation.z = Math.max(0, Math.sin(t * 0.8)) * 0.5;
      }
    if (this.beacon) this.beacon.emissiveIntensity = this.reduced ? 1 : 0.4 + Math.max(0, Math.sin(t * 6)) * 1.6;

    this.updateDice(now);

    // Pawns: hop along their path, then rest in their square's slot.
    if (s) {
      const crowd: Record<number, string[]> = {};
      for (const p of s.pawns) if (!p.out) {
        const o = this.pawns.get(p.id)!;
        const at = o.path.length ? o.path[o.path.length - 1] : o.shown;
        (crowd[at] ??= []).push(p.id);
      }
      for (const p of s.pawns) {
        const o = this.pawns.get(p.id)!;
        if (o.path.length && now >= o.stepStart) {
          const jump = o.path.length === 1 && Math.abs(o.path[0] - o.shown) > 1 && (o.path[0] - o.shown + SQUARES) % SQUARES !== 1;
          const dur = jump ? HOP_MS * 3 : HOP_MS;
          const k = Math.min(1, (now - o.stepStart) / dur);
          const target = o.path[0];
          const a = this.slot(o.shown, 0, 1), b = this.slot(target, 0, 1);
          o.group.position.lerpVectors(a, b, ease(k));
          o.group.position.y = TILE_H + Math.sin(k * Math.PI) * HOP_H * (jump ? 3 : 1);
          o.group.scale.set(1 - Math.sin(k * Math.PI) * 0.08, 1 + Math.sin(k * Math.PI) * 0.16, 1 - Math.sin(k * Math.PI) * 0.08).multiplyScalar(PAWN_SCALE);
          if (k >= 1) {
            o.shown = target;
            o.path.shift();
            o.stepStart = now;
            o.squash = 1;
            this.tiles[target].press = 1;
            this.cb.onHop?.(p.id, target, o.hops++);
            if (!o.path.length) {
              this.tiles[target].flash = 1;
              this.cb.onArrive?.(p.id, target);
            }
          }
        } else if (!o.path.length) {
          const here = crowd[o.shown] ?? [p.id];
          const goal = this.slot(o.shown, here.indexOf(p.id), here.length);
          o.group.position.x += (goal.x - o.group.position.x) * 0.25;
          o.group.position.z += (goal.z - o.group.position.z) * 0.25;
          o.group.position.y = TILE_H + this.tiles[o.shown].group.position.y;
          o.squash *= 0.8;
          o.group.scale.set(1 + o.squash * 0.12, 1 - o.squash * 0.18, 1 + o.squash * 0.12).multiplyScalar(PAWN_SCALE);
        }
      }
      // Floating amounts wait for their pawn to stop.
      this.pendingFloats = this.pendingFloats.filter((f) => {
        const o = this.pawns.get(f.id);
        if (o && (o.path.length || this.diceMode === "land" || this.diceMode === "air")) return true;
        this.spawnFloat(f.id, f.text, f.color);
        return false;
      });
      // The active player's arrow bobs above their pawn.
      const a = s.active ? this.pawns.get(s.active) : null;
      if (a && this.arrow.visible) {
        this.arrow.position.set(a.group.position.x, a.group.position.y + 1.25 + Math.sin(t * 4) * 0.07, a.group.position.z);
        this.arrow.rotation.y = t * 2;
      }
    }

    for (const f of [...this.floats]) {
      const k = (now - f.born) / 1500;
      f.sprite.position.set(f.base.x, f.base.y + ease(Math.min(1, k)) * 0.9, f.base.z);
      (f.sprite.material as THREE.SpriteMaterial).opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
      const pop = Math.min(1, k * 6);
      f.sprite.scale.set(2.1 * easeBack(pop), 0.66 * easeBack(pop), 1);
      if (k >= 1) {
        this.scene.remove(f.sprite);
        f.tex.dispose();
        f.sprite.material.dispose();
        this.floats.splice(this.floats.indexOf(f), 1);
      }
    }
    for (const b of [...this.bursts]) {
      const k = (now - b.born) / 900;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) {
        b.vel[j * 3 + 1] -= 0.12;
        pos.setXYZ(j, pos.getX(j) + b.vel[j * 3] * 0.016, pos.getY(j) + b.vel[j * 3 + 1] * 0.016, pos.getZ(j) + b.vel[j * 3 + 2] * 0.016);
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = 1 - k;
      if (k >= 1) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(this.bursts.indexOf(b), 1);
      }
    }
    if (this.flying) {
      // The drawn card rises from its pile, flips towards the camera and fades.
      const k = (now - this.flying.born) / 900;
      const m = this.flying.mesh;
      m.position.set(this.flying.from.x * (1 - ease(k)), this.flying.from.y + Math.sin(Math.min(1, k) * Math.PI) * 2.4 + ease(k) * 1, this.flying.from.z * (1 - ease(k)));
      m.rotation.set(-ease(Math.min(1, k)) * Math.PI, Math.PI / 4, 0);
      m.scale.setScalar(1 + ease(Math.min(1, k)) * 0.6);
      if (k >= 1) {
        this.scene.remove(m);
        this.flying = null;
      }
    }

    // A small camera kick when the dice land.
    this.shake *= 0.85;
    this.controls.update();
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.08;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.08;
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    // Shared colours and shapes stay for the other boards on the page; this board's own go.
    for (const x of this.owned) x.dispose();
    for (const f of this.floats) {
      f.tex.dispose();
      f.sprite.material.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}
