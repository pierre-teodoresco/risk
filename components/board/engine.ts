// Three.js board: extruded territory pieces, plastic army figures, coins, arrow and effects.
// React-free on purpose: components/Board3D.tsx owns one instance and feeds it state.
import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import MAP from "@/lib/map-data.json";
import { CONTINENTS, COLORS, WORLD, type Lang } from "@/lib/world";

export type LandView = { color: number | null; troops: number };
export type Lands = Record<string, LandView>;
export type Arrow = { from: string; to: string; ghost: boolean } | null;
export type BoardOptions = {
  view: "players" | "continents";
  unitMode: "army" | "city";
  showNames: boolean;
  interactive: boolean;
  selected: string;
  target: string;
  legal: string[];
  /** Attack targets pulse red; destinations of a troop move pulse gold. */
  legalTone: "attack" | "move";
  highlight: string[];
  arrow: Arrow;
  lang: Lang;
  /** Screen space kept free for the HUD, in CSS pixels. */
  pad: { top: number; right: number; bottom: number; left: number };
};
export type Battle = { from: string; to: string; conquered: boolean; attackerLoss: number; defenderLoss: number };
type Callbacks = {
  onSelect: (id: string) => void;
  onHover: (id: string | null, x: number, y: number) => void;
  onFrame?: (project: (x: number, z: number) => { x: number; y: number }) => void;
};

const NEUTRAL = "#9aa3ad";
const DEPTH = 0.4;
const IDS = WORLD.map((t) => t.id);
const N = IDS.length;
const [VX, VY, VW, VH] = MAP.viewBox;
const S = 31 / VW;
export const toWorld = (px: number, py: number): [number, number] => [(px - VX - VW / 2) * S, (py - VY - VH / 2) * S];
const TERR = MAP.territories as Record<string, { center: number[]; area: number; rings: number[][][] }>;
const rand = (s: number) => {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const colorOf = (c: number | null) => (c === null ? NEUTRAL : COLORS[c]);

// ---------- Plastic army figures (shared with the HUD phase icons) ----------
function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  geo.rotateX(rx);
  geo.rotateY(ry);
  geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}
export const FIGURES = (() => {
  const infantry = mergeGeometries([
    at(new THREE.CylinderGeometry(0.075, 0.08, 0.025, 14), 0, 0.012, 0),
    at(new THREE.BoxGeometry(0.03, 0.11, 0.035), -0.02, 0.08, 0),
    at(new THREE.BoxGeometry(0.03, 0.11, 0.035), 0.02, 0.08, 0.01, -0.25),
    at(new THREE.BoxGeometry(0.08, 0.1, 0.045), 0, 0.18, 0),
    at(new THREE.SphereGeometry(0.03, 10, 8), 0, 0.255, 0),
    at(new THREE.SphereGeometry(0.038, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.262, 0),
    at(new THREE.BoxGeometry(0.022, 0.09, 0.022), -0.05, 0.19, 0.02, 0.6),
    at(new THREE.BoxGeometry(0.022, 0.09, 0.022), 0.05, 0.19, 0.03, 0.9),
    at(new THREE.BoxGeometry(0.014, 0.014, 0.19), 0.03, 0.22, 0.05, -0.5),
  ]);
  const cavalry = mergeGeometries([
    at(new THREE.BoxGeometry(0.26, 0.022, 0.11), 0, 0.011, 0),
    at(new THREE.BoxGeometry(0.2, 0.08, 0.075), 0, 0.14, 0),
    ...[[-0.07, -0.025], [-0.07, 0.025], [0.07, -0.025], [0.07, 0.025]].map(([x, z]) => at(new THREE.BoxGeometry(0.025, 0.1, 0.025), x, 0.07, z)),
    at(new THREE.BoxGeometry(0.045, 0.1, 0.045), 0.1, 0.2, 0, 0, 0, -0.55),
    at(new THREE.BoxGeometry(0.09, 0.038, 0.04), 0.15, 0.24, 0, 0, 0, -0.2),
    at(new THREE.BoxGeometry(0.02, 0.08, 0.02), -0.11, 0.13, 0, 0, 0, 0.5),
    at(new THREE.BoxGeometry(0.055, 0.09, 0.045), -0.01, 0.23, 0),
    at(new THREE.SphereGeometry(0.028, 10, 8), -0.01, 0.295, 0),
    at(new THREE.BoxGeometry(0.012, 0.012, 0.2), 0.05, 0.27, 0.04, 0, 0.3, -0.9),
  ]);
  const artillery = mergeGeometries([
    at(new THREE.BoxGeometry(0.28, 0.022, 0.13), 0, 0.011, 0),
    at(new THREE.CylinderGeometry(0.06, 0.06, 0.022, 14), 0, 0.075, 0.062, Math.PI / 2),
    at(new THREE.CylinderGeometry(0.06, 0.06, 0.022, 14), 0, 0.075, -0.062, Math.PI / 2),
    at(new THREE.CylinderGeometry(0.024, 0.032, 0.24, 12), 0.06, 0.12, 0, 0, 0, -1.25),
    at(new THREE.BoxGeometry(0.17, 0.03, 0.05), -0.07, 0.065, 0, 0, 0, 0.25),
    at(new THREE.SphereGeometry(0.03, 10, 8), 0, 0.11, 0),
  ]);
  return { infantry, cavalry, artillery };
})();

/** PNG snapshot of a figure, for HUD icons. */
export function figureIcon(kind: keyof typeof FIGURES, rotY: number) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(192, 192);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x2a3f66, 1.5));
  const dl = new THREE.DirectionalLight(0xffffff, 2.4);
  dl.position.set(-2, 4, 3);
  sc.add(dl);
  const geo = FIGURES[kind].clone();
  geo.computeBoundingBox();
  const bb = geo.boundingBox!, size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xf3e6c8, roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.2 }));
  m.rotation.y = rotY;
  sc.add(m);
  const d = Math.max(size.x, size.y, size.z) * 2.05;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  cam.position.set(d * 0.1, d * 0.45, d * 0.9);
  cam.lookAt(0, 0, 0);
  r.render(sc, cam);
  const url = r.domElement.toDataURL("image/png");
  geo.dispose();
  r.dispose();
  r.forceContextLoss();
  return url;
}

