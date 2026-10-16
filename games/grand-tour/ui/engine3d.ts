// Grand Tour's 3D board, in Mappa's plastic look: cream tiles with coloured bands on a sand-edged
// slab, plastic pawns that hop square by square, houses and hotels, and two real dice thrown in
// the middle. React-free on purpose: Board.tsx owns one instance and feeds it state.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import MAP from "@/lib/map-data.json";
import { CONTINENTS, WORLD } from "@/lib/world";
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
  groupColors: (string | null)[];
};
type Callbacks = { onSelect?: (i: number) => void };
/** `showcase`: a closer, lower camera for posters, slowly circling the board. */
export type TourOptions = { interactive: boolean; autoRotate?: boolean; showcase?: boolean };

// Board units: corners 1.6 wide, other squares 1; the board is 12.2 across.
const CORNER = 1.6, TOTAL = CORNER * 2 + 9, HALF = TOTAL / 2;
const TILE_H = 0.16, SLAB_H = 0.42, GAP = 0.05;
const HOP_MS = 150, HOP_H = 0.45;
const DICE_MS = 750;
const INK = "#2a1c12";

const trackStart = (n: number) => (n === 1 ? 0 : CORNER + (n - 2));
const trackSize = (n: number) => (n === 1 || n === 11 ? CORNER : 1);
/** Grid cell of square i: Start bottom-right, clockwise along the bottom, left, top, right. */
function cellOf(i: number) {
  if (i === 0) return { row: 11, col: 11, side: "corner" as const };
  if (i < 10) return { row: 11, col: 11 - i, side: "bottom" as const };
  if (i === 10) return { row: 11, col: 1, side: "corner" as const };
  if (i < 20) return { row: 11 - (i - 10), col: 1, side: "left" as const };
  if (i === 20) return { row: 1, col: 1, side: "corner" as const };
  if (i < 30) return { row: 1, col: 1 + (i - 20), side: "top" as const };
  if (i === 30) return { row: 1, col: 11, side: "corner" as const };
  return { row: 1 + (i - 30), col: 11, side: "right" as const };
}
function rectOf(i: number) {
  const { row, col, side } = cellOf(i);
  const w = trackSize(col), d = trackSize(row);
  return { x: -HALF + trackStart(col) + w / 2, z: -HALF + trackStart(row) + d / 2, w, d, side };
}
const plastic = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25, ...extra });

// ---------- Shared shapes ----------
const PAWN_GEO = (() => {
  const profile = [[0, 0], [0.3, 0], [0.31, 0.05], [0.24, 0.09], [0.15, 0.18], [0.1, 0.38], [0.17, 0.44], [0.1, 0.5], [0.14, 0.58], [0.17, 0.67], [0.13, 0.76], [0.06, 0.8], [0, 0.81]];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * 0.85, y * 0.85)), 28);
})();
const HOUSE_GEO = (() => {
  const body = new THREE.BoxGeometry(0.15, 0.11, 0.15);
  body.translate(0, 0.055, 0);
  const roof = new THREE.ConeGeometry(0.125, 0.1, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 0.16, 0);
  return mergeGeometries([body.toNonIndexed(), roof.toNonIndexed()]);
})();
/** Geometries shared by every board on the page: never disposed with one of them. */
const SHARED = new Set<THREE.BufferGeometry>();
const HOTEL_GEO = (() => {
  const body = new THREE.BoxGeometry(0.42, 0.15, 0.17);
  body.translate(0, 0.075, 0);
  const roof = new THREE.BoxGeometry(0.46, 0.04, 0.2);
  roof.translate(0, 0.17, 0);
  return mergeGeometries([body.toNonIndexed(), roof.toNonIndexed()]);
})();
SHARED.add(PAWN_GEO).add(HOUSE_GEO).add(HOTEL_GEO);

function dieFace(value: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f7f2e8";
  g.fillRect(0, 0, 128, 128);
  const spots: Record<number, number[][]> = {
    1: [[64, 64]],
    2: [[36, 36], [92, 92]],
    3: [[34, 34], [64, 64], [94, 94]],
    4: [[36, 36], [92, 36], [36, 92], [92, 92]],
    5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
    6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]],
  };
  g.fillStyle = value === 1 ? "#d9413a" : "#1a1620";
  for (const [x, y] of spots[value]) {
    g.beginPath();
    g.arc(x, y, value === 1 ? 15 : 11, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

type Tile = { group: THREE.Group; top: THREE.Mesh; topMat: THREE.MeshPhysicalMaterial; label: THREE.Mesh; tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; lift: number; appear: number; extras: THREE.Group; marker: THREE.Mesh };
type PawnObj = { mesh: THREE.Mesh; mat: THREE.MeshPhysicalMaterial; shown: number; path: number[]; stepStart: number; hop: number };

export class TourBoard {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private controls: OrbitControls;
  private tiles: Tile[] = [];
  private pawns = new Map<string, PawnObj>();
  private dice: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; q0: THREE.Quaternion; q1: THREE.Quaternion }[] = [];
  private diceStart: number | null = null;
  private diceKey = "";
  private state: TourState | null = null;
  private hover = -1;
  private ray = new THREE.Raycaster();
  private down: [number, number] | null = null;
  private raf = 0;
  private resizeObs: ResizeObserver;
  private boot = performance.now();
  private disposed = false;
  private houseMat = plastic("#36c47a");
  private hotelMat = plastic("#e5483f");
  private markerMats = new Map<string, THREE.MeshPhysicalMaterial>();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private waterTime = { value: 0 };
  private plane: THREE.Group | null = null;
  private titleTex!: THREE.CanvasTexture;

  constructor(private host: HTMLElement, private cb: Callbacks, private opts: TourOptions) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.style.display = "block";
    r.domElement.style.touchAction = "none";
    host.appendChild(r.domElement);

    // Like Mappa: the board floats on a living sea.
    const sea = new THREE.Color("#0b2443");
    this.scene.background = sea;
    this.scene.fog = new THREE.Fog(sea, 26, 60);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3b7486, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.5);
    sun.position.set(-7, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 0.6);
    rim.position.set(8, 6, -10);
    this.scene.add(rim);

    const oceanGeo = new THREE.PlaneGeometry(140, 140, 1, 1);
    oceanGeo.rotateX(-Math.PI / 2);
    const water = new THREE.MeshStandardMaterial({ color: 0x258fc0, roughness: 0.26, metalness: 0.08 });
    water.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterTime = this.waterTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vWaterPosition;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterPosition = position.xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uWaterTime;\nvarying vec2 vWaterPosition;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec2 sea = vWaterPosition;
          float tide = sin(sea.x * 0.65 + sea.y * 0.9 + uWaterTime * 0.55);
          float ripple = sin(sea.x * 3.4 + sin(sea.y * 2.8 - uWaterTime * 0.7) * 0.8 + uWaterTime);
          float glint = pow(max(0.0, ripple * sin(sea.y * 3.2 - uWaterTime * 0.6)), 8.0);
          float shore = smoothstep(9.5, 7.0, max(abs(sea.x), abs(sea.y)));
          diffuseColor.rgb *= 1.0 + tide * 0.06;
          diffuseColor.rgb += vec3(0.02, 0.04, 0.05) * glint;
          diffuseColor.rgb += vec3(0.05, 0.09, 0.08) * shore;
        `);
    };
    const ocean = new THREE.Mesh(oceanGeo, water);
    ocean.position.y = -SLAB_H * 0.6;
    ocean.receiveShadow = true;
    this.scene.add(ocean);

    this.buildBoard();
    this.buildDice();

    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.14,
      enablePan: false,
      minPolarAngle: 0.18,
      maxPolarAngle: 1.05,
      minAzimuthAngle: -0.9,
      maxAzimuthAngle: 0.9,
      rotateSpeed: 0.7,
      zoomSpeed: 1.2,
    });
    this.controls.autoRotate = !!opts.autoRotate && !this.reduced;
    this.controls.autoRotateSpeed = 0.6;
    // A showcase board turns all the way round.
    if (opts.showcase) Object.assign(this.controls, { minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity });
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

  // ---------- Build ----------
  private buildBoard() {
    const slab = new THREE.Mesh(
      new RoundedBoxGeometry(TOTAL + 0.5, SLAB_H, TOTAL + 0.5, 4, 0.12),
      [plastic("#ead7a4", { roughness: 0.75, clearcoat: 0.1 })],
    );
    slab.position.y = -SLAB_H / 2;
    slab.castShadow = slab.receiveShadow = true;
    this.scene.add(slab);
    // The middle of the board, a deep plastic field with the game's name.
    const field = new THREE.Mesh(new RoundedBoxGeometry(9 - GAP, 0.06, 9 - GAP, 2, 0.04), plastic("#2f9fd0", { roughness: 0.45, clearcoat: 0.6 }));
    field.position.y = 0.03;
    field.receiveShadow = true;
    this.scene.add(field);
    const title = document.createElement("canvas");
    title.width = 1024;
    title.height = 256;
    const titleTex = (this.titleTex = new THREE.CanvasTexture(title));
    titleTex.colorSpace = THREE.SRGBColorSpace;
    this.drawTitle();
    const titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, depthWrite: false }));
    titleMesh.rotation.x = -Math.PI / 2;
    titleMesh.position.set(0, 0.065, 3.65);
    this.scene.add(titleMesh);
    this.buildWorld();
    this.buildPlane();

    for (let i = 0; i < SQUARES; i++) {
      const { x, z, w, d } = rectOf(i);
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const topMat = plastic(cellOf(i).side === "corner" ? "#efe0bd" : "#f6ead2", { roughness: 0.55, clearcoat: 0.35 });
      const top = new THREE.Mesh(new RoundedBoxGeometry(w - GAP, TILE_H, d - GAP, 2, 0.035), topMat);
      top.position.y = TILE_H / 2;
      top.castShadow = top.receiveShadow = true;
      top.userData.i = i;
      group.add(top);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(256 * w);
      canvas.height = Math.round(256 * d);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(w - GAP - 0.04, d - GAP - 0.04), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      label.rotation.x = -Math.PI / 2;
      label.position.y = TILE_H + 0.002;
      group.add(label);
      const extras = new THREE.Group();
      extras.position.y = TILE_H;
      group.add(extras);
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 20), plastic("#ffffff"));
      marker.visible = false;
      marker.castShadow = true;
      group.add(marker);
      this.scene.add(group);
      // Tiles pop in clockwise from Start.
      this.tiles.push({ group, top, topMat, label, tex, canvas, lift: 0, appear: 0.05 + i * 0.012, extras, marker });
    }
  }

  /** The real world, in Mappa's continent colours, as low plastic pieces in the middle of the board. */
  private buildWorld() {
    const [vx, vy, vw, vh] = MAP.viewBox;
    const scale = 8.2 / vw, cz = 0.35;
    const terr = MAP.territories as Record<string, { rings: number[][][] }>;
    const outline = new THREE.LineBasicMaterial({ color: 0x2a1c12, transparent: true, opacity: 0.45 });
    const side = plastic("#ead7a4", { roughness: 0.75, clearcoat: 0.1 });
    for (const c of CONTINENTS) {
      const top = plastic(c.color, { roughness: 0.45, clearcoat: 0.7 });
      const lines: number[] = [];
      for (const t of WORLD.filter((w) => w.continent === c.id)) {
        const shapes = terr[t.id].rings.map((ring) => {
          const pts = ring.map(([x, y]) => new THREE.Vector2((x - vx - vw / 2) * scale, -((y - vy - vh / 2) * scale + cz)));
          for (let k = 0; k < pts.length - 1; k++) lines.push(pts[k].x, 0.185, -pts[k].y, pts[k + 1].x, 0.185, -pts[k + 1].y);
          return new THREE.Shape(pts);
        });
        const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.12, bevelEnabled: false, curveSegments: 1 });
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, [top, side]);
        mesh.position.y = 0.06;
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
      this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(lines, 3)), outline));
    }
  }

  /** A little plane on its grand tour, circling the world. */
  private buildPlane() {
    const white = plastic("#f7f2e8"), red = plastic("#d9413a");
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 10), white);
    body.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.62), red);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), red);
    tail.position.set(-0.24, 0.08, 0);
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.22), red);
    tailWing.position.set(-0.25, 0.02, 0);
    const plane = new THREE.Group();
    plane.add(body, wing, tail, tailWing);
    plane.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.scene.add(plane);
    this.plane = plane;
  }

  private drawTitle() {
    const c = this.titleTex.image as HTMLCanvasElement, g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.font = "150px 'Paytone One', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 22;
    g.strokeStyle = "#0a1830";
    g.strokeText("grand tour", 470, 128);
    g.fillStyle = "#ffffff";
    g.fillText("grand tour", 470, 128);
    g.fillStyle = "#ffd24d";
    g.fillText(".", 470 + g.measureText("grand tour").width / 2 + 24, 128);
    this.titleTex.needsUpdate = true;
  }

  private buildDice() {
    const mats = FACE_VALUES.map((v) => new THREE.MeshPhysicalMaterial({ map: dieFace(v), roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }));
    const geo = new RoundedBoxGeometry(0.62, 0.62, 0.62, 4, 0.1);
    for (let k = 0; k < 2; k++) {
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.dice.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion() });
    }
  }

  // ---------- State ----------
  setState(s: TourState) {
    const prev = this.state;
    this.state = s;
    if (!prev || prev.labels !== s.labels || prev.prices !== s.prices) {
      this.tiles.forEach((_, i) => this.drawLabel(i));
      this.drawTitle();
    }
    if (!prev || prev.holdings !== s.holdings || prev.ownerColor !== s.ownerColor) this.tiles.forEach((_, i) => this.drawHolding(i));
    this.syncPawns(s);
    if (s.dice && s.dice.key !== this.diceKey) this.throwDice(s.dice.values, this.diceKey !== "");
    if (s.dice) this.diceKey = s.dice.key;
    else this.dice.forEach((d) => (d.mesh.visible = false));
  }
  setOptions(o: TourOptions) {
    this.opts = o;
    this.controls.enabled = o.interactive;
    this.controls.autoRotate = !!o.autoRotate && !this.reduced;
  }

  private drawLabel(i: number) {
    const t = this.tiles[i], s = this.state!, g = t.canvas.getContext("2d")!;
    const W = t.canvas.width, H = t.canvas.height, side = cellOf(i).side;
    g.clearRect(0, 0, W, H);
    const band = s.groupColors[i];
    // Colour band on the edge facing the middle of the board.
    let bandBox: [number, number, number, number] | null = null;
    if (band) {
      const k = 0.24;
      bandBox = side === "bottom" ? [0, 0, W, H * k] : side === "top" ? [0, H * (1 - k), W, H * k] : side === "left" ? [W * (1 - k * 0.7), 0, W * k * 0.7, H] : [0, 0, W * k * 0.7, H];
      g.fillStyle = band;
      g.beginPath();
      g.roundRect(...bandBox, 14);
      g.fill();
    }
    const area = { x: 14, y: 14, w: W - 28, h: H - 28 };
    if (bandBox) {
      if (side === "bottom") { area.y += bandBox[3]; area.h -= bandBox[3]; }
      if (side === "top") area.h -= bandBox[3];
      if (side === "left") area.w -= bandBox[2];
      if (side === "right") { area.x += bandBox[2]; area.w -= bandBox[2]; }
    }
    const corner = side === "corner";
    const font = (px: number, w = 800) => (w === 800 ? `${px}px 'Paytone One', system-ui, sans-serif` : `${w} ${px}px 'Nunito Sans', system-ui, sans-serif`);
    // Names as large as the square allows: at most two lines, shrunk until each line fits.
    let size = corner ? 64 : 58;
    let lines: string[] = [];
    for (; size > 24; size -= 2) {
      g.font = font(size);
      lines = [];
      for (const w of s.labels[i].split(" ")) {
        const last = lines.at(-1);
        if (last && g.measureText(last + " " + w).width <= area.w) lines[lines.length - 1] = last + " " + w;
        else lines.push(w);
      }
      if (lines.length <= 2 && lines.every((l) => g.measureText(l).width <= area.w)) break;
    }
    g.fillStyle = INK;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const price = s.prices[i];
    const sym = BOARD[i].kind;
    const glyph = sym === "chance" ? "?" : sym === "chest" ? "✦" : sym === "airport" ? "✈" : sym === "utility" ? "⚡" : sym === "tax" ? "§" : sym === "go" ? "→" : sym === "toJail" ? "!" : sym === "jail" ? "▦" : sym === "parking" ? "☂" : "";
    const lh = size * 1.05;
    const blockH = lines.length * lh + (glyph ? size * 1.3 : 0) + (price !== null && !corner ? size * 0.95 : 0);
    let y = area.y + area.h / 2 - blockH / 2;
    if (glyph) {
      g.font = `800 ${size * 1.25}px system-ui, sans-serif`;
      g.fillStyle = sym === "go" ? "#d79a00" : sym === "toJail" ? "#d9413a" : sym === "chance" ? "#e07a1f" : sym === "chest" ? "#2f7fd6" : "#6b5a4a";
      g.fillText(glyph, area.x + area.w / 2, y + size * 0.62);
      y += size * 1.3;
      g.font = font(size);
      g.fillStyle = INK;
    }
    for (const l of lines) {
      g.fillText(l, area.x + area.w / 2, y + lh / 2, area.w);
      y += lh;
    }
    if (price !== null && !corner) {
      g.font = font(Math.max(30, size * 0.78), 600);
      g.fillStyle = "#7a6a58";
      g.fillText(String(price), area.x + area.w / 2, y + size * 0.5);
    }
    t.tex.needsUpdate = true;
  }

  private drawHolding(i: number) {
    const t = this.tiles[i], s = this.state!, h = s.holdings[String(i)];
    const { w, d, side } = rectOf(i);
    t.extras.clear();
    t.topMat.color.set(h?.mortgaged ? "#b9ad98" : side === "corner" ? "#efe0bd" : "#f6ead2");
    t.marker.visible = !!h;
    if (h) {
      const c = s.ownerColor(h.owner);
      let m = this.markerMats.get(c);
      if (!m) this.markerMats.set(c, (m = plastic(c)));
      t.marker.material = m;
      // The owner's chip sits on the outer edge of the square.
      const edge = 0.2;
      t.marker.position.set(
        side === "left" ? -w / 2 + edge : side === "right" ? w / 2 - edge : 0,
        TILE_H + 0.025,
        side === "bottom" ? d / 2 - edge : side === "top" ? -d / 2 + edge : 0,
      );
    }
    if (!h?.houses) return;
    const along = side === "bottom" || side === "top";
    const bandAt = side === "bottom" ? -d / 2 + 0.12 : side === "top" ? d / 2 - 0.12 : side === "left" ? w / 2 - 0.12 : -w / 2 + 0.12;
    if (h.houses === 5) {
      const hotel = new THREE.Mesh(HOTEL_GEO, this.hotelMat);
      hotel.castShadow = true;
      if (along) hotel.position.set(0, 0, bandAt);
      else {
        hotel.rotation.y = Math.PI / 2;
        hotel.position.set(bandAt, 0, 0);
      }
      t.extras.add(hotel);
      return;
    }
    for (let k = 0; k < h.houses; k++) {
      const house = new THREE.Mesh(HOUSE_GEO, this.houseMat);
      house.castShadow = true;
      const o = (k - (h.houses - 1) / 2) * 0.21;
      if (along) house.position.set(o, 0, bandAt);
      else house.position.set(bandAt, 0, o);
      t.extras.add(house);
    }
  }

  private slot(i: number, k: number, n: number) {
    const { x, z } = rectOf(i);
    if (n <= 1) return new THREE.Vector3(x, TILE_H, z);
    const a = (k / n) * Math.PI * 2 + 0.6, r = 0.26;
    return new THREE.Vector3(x + Math.cos(a) * r, TILE_H, z + Math.sin(a) * r);
  }

  private syncPawns(s: TourState) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const p of s.pawns) {
      seen.add(p.id);
      let o = this.pawns.get(p.id);
      if (!o) {
        const mat = plastic(p.color);
        const mesh = new THREE.Mesh(PAWN_GEO, mat);
        mesh.castShadow = true;
        mesh.position.copy(this.slot(p.pos, 0, 1));
        this.scene.add(mesh);
        o = { mesh, mat, shown: p.pos, path: [], stepStart: now, hop: 0 };
        this.pawns.set(p.id, o);
      }
      o.mat.color.set(p.color);
      o.mesh.visible = !p.out;
      const mv = s.move;
      if (mv && mv.by === p.id && mv.to === p.pos && o.shown !== p.pos && !mv.jump && o.path.length === 0) {
        const forward = (mv.to - mv.from + SQUARES) % SQUARES;
        const steps = forward <= 12 ? forward : forward - SQUARES;
        o.shown = mv.from;
        o.path = Array.from({ length: Math.abs(steps) }, (_, k) => (mv.from + Math.sign(steps) * (k + 1) + SQUARES) % SQUARES);
        o.stepStart = now;
      } else if (o.path.length === 0 && o.shown !== p.pos) {
        // Jumps (jail, cards) fly in one bound.
        o.path = [p.pos];
        o.stepStart = now;
      }
    }
    for (const [id, o] of this.pawns)
      if (!seen.has(id)) {
        this.scene.remove(o.mesh);
        this.pawns.delete(id);
      }
  }

  private throwDice(values: [number, number], animate: boolean) {
    const now = performance.now();
    this.dice.forEach((d, k) => {
      d.to.set(-0.6 + k * 1.2, 0.06 + 0.31, -3.3 + k * 0.15);
      d.from.set(d.to.x + 2.4, 2.2, d.to.z + 2.2);
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
      d.q1.setFromEuler(UP[values[k]]).premultiply(yaw);
      d.q0.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      d.mesh.visible = true;
    });
    this.diceStart = animate && !this.reduced ? now : now - DICE_MS;
  }

  // ---------- Input ----------
  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hit = this.ray.intersectObjects(this.tiles.map((t) => t.top), false)[0];
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
    this.camera.updateProjectionMatrix();
    // Fit the whole board, seen from the front and above.
    const radius = HALF * (this.camera.aspect < 1.2 ? 1.14 : 1.04);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitV = radius / Math.tan(vfov / 2);
    const fitH = radius / (Math.tan(vfov / 2) * this.camera.aspect);
    const showcase = !!this.opts.showcase;
    const dist = Math.max(fitV, fitH) * (showcase ? 0.8 : 0.98);
    const polar = showcase ? 0.95 : 0.62;
    this.camera.position.set(0, Math.cos(polar) * dist, Math.sin(polar) * dist);
    this.controls.target.set(0, 0, 0.25);
    this.controls.minDistance = dist * 0.55;
    this.controls.maxDistance = dist * 1.25;
    this.controls.update();
  }

  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now(), t = (now - this.boot) / 1000;
    if (!this.reduced) this.waterTime.value = t;
    if (this.plane) {
      const a = this.reduced ? 0.6 : t * 0.35, rx = 3.7, rz = 2.4, cz = 0.35;
      this.plane.position.set(Math.cos(a) * rx, 1.25 + Math.sin(t * 1.3) * 0.08, cz + Math.sin(a) * rz);
      // Fly along the ellipse, banking into the turn.
      this.plane.rotation.set(0, -Math.atan2(Math.cos(a) * rz, -Math.sin(a) * rx), 0);
      this.plane.rotateX(-0.25);
    }
    const s = this.state;
    // Tiles: pop in, lift on hover and selection.
    this.tiles.forEach((tile, i) => {
      const k = this.reduced ? 1 : THREE.MathUtils.clamp((t - tile.appear) / 0.35, 0, 1);
      const pop = k < 1 ? easeBack(k) : 1;
      tile.group.scale.set(1, Math.max(0.001, pop), 1);
      const goal = i === s?.selected ? 0.14 : i === this.hover ? 0.08 : 0;
      tile.lift += (goal - tile.lift) * 0.3;
      tile.group.position.y = tile.lift;
      tile.topMat.emissive.set(i === s?.selected ? 0x4a3a10 : 0x000000);
    });
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
        if (o.path.length) {
          const k = Math.min(1, (now - o.stepStart) / HOP_MS);
          const target = o.path[0];
          const a = this.slot(o.shown, 0, 1), b = this.slot(target, 0, 1);
          o.mesh.position.lerpVectors(a, b, ease(k));
          o.mesh.position.y = TILE_H + Math.sin(k * Math.PI) * HOP_H;
          o.mesh.scale.set(1, 1 + Math.sin(k * Math.PI) * 0.12, 1);
          if (k >= 1) {
            o.shown = target;
            o.path.shift();
            o.stepStart = now;
          }
        } else {
          const here = crowd[o.shown] ?? [p.id];
          const goal = this.slot(o.shown, here.indexOf(p.id), here.length);
          o.mesh.position.lerp(goal, 0.25);
          o.mesh.position.y = TILE_H + this.tiles[o.shown].lift;
          o.mesh.scale.set(1, 1, 1);
        }
      }
    }
    // Dice: thrown from the side, tumbling, landing on their faces.
    if (this.diceStart !== null) {
      const k = Math.min(1, (now - this.diceStart) / DICE_MS);
      this.dice.forEach((d, j) => {
        const kk = Math.min(1, Math.max(0, k * 1.08 - j * 0.08));
        const e = ease(kk);
        d.mesh.position.lerpVectors(d.from, d.to, e);
        d.mesh.position.y = d.to.y + Math.abs(Math.cos(kk * Math.PI * 1.5)) * (1 - kk) * 1.6;
        d.mesh.quaternion.slerpQuaternions(d.q0, d.q1, Math.min(1, e * 1.05));
      });
    }
    this.controls.update();
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
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !SHARED.has(m.geometry)) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}