const SPOTS = [[0, 0.08], [0.42, 0.24], [-0.42, 0.24], [0.02, -0.38], [0.46, -0.2], [-0.45, -0.2], [0.2, 0.56], [-0.22, 0.56], [0.62, 0.48], [-0.62, 0.48]];
type Fx = { kind: "burst" | "smoke"; obj: THREE.Points | THREE.Mesh; vel: number[][] | number[]; life: number; age: number };

export class BoardEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  private controls: MapControls;
  private pieces: THREE.Mesh[] = [];
  private groups: THREE.Group[] = [];
  private coins: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; sp: THREE.Sprite; pop: number }[] = [];
  private names: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; sp: THREE.Sprite }[] = [];
  private lift = new Array(N).fill(0);
  private appear: number[] = [];
  private flipAt = new Array(N).fill(-1);
  private flipColor: (THREE.Color | null)[] = new Array(N).fill(null);
  private unitScale: number[];
  private lands: Lands = {};
  private opts: BoardOptions;
  private hover = -1;
  private fx: Fx[] = [];
  private shake = 0;
  private shakeOffset = new THREE.Vector3();
  private arc: { key: string; group: THREE.Group; meshes: THREE.Mesh[]; start: number; ghost: boolean } | null = null;
  private plastic = COLORS.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25 }));
  private neutralPlastic = new THREE.MeshPhysicalMaterial({ color: NEUTRAL, roughness: 0.5, clearcoat: 0.4 });
  private roofs = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, flatShading: true }));
  private neutralRoof = new THREE.MeshStandardMaterial({ color: NEUTRAL, roughness: 0.6, flatShading: true });
  private wallMat = new THREE.MeshStandardMaterial({ color: 0xf6ead2, roughness: 0.7, flatShading: true });
  private winMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffb43b, emissiveIntensity: 0.6 });
  private lineMats: LineMaterial[] = [];
  private ocean: THREE.Mesh;
  private oceanBase: Float32Array;
  private boot = performance.now() / 1000;
  private raf = 0;
  private resizeObs: ResizeObserver;
  private ray = new THREE.Raycaster();
  private down: [number, number] | null = null;
  private tmp = new THREE.Color();
  private disposed = false;

  constructor(private host: HTMLElement, private cb: Callbacks, opts: BoardOptions) {
    this.opts = opts;
    this.unitScale = IDS.map((id) => THREE.MathUtils.clamp(Math.sqrt(TERR[id].area) / 95, 0.58, 1));
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.style.display = "block";
    r.domElement.style.touchAction = "none";
    host.appendChild(r.domElement);

    const sea = new THREE.Color("#0b2443");
    this.scene.background = sea;
    this.scene.fog = new THREE.Fog(sea, 34, 64);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3b7486, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.4);
    sun.position.set(-9, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 13, bottom: -13, near: 1, far: 50 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    const oceanGeo = new THREE.PlaneGeometry(80, 56, 110, 78);
    oceanGeo.rotateX(-Math.PI / 2);
    this.ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({ color: 0x2b8cc6, roughness: 0.3, metalness: 0.05, flatShading: true }));
    this.ocean.position.y = -0.04;
    this.ocean.receiveShadow = true;
    this.scene.add(this.ocean);
    this.oceanBase = (oceanGeo.attributes.position.array as Float32Array).slice();

    this.buildPieces();
    this.buildSeaRoutes();
    this.buildLabels();

    this.controls = new MapControls(this.camera, r.domElement);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.2,
      minDistance: 7,
      maxDistance: 40,
      minPolarAngle: 0.05,
      maxPolarAngle: 0.85,
      minAzimuthAngle: -0.7,
      maxAzimuthAngle: 0.7,
      screenSpacePanning: false,
      zoomToCursor: true,
      zoomSpeed: 3,
    });
    this.controls.addEventListener("change", () => {
      const t = this.controls.target,
        cx = THREE.MathUtils.clamp(t.x, -15, 15),
        cz = THREE.MathUtils.clamp(t.z, -9, 9);
      if (cx !== t.x || cz !== t.z) {
        this.camera.position.x += cx - t.x;
        this.camera.position.z += cz - t.z;
        t.set(cx, 0, cz);
      }
    });

    const el = r.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.resizeObs = new ResizeObserver(() => this.resize(true));
    this.resizeObs.observe(host);
    this.resize(true);
    this.applyOptions();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- Build ----------
  private buildPieces() {
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xead7a4, roughness: 0.75 });
    const outline = new LineMaterial({ color: 0x2a1c12, linewidth: 1.7, transparent: true, opacity: 0.75 });
    const glow = new LineMaterial({ color: 0x9fe3ff, linewidth: 9, transparent: true, opacity: 0.28, depthWrite: false });
    this.lineMats.push(outline, glow);
    const glowPos: number[] = [];
    IDS.forEach((id, t) => {
      const [cx, cz] = toWorld(TERR[id].center[0], TERR[id].center[1]);
      const shapes = TERR[id].rings.map((ring) => new THREE.Shape(ring.map(([x, y]) => {
        const [wx, wz] = toWorld(x, y);
        return new THREE.Vector2(wx - cx, -(wz - cz));
      })));
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      const top = new THREE.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22, color: NEUTRAL });
      const piece = new THREE.Mesh(geo, [top, sideMat]);
      piece.position.set(cx, 0, cz);
      piece.castShadow = piece.receiveShadow = true;
      piece.userData.t = t;
      const pos: number[] = [];
      for (const ring of TERR[id].rings)
        for (let k = 0; k < ring.length - 1; k++) {
          const [ax, az] = toWorld(ring[k][0], ring[k][1]), [bx, bz] = toWorld(ring[k + 1][0], ring[k + 1][1]);
          pos.push(ax - cx, DEPTH + 0.004, az - cz, bx - cx, DEPTH + 0.004, bz - cz);
          glowPos.push(ax, 0.02, az, bx, 0.02, bz);
        }
      piece.add(new LineSegments2(new LineSegmentsGeometry().setPositions(pos), outline));
      this.scene.add(piece);
      this.pieces.push(piece);
      this.appear.push(0.1 + ((cx + 16) / 32) * 0.6 + rand(t) * 0.08);
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      this.scene.add(g);
      this.groups.push(g);
    });
    const halo = new LineSegments2(new LineSegmentsGeometry().setPositions(glowPos), glow);
    halo.renderOrder = -1;
    this.scene.add(halo);
    // Faint navigation lines across the sea.
    const web: number[] = [];
    for (let k = 0; k < 46; k++) {
      const a = rand(k * 2.7) * Math.PI, cx = (rand(k * 5.1) - 0.5) * 50, cz = (rand(k * 3.3) - 0.5) * 34;
      web.push(cx - Math.cos(a) * 40, 0.03, cz - Math.sin(a) * 40, cx + Math.cos(a) * 40, 0.03, cz + Math.sin(a) * 40);
    }
    this.scene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(web, 3)),
      new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.13 }),
    ));
  }

  private buildSeaRoutes() {
    const dash = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.14, gapSize: 0.12, transparent: true, opacity: 0.8 });
    for (const [a, b] of MAP.sea as [string, string][]) {
      const [ax, az] = toWorld(TERR[a].center[0], TERR[a].center[1]), [bx, bz] = toWorld(TERR[b].center[0], TERR[b].center[1]);
      // The Bering route leaves the board on both sides instead of crossing the whole world.
      const segs: [number, number, number, number][] = Math.abs(bx - ax) > 20
        ? [[ax, az, ax + Math.sign(bx - ax) * -2.4, az - 0.2], [bx, bz, bx + Math.sign(ax - bx) * -2.4, bz - 0.2]]
        : [[ax, az, bx, bz]];
      for (const [x1, z1, x2, z2] of segs) {
        const d = Math.hypot(x2 - x1, z2 - z1);
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x1, 0.12, z1), new THREE.Vector3((x1 + x2) / 2, 0.12 + d * 0.18, (z1 + z2) / 2), new THREE.Vector3(x2, 0.12, z2));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), dash);
        line.computeLineDistances();
        this.scene.add(line);
      }
    }
  }

  private sprite(w: number, h: number, sx: number, sy: number, order: number) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(sx, sy, 1);
    sp.renderOrder = order;
    sp.visible = false;
    this.scene.add(sp);
    return { canvas, tex, sp };
  }

  private buildLabels() {
    for (let t = 0; t < N; t++) {
      this.coins.push({ ...this.sprite(128, 128, 0.8, 0.8, 10), pop: 0 });
      this.names.push(this.sprite(512, 96, 2.45, 0.46, 11));
    }
    this.drawNames();
  }

  // ---------- State ----------
  setLands(next: Lands, intro = false) {
    const now = performance.now() / 1000;
    IDS.forEach((id, t) => {
      const before = this.lands[id], after = next[id] ?? { color: null, troops: 0 };
      if (before && before.color !== after.color) {
        this.flipColor[t] = this.baseColor(t, before.color);
        this.flipAt[t] = now;
      }
      if (!before || before.color !== after.color || before.troops !== after.troops) {
        this.lands[id] = { ...after };
        this.buildUnits(t, intro || !before || before.color !== after.color);
        this.drawCoin(t);
      }
    });
  }

  setOptions(opts: BoardOptions) {
    const prev = this.opts;
    this.opts = opts;
    if (prev.unitMode !== opts.unitMode) for (let t = 0; t < N; t++) this.buildUnits(t, true);
    if (prev.lang !== opts.lang) this.drawNames();
    if (prev.pad.left !== opts.pad.left || prev.pad.right !== opts.pad.right || prev.pad.bottom !== opts.pad.bottom || prev.pad.top !== opts.pad.top) this.resize(true);
    this.applyOptions();
  }

  private applyOptions() {
    const { arrow, interactive } = this.opts;
    this.controls.enabled = interactive;
    if (!arrow) this.clearArrow();
    else this.showArrow(arrow.from, arrow.to, arrow.ghost);
  }

  /** Smoke, sparks and shake on the attacked territory; confetti when it changes hands. */
  battle(b: Battle) {
    const t = IDS.indexOf(b.to);
    if (t < 0) return;
    const [x, z] = toWorld(TERR[b.to].center[0], TERR[b.to].center[1]);
    const hits = Math.min(6, Math.max(1, Math.ceil((b.attackerLoss + b.defenderLoss) / 2)));
    for (let k = 0; k < hits; k++)
      setTimeout(() => {
        if (this.disposed) return;
        this.burst(x, this.topY(t) + 0.2, z, 0xffc04a, 40, 2.2, 0.07);
        this.smoke(x, this.topY(t) + 0.1, z);
        this.shake = 0.12;
      }, k * 170);
    if (b.conquered)
      setTimeout(() => {
        if (this.disposed) return;
        const c = this.lands[b.to]?.color ?? null;
        this.burst(x, this.topY(t) + 0.4, z, new THREE.Color(colorOf(c)), 120, 3.2, 0.11);
        this.burst(x, this.topY(t) + 0.4, z, 0xffffff, 60, 2.8, 0.08);
        this.shake = 0.3;
      }, hits * 170);
  }

  /** Small celebration when armies land on a territory (deployment, fortification). */
  pulse(id: string) {
    const t = IDS.indexOf(id);
    if (t < 0) return;
    const [x, z] = toWorld(TERR[id].center[0], TERR[id].center[1]);
    this.burst(x, this.topY(t) + 0.3, z, new THREE.Color(colorOf(this.lands[id]?.color ?? null)), 24, 1.6, 0.07);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- Units and labels ----------
  private topY(t: number) {
    return this.pieces[t].position.y + DEPTH;
  }

  private dropStart(t: number) {
    return Math.max(performance.now() / 1000, this.boot + 0.75 + this.appear[t]);
  }

  private buildUnits(t: number, drop: boolean) {
    const g = this.groups[t];
    g.clear();
    const land = this.lands[IDS[t]];
    if (!land || land.troops <= 0) return;
    const n = land.troops, s = this.unitScale[t];
    if (this.opts.unitMode === "army") {
      const items: THREE.BufferGeometry[] = [];
      for (let k = 0; k < Math.floor(n / 10); k++) items.push(FIGURES.artillery);
      for (let k = 0; k < Math.floor((n % 10) / 5); k++) items.push(FIGURES.cavalry);
      for (let k = 0; k < n % 5; k++) items.push(FIGURES.infantry);
      const mat = land.color === null ? this.neutralPlastic : this.plastic[land.color];
      items.slice(0, SPOTS.length).forEach((geo, k) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(SPOTS[k][0] * s, 0, SPOTS[k][1] * s);
        m.rotation.y = -0.9 + rand(t * 10 + k) * 0.6;
        m.scale.setScalar((geo === FIGURES.infantry ? 2.6 : 2.2) * s);
        m.castShadow = true;
        m.userData.dropAt = drop ? this.dropStart(t) + k * 0.035 : 0;
        g.add(m);
      });
    } else {
      // A town grows with the garrison: more houses, then a taller keep.
      const roof = land.color === null ? this.neutralRoof : this.roofs[land.color];
      const houses = Math.min(SPOTS.length - 1, 1 + Math.floor(n / 2));
      const add = (x: number, z: number, w: number, h: number, k: number) => {
        const b = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), this.wallMat);
        body.position.y = h / 2;
        body.castShadow = body.receiveShadow = true;
        const top = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, w * 0.7, 4), roof);
        top.position.y = h + w * 0.35;
        top.rotation.y = Math.PI / 4;
        top.castShadow = true;
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, Math.min(0.04, h * 0.25), 0.004), this.winMat);
        win.position.set(0, h * 0.6, w / 2 + 0.002);
        b.add(body, top, win);
        b.position.set(x * s, 0, z * s);
        b.scale.setScalar(s);
        b.rotation.y = rand(t * 7 + k) * 0.6 - 0.3;
        b.userData.dropAt = drop ? this.dropStart(t) + k * 0.035 : 0;
        g.add(b);
      };
      add(SPOTS[0][0], SPOTS[0][1], 0.15, 0.14 + Math.min(n, 20) * 0.032, 0);
      for (let k = 1; k <= houses; k++) add(SPOTS[k][0], SPOTS[k][1], 0.1 + rand(k + t) * 0.04, 0.07 + rand(k * 3 + t) * 0.07, k);
    }
  }

  private drawCoin(t: number) {
    const coin = this.coins[t], land = this.lands[IDS[t]];
    const g = coin.canvas.getContext("2d")!;
    g.clearRect(0, 0, 128, 128);
    if (!land || land.troops <= 0) {
      coin.tex.needsUpdate = true;
      return;
    }
    const col = colorOf(land.color);
    const dark = "#" + new THREE.Color(col).multiplyScalar(0.55).getHexString();
    g.fillStyle = "#00000055"; g.beginPath(); g.arc(64, 70, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = dark; g.beginPath(); g.arc(64, 66, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(64, 60, 50, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = "#0b0f17"; g.beginPath(); g.arc(64, 62, 52, 0, Math.PI * 2); g.stroke();
    const hl = g.createLinearGradient(0, 14, 0, 70);
    hl.addColorStop(0, "#ffffff70");
    hl.addColorStop(1, "#ffffff00");
    g.fillStyle = hl; g.beginPath(); g.ellipse(64, 40, 36, 22, 0, 0, Math.PI * 2); g.fill();
    const text = String(land.troops);
    g.font = `${text.length > 2 ? 44 : text.length > 1 ? 54 : 62}px 'Paytone One', sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 10; g.strokeStyle = "#0b0f17"; g.lineJoin = "round"; g.strokeText(text, 64, 64);
    g.fillStyle = "#fff"; g.fillText(text, 64, 64);
    coin.tex.needsUpdate = true;
    coin.pop = performance.now() / 1000;
  }

  private drawNames() {
    IDS.forEach((id, t) => {
      const { canvas, tex } = this.names[t];
      const g = canvas.getContext("2d")!;
      g.clearRect(0, 0, 512, 96);
      g.font = "800 50px 'Nunito Sans', sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 12; g.strokeStyle = "#fff7e8"; g.lineJoin = "round";
      const label = WORLD[t][this.opts.lang];
      g.strokeText(label, 256, 50, 490);
      g.fillStyle = "#2b211b"; g.fillText(label, 256, 50, 490);
      tex.needsUpdate = true;
    });
  }

  /** Redraw canvases once web fonts are ready. */
  refreshText() {
    for (let t = 0; t < N; t++) this.drawCoin(t);
    this.drawNames();
  }

  // ---------- Colours ----------
  private baseColor(t: number, color: number | null) {
    const c = new THREE.Color(this.opts.view === "continents" ? CONTINENTS.find((x) => x.id === WORLD[t].continent)!.color : colorOf(color));
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return c.setHSL(hsl.h, hsl.s * 0.95, THREE.MathUtils.clamp(hsl.l + (rand(t * 3.1) - 0.5) * 0.1, 0.15, 0.8));
  }

  private paint(t: number, now: number) {
    const id = IDS[t], o = this.opts;
    const c = this.tmp.copy(this.flipColor[t] ?? this.baseColor(t, this.lands[id]?.color ?? null));
    if (t === this.hover && o.interactive) c.lerp(new THREE.Color(0xffffff), 0.2);
    if (o.highlight.includes(id)) c.lerp(new THREE.Color(0xffd24d), 0.35 + 0.15 * Math.sin(now * 5));
    const tone = new THREE.Color(o.legalTone === "move" ? 0xffe27a : 0xff5a4e);
    if (id === o.target) c.lerp(tone, 0.55);
    else if (o.legal.includes(id)) c.lerp(tone, 0.3 + 0.2 * Math.sin(now * 9));
    if (id === o.selected) c.lerp(new THREE.Color(0xffffff), 0.25);
    ((this.pieces[t].material as THREE.Material[])[0] as THREE.MeshPhysicalMaterial).color.copy(c);
  }

  // ---------- Arrow ----------
  private ribbon(curve: THREE.QuadraticBezierCurve3, width: number, headLen: number, headWidth: number, lift: number) {
    const n = 48, pos: number[] = [], idx: number[] = [], L = curve.getLength(), tEnd = 1 - Math.min(0.5, headLen / L);
    const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt((tEnd * i) / n);
      side.crossVectors(curve.getTangentAt((tEnd * i) / n), up).normalize().multiplyScalar(width / 2);
      pos.push(p.x + side.x, p.y + lift, p.z + side.z, p.x - side.x, p.y + lift, p.z - side.z);
      if (i) {
        const k = (i - 1) * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const base = curve.getPointAt(tEnd), tip = curve.getPointAt(1), k = pos.length / 3;
    side.crossVectors(curve.getTangentAt(tEnd), up).normalize().multiplyScalar(headWidth / 2);
    pos.push(base.x + side.x, base.y + lift, base.z + side.z, base.x - side.x, base.y + lift, base.z - side.z, tip.x, tip.y + lift, tip.z);
    idx.push(k, k + 1, k + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.userData.body = n * 6;
    return g;
  }

  private showArrow(from: string, to: string, ghost: boolean) {
    const key = `${from}>${to}>${ghost}`;
    if (this.arc?.key === key) return;
    this.clearArrow();
    const a = IDS.indexOf(from), d = IDS.indexOf(to);
    if (a < 0 || d < 0) return;
    const [ax, az] = toWorld(TERR[from].center[0], TERR[from].center[1]), [dx, dz] = toWorld(TERR[to].center[0], TERR[to].center[1]);
    const dist = Math.hypot(dx - ax, dz - az);
    const dir = new THREE.Vector3(dx - ax, 0, dz - az).normalize();
    const p0 = new THREE.Vector3(ax, this.topY(a) + 0.5, az).addScaledVector(dir, 0.3);
    const p1 = new THREE.Vector3(dx, this.topY(d) + 0.5, dz).addScaledVector(dir, -0.42);
    const curve = new THREE.QuadraticBezierCurve3(p0, new THREE.Vector3((ax + dx) / 2, Math.max(this.topY(a), this.topY(d)) + 0.9 + dist * 0.18, (az + dz) / 2), p1);
    const mat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
    const edge = new THREE.Mesh(this.ribbon(curve, 0.36, 0.72, 0.92, -0.012), mat(0x0a1830, ghost ? 0.35 : 1));
    const fill = new THREE.Mesh(this.ribbon(curve, 0.22, 0.6, 0.72, 0), mat(0xffffff, ghost ? 0.55 : 1));
    edge.geometry.translate(dir.x * 0.06, 0, dir.z * 0.06);
    fill.renderOrder = 3;
    edge.renderOrder = 2;
    edge.castShadow = !ghost;
    for (const m of [edge, fill]) m.geometry.setDrawRange(0, 0);
    const group = new THREE.Group();
    group.add(edge, fill);
    this.scene.add(group);
    this.arc = { key, group, meshes: [edge, fill], start: performance.now() / 1000, ghost };
  }

  private clearArrow() {
    if (!this.arc) return;
    this.scene.remove(this.arc.group);
    for (const m of this.arc.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.arc = null;
  }

  // ---------- Effects ----------
  private burst(x: number, y: number, z: number, color: THREE.ColorRepresentation, count: number, speed: number, size: number) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), vel: number[][] = [];
    for (let k = 0; k < count; k++) {
      pos.set([x, y, z], k * 3);
      const a = Math.random() * Math.PI * 2, up = 0.6 + Math.random();
      vel.push([Math.cos(a) * speed * Math.random(), up * speed, Math.sin(a) * speed * Math.random()]);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true }));
    this.scene.add(pts);
    this.fx.push({ kind: "burst", obj: pts, vel, life: 1.1, age: 0 });
  }

  private smoke(x: number, y: number, z: number) {
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0xd9d2c6, flatShading: true, transparent: true, opacity: 0.9 }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
      this.scene.add(m);
      this.fx.push({ kind: "smoke", obj: m, vel: [(Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4], life: 1.3, age: 0 });
    }
  }

  // ---------- Camera ----------
  private resize(refit: boolean) {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const m of this.lineMats) m.resolution.set(w, h);
    if (refit) this.fit(w, h);
  }

  /** Frames the whole map inside the area the HUD leaves free. */
  private fit(w: number, h: number) {
    const { pad } = this.opts;
    const freeW = Math.max(120, w - pad.left - pad.right), freeH = Math.max(120, h - pad.top - pad.bottom);
    const tilt = 0.34, vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const mapW = VW * S + 1, mapH = VH * S + 1;
    const tanV = Math.tan(vfov / 2), tanH = tanV * (w / h);
    const fitW = (mapW / 2) / (tanH * (freeW / w)), fitH = (mapH * Math.cos(tilt) / 2) / (tanV * (freeH / h));
    // On portrait screens fit the height and let the player drag sideways, instead of a tiny map.
    const dist = (w < h ? Math.max(fitH, fitW * 0.5) : Math.max(fitW, fitH)) * 1.02;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist + 10;
    fog.far = dist + 40;
    // Shift the target so the map is centred in the free area, not the whole canvas.
    const shiftX = ((pad.right - pad.left) / 2 / w) * 2 * dist * tanH;
    const shiftZ = ((pad.bottom - pad.top) / 2 / h) * 2 * dist * tanV / Math.cos(tilt);
    const target = new THREE.Vector3(shiftX, 0, shiftZ + 0.3);
    this.controls?.target.copy(target);
    this.camera.position.set(target.x, target.y + dist * Math.cos(tilt), target.z + dist * Math.sin(tilt));
    this.camera.lookAt(target);
    if (this.controls) this.controls.maxDistance = Math.max(40, dist * 1.3);
  }

  // ---------- Pointer ----------
  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(p, this.camera);
    const hit = this.ray.intersectObjects(this.pieces, false)[0];
    return hit ? (hit.object.userData.t as number) : -1;
  }
  private onMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const t = this.pick(e);
    this.hover = t;
    this.renderer.domElement.style.cursor = t >= 0 && this.opts.interactive ? "pointer" : "";
    this.cb.onHover(t >= 0 ? IDS[t] : null, e.clientX, e.clientY);
  };
  private onLeave = () => {
    this.hover = -1;
    this.cb.onHover(null, 0, 0);
  };
  private onDown = (e: PointerEvent) => {
    this.down = [e.clientX, e.clientY];
  };
  private onUp = (e: PointerEvent) => {
    if (!this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 6) return;
    this.down = null;
    const t = this.pick(e);
    if (t >= 0 && this.opts.interactive) this.cb.onSelect(IDS[t]);
  };

  private project = (x: number, z: number) => {
    const v = new THREE.Vector3(x, 0.9, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight };
  };

  // ---------- Loop ----------
  private last = performance.now();
  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const nowMs = performance.now(), now = nowMs / 1000, dt = Math.min((nowMs - this.last) / 1000, 0.05);
    this.last = nowMs;
    const el = now - this.boot, o = this.opts;

    const p = this.ocean.geometry.attributes.position.array as Float32Array, b = this.oceanBase;
    for (let k = 0; k < p.length; k += 3) p[k + 1] = Math.sin(b[k] * 0.55 + now * 0.9) * 0.05 + Math.cos(b[k + 2] * 0.7 + now * 1.2) * 0.04;
    this.ocean.geometry.attributes.position.needsUpdate = true;
    this.ocean.geometry.computeVertexNormals();

    for (let t = 0; t < N; t++) {
      const id = IDS[t];
      const want = (id === o.selected ? 0.2 : 0) + (t === this.hover && o.interactive ? 0.08 : 0) + (id === o.target ? 0.14 : o.legal.includes(id) ? 0.05 : 0);
      this.lift[t] += (want - this.lift[t]) * Math.min(1, dt * 24);
      const m = this.pieces[t], k = THREE.MathUtils.clamp((el - this.appear[t]) / 0.32, 0, 1), e = 1 - Math.pow(1 - k, 3);
      let hop = 0, spin = 0;
      if (this.flipAt[t] >= 0) {
        const q = (now - this.flipAt[t]) / 0.42;
        if (q >= 1) {
          this.flipAt[t] = -1;
          this.flipColor[t] = null;
        } else {
          hop = Math.sin(Math.PI * q) * 0.55;
          spin = (1 - Math.pow(1 - q, 3)) * Math.PI * 2;
          if (q > 0.4) this.flipColor[t] = null;
        }
      }
      m.position.y = this.lift[t] + hop + (1 - e) * 2.5;
      m.rotation.y = spin;
      m.visible = k > 0;
      this.paint(t, now);

      const g = this.groups[t];
      g.position.y = this.topY(t);
      for (const u of g.children) {
        const at0 = u.userData.dropAt as number;
        if (!at0) continue;
        const q = (now - at0) / 0.2;
        u.visible = q >= 0;
        if (q < 0) continue;
        const kk = Math.min(1, q);
        u.position.y = (1 - kk) * (1 - kk) * 0.9;
        if (kk === 1) u.userData.dropAt = 0;
      }
      const s = this.unitScale[t];
      const coin = this.coins[t];
      coin.sp.position.set(g.position.x, this.topY(t) + (o.unitMode === "city" ? 1.15 : 1.05), g.position.z - 0.05);
      coin.sp.visible = now > this.boot + 0.7 + this.appear[t] && (this.lands[id]?.troops ?? 0) > 0;
      const pop = Math.min(1, (now - coin.pop) / 0.22), ps = 1 + 0.35 * Math.sin(Math.PI * pop);
      coin.sp.scale.set(0.8 * ps, 0.8 * ps, 1);
      const name = this.names[t];
      name.sp.position.set(g.position.x, this.topY(t) + 0.25, g.position.z + 0.7 * s);
      name.sp.visible = o.showNames && now > this.boot + 1;
    }

    if (this.arc) {
      const q = Math.min(1, (now - this.arc.start) / 0.18);
      for (const m of this.arc.meshes) m.geometry.setDrawRange(0, q < 1 ? Math.floor(((m.geometry.userData.body as number) * q) / 3) * 3 : m.geometry.index!.count);
      this.arc.group.position.y = this.arc.ghost ? 0 : Math.sin(now * 6) * 0.04;
    }

    for (let k = this.fx.length - 1; k >= 0; k--) {
      const f = this.fx[k];
      f.age += dt;
      if (f.kind === "burst") {
        const pos = (f.obj as THREE.Points).geometry.attributes.position.array as Float32Array;
        (f.vel as number[][]).forEach((v, j) => {
          v[1] -= 6 * dt;
          pos[j * 3] += v[0] * dt;
          pos[j * 3 + 1] = Math.max(0.3, pos[j * 3 + 1] + v[1] * dt);
          pos[j * 3 + 2] += v[2] * dt;
        });
        (f.obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
        ((f.obj as THREE.Points).material as THREE.PointsMaterial).opacity = 1 - f.age / f.life;
      } else {
        const v = f.vel as number[];
        f.obj.position.x += v[0] * dt;
        f.obj.position.y += v[1] * dt;
        f.obj.position.z += v[2] * dt;
        f.obj.scale.setScalar(1 + f.age * 2.2);
        ((f.obj as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.9 * (1 - f.age / f.life);
      }
      if (f.age >= f.life) {
        this.scene.remove(f.obj);
        f.obj.geometry.dispose();
        ((f.obj as THREE.Mesh).material as THREE.Material).dispose();
        this.fx.splice(k, 1);
      }
    }

    this.camera.position.sub(this.shakeOffset);
    this.controls.update();
    this.shake *= 0.78;
    this.shakeOffset.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.camera.position.add(this.shakeOffset);
    this.renderer.render(this.scene, this.camera);
    this.cb.onFrame?.(this.project);
  };
}
