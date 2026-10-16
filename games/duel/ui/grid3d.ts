// A square board in 3D for two-player games (chess 8×8, draughts 10×10), in the family's plastic
// look: a sand-edged slab floating on Mappa's sea, plastic squares and pieces. Pieces glide or hop
// to where the server put them, captured ones fly away. React-free: GridBoard.tsx owns it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type GridConfig = {
  size: number;
  light: string;
  dark: string;
  /** Builds the 3D piece for a cell value ("wp", "bk"…). */
  piece: (kind: string) => THREE.Object3D;
  /** Edge labels, by column and by row, or none. */
  labels?: { cols: string[]; rows: string[] };
};
export type GridState = {
  cells: (string | null)[];
  /** Seen from Black's side. */
  flipped: boolean;
  selected: number | null;
  /** Squares the selected piece may go to; captures are drawn as rings. */
  targets: number[];
  captures: number[];
  /** The last move's squares, tinted. */
  last: number[];
  /** A king in check. */
  danger: number | null;
  /** The last move's stops and when it was played, to animate it once. */
  move: { path: number[]; at: number } | null;
  interactive: boolean;
  /** Slowly circles the board, for posters. */
  spin?: boolean;
};
type Segment = { from: THREE.Vector3; to: THREE.Vector3; start: number; dur: number; hop: number };
type PieceObj = { obj: THREE.Object3D; kind: string; square: number; segs: Segment[]; born: number; dying: number | null };

const SLAB_H = 0.42, TILE_H = 0.12, FRAME = 0.62;
const SLIDE_MS = 220, HOP_MS = 260, DEATH_MS = 380, POP_MS = 320;
export const plastic = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.36, clearcoat: 0.85, clearcoatRoughness: 0.22, ...extra });
const TARGET_GEO = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 24);
const CAPTURE_GEO = new THREE.TorusGeometry(0.4, 0.045, 10, 36);
const DANGER_GEO = new THREE.CircleGeometry(0.48, 32);
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

export class GridBoardEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private controls: OrbitControls;
  private squares: THREE.Mesh[] = [];
  private squareMats: THREE.MeshPhysicalMaterial[] = [];
  private markers = new THREE.Group();
  private pieces = new Map<number, PieceObj>();
  private dying: PieceObj[] = [];
  private state: GridState | null = null;
  private seenMove = 0;
  private hover = -1;
  private ray = new THREE.Raycaster();
  private down: [number, number] | null = null;
  private raf = 0;
  private resizeObs: ResizeObserver;
  private disposed = false;
  private waterTime = { value: 0 };
  private boot = performance.now();
  private flipped: boolean | null = null;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private targetMat = new THREE.MeshBasicMaterial({ color: 0x2ec4c4, transparent: true, opacity: 0.85 });
  private captureMat = new THREE.MeshBasicMaterial({ color: 0xff6b5c, transparent: true, opacity: 0.9 });
  private dangerMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55, depthWrite: false });

  constructor(private host: HTMLElement, private cfg: GridConfig, private onSquare: (i: number) => void) {
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
    this.scene.fog = new THREE.Fog(sea, 22, 55);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3b7486, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.5);
    sun.position.set(-6, 13, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const half = cfg.size / 2 + FRAME + 1;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 0.5);
    rim.position.set(7, 5, -9);
    this.scene.add(rim);

    this.buildSea();
    this.buildBoard();
    this.scene.add(this.markers);

    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.14, enablePan: false, minPolarAngle: 0.15, maxPolarAngle: 1.1, rotateSpeed: 0.7, zoomSpeed: 1.2 });
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
  private buildSea() {
    const geo = new THREE.PlaneGeometry(140, 140, 1, 1);
    geo.rotateX(-Math.PI / 2);
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
          diffuseColor.rgb *= 1.0 + tide * 0.06;
          diffuseColor.rgb += vec3(0.02, 0.04, 0.05) * glint;
        `);
    };
    const ocean = new THREE.Mesh(geo, water);
    ocean.position.y = -SLAB_H * 0.6;
    ocean.receiveShadow = true;
    this.scene.add(ocean);
  }

  private buildBoard() {
    const n = this.cfg.size, w = n + FRAME * 2;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(w, SLAB_H, w, 4, 0.14), plastic("#ead7a4", { roughness: 0.75, clearcoat: 0.1 }));
    slab.position.y = -SLAB_H / 2;
    slab.castShadow = slab.receiveShadow = true;
    this.scene.add(slab);
    if (this.cfg.labels) this.buildLabels();
    const geo = new RoundedBoxGeometry(0.97, TILE_H, 0.97, 2, 0.03);
    for (let i = 0; i < n * n; i++) {
      const c = i % n, r = Math.floor(i / n);
      const mat = plastic((c + r) % 2 === 0 ? this.cfg.dark : this.cfg.light, { roughness: 0.5, clearcoat: 0.4 });
      const tile = new THREE.Mesh(geo, mat);
      const p = this.cellPos(i);
      tile.position.set(p.x, TILE_H / 2, p.z);
      tile.receiveShadow = true;
      tile.userData.i = i;
      this.scene.add(tile);
      this.squares.push(tile);
      this.squareMats.push(mat);
    }
  }

  private buildLabels() {
    const { cols, rows } = this.cfg.labels!, n = this.cfg.size;
    const px = 64, W = (n + FRAME * 2) * px;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = W;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#6b5236";
    g.font = `${px * 0.42}px 'Paytone One', system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const o = FRAME * px;
    for (let k = 0; k < n; k++) {
      g.fillText(cols[k], o + (k + 0.5) * px, W - o / 2);
      g.fillText(cols[k], o + (k + 0.5) * px, o / 2);
      g.fillText(rows[k], o / 2, W - o - (k + 0.5) * px);
      g.fillText(rows[k], W - o / 2, W - o - (k + 0.5) * px);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(n + FRAME * 2, n + FRAME * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.002;
    this.scene.add(plane);
  }

  /** Centre of square `i`: column 0 on White's left, row 0 nearest White. */
  private cellPos(i: number) {
    const n = this.cfg.size, c = i % n, r = Math.floor(i / n);
    return new THREE.Vector3(c - (n - 1) / 2, TILE_H, (n - 1) / 2 - r);
  }

  // ---------- State ----------
  setState(s: GridState) {
    const prev = this.state;
    this.state = s;
    this.controls.enabled = s.interactive;
    this.controls.autoRotate = !!s.spin && !this.reduced;
    this.controls.autoRotateSpeed = 0.6;
    if (s.spin) Object.assign(this.controls, { minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity });
    if (this.flipped !== s.flipped) {
      this.flipped = s.flipped;
      this.resize();
    }
    if (!prev || prev.cells !== s.cells) this.syncPieces(prev?.cells ?? null, s);
    this.drawMarkers();
  }

  private spawn(kind: string, square: number, now: number, delay = 0) {
    const obj = this.cfg.piece(kind);
    obj.traverse((o) => {
      o.castShadow = true;
      o.userData.square = square;
    });
    obj.position.copy(this.cellPos(square));
    obj.rotation.y = kind[0] === "b" ? Math.PI : 0;
    obj.scale.setScalar(0.001);
    this.scene.add(obj);
    const p: PieceObj = { obj, kind, square, segs: [], born: now + delay, dying: null };
    this.pieces.set(square, p);
    return p;
  }

  private syncPieces(before: (string | null)[] | null, s: GridState) {
    const now = performance.now(), cells = s.cells;
    if (!before) {
      cells.forEach((k, i) => k && this.spawn(k, i, now, this.reduced ? 0 : (Math.floor(i / this.cfg.size) % this.cfg.size) * 40));
      return;
    }
    const gone = new Set<number>(), arrived = new Set<number>();
    cells.forEach((k, i) => {
      if (before[i] && before[i] !== k) gone.add(i);
      if (k && before[i] !== k) arrived.add(i);
    });
    const relocate = (p: PieceObj, to: number, kind: string, stops: number[]) => {
      this.pieces.delete(p.square);
      p.square = to;
      p.obj.traverse((o) => (o.userData.square = to));
      // A promotion swaps the piece's shape once it lands.
      if (kind !== p.kind) {
        const fresh = this.cfg.piece(kind);
        fresh.traverse((o) => {
          o.castShadow = true;
          o.userData.square = to;
        });
        fresh.position.copy(p.obj.position);
        fresh.rotation.y = p.obj.rotation.y;
        this.scene.remove(p.obj);
        this.scene.add(fresh);
        p.obj = fresh;
        p.kind = kind;
      }
      let at = now;
      let from = p.obj.position.clone();
      for (const stop of stops) {
        const to3 = this.cellPos(stop);
        const dist = from.distanceTo(to3);
        const hop = stops.length > 1 || dist > 1.6 ? 0.55 + dist * 0.08 : 0.12;
        const dur = this.reduced ? 1 : stops.length > 1 ? HOP_MS : SLIDE_MS + dist * 30;
        p.segs.push({ from, to: to3, start: at, dur, hop });
        at += dur;
        from = to3;
      }
      this.pieces.set(to, p);
    };
    // The move the server reported: its piece follows the path, stop by stop.
    if (s.move && s.move.at !== this.seenMove && s.move.path.length > 1) {
      this.seenMove = s.move.at;
      const start = s.move.path[0], end = s.move.path[s.move.path.length - 1];
      const p = this.pieces.get(start);
      if (p && gone.has(start) && arrived.has(end)) {
        gone.delete(start);
        arrived.delete(end);
        relocate(p, end, cells[end]!, s.move.path.slice(1));
      }
    }
    // Anything else that moved (a castling rook) slides to the nearest matching square.
    for (const to of [...arrived]) {
      const kind = cells[to]!;
      const from = [...gone].filter((g) => before[g] === kind).sort((a, b) => this.cellPos(a).distanceTo(this.cellPos(to)) - this.cellPos(b).distanceTo(this.cellPos(to)))[0];
      if (from === undefined) continue;
      const p = this.pieces.get(from)!;
      gone.delete(from);
      arrived.delete(to);
      relocate(p, to, kind, [to]);
    }
    for (const g of gone) {
      const p = this.pieces.get(g);
      if (!p) continue;
      this.pieces.delete(g);
      p.dying = now + (s.move ? Math.max(0, (s.move.path.length - 1) * HOP_MS - 80) : 0);
      this.dying.push(p);
    }
    for (const a of arrived) this.spawn(cells[a]!, a, now);
  }

  private drawMarkers() {
    const s = this.state!;
    this.markers.clear();
    this.squareMats.forEach((m, i) => {
      const base = (i % this.cfg.size + Math.floor(i / this.cfg.size)) % 2 === 0 ? this.cfg.dark : this.cfg.light;
      m.color.set(base);
      m.emissive.set(0x000000);
      if (s.last.includes(i)) m.emissive.set(0x5a4300);
      if (i === s.selected) m.emissive.set(0x8a6a10);
      if (i === this.hover && s.interactive) m.emissive.offsetHSL(0, 0, 0.06);
    });
    for (const t of s.targets) {
      const p = this.cellPos(t);
      const capture = s.captures.includes(t);
      const mesh = capture
        ? new THREE.Mesh(CAPTURE_GEO, this.captureMat)
        : new THREE.Mesh(TARGET_GEO, this.targetMat);
      if (capture) mesh.rotation.x = Math.PI / 2;
      mesh.position.set(p.x, TILE_H + 0.02, p.z);
      this.markers.add(mesh);
    }
    if (s.danger !== null) {
      const p = this.cellPos(s.danger);
      const glow = new THREE.Mesh(DANGER_GEO, this.dangerMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(p.x, TILE_H + 0.01, p.z);
      this.markers.add(glow);
    }
  }

  // ---------- Input ----------
  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const targets: THREE.Object3D[] = [...this.squares];
    for (const p of this.pieces.values()) targets.push(p.obj);
    const hit = this.ray.intersectObjects(targets, true)[0];
    if (!hit) return -1;
    return (hit.object.userData.i ?? hit.object.userData.square ?? -1) as number;
  }
  private onMove = (e: PointerEvent) => {
    if (!this.state?.interactive) return;
    const h = this.pick(e);
    if (h !== this.hover) {
      this.hover = h;
      this.drawMarkers();
    }
    this.renderer.domElement.style.cursor = h >= 0 ? "pointer" : "grab";
  };
  private onLeave = () => {
    this.hover = -1;
    if (this.state) this.drawMarkers();
  };
  private onDown = (e: PointerEvent) => {
    this.down = [e.clientX, e.clientY];
  };
  private onUp = (e: PointerEvent) => {
    if (!this.down || !this.state?.interactive) return;
    const moved = Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]);
    this.down = null;
    if (moved > 6) return;
    const i = this.pick(e);
    if (i >= 0) this.onSquare(i);
  };

  // ---------- Frame ----------
  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const radius = (this.cfg.size / 2 + FRAME) * (this.camera.aspect < 1.2 ? 1.12 : 1.02);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(radius / Math.tan(vfov / 2), radius / (Math.tan(vfov / 2) * this.camera.aspect));
    const polar = 0.6, side = this.flipped ? -1 : 1;
    this.camera.position.set(0, Math.cos(polar) * dist, side * Math.sin(polar) * dist);
    this.controls.target.set(0, 0, side * 0.3);
    this.controls.minDistance = dist * 0.55;
    this.controls.maxDistance = dist * 1.3;
    const az = this.flipped ? Math.PI : 0;
    if (!this.state?.spin) {
      this.controls.minAzimuthAngle = az - 0.9;
      this.controls.maxAzimuthAngle = az + 0.9;
    }
    this.controls.update();
  }

  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    if (!this.reduced) this.waterTime.value = (now - this.boot) / 1000;
    for (const p of this.pieces.values()) {
      const k = Math.min(1, Math.max(0, (now - p.born) / POP_MS));
      p.obj.scale.setScalar(k < 1 ? Math.max(0.001, easeBack(k)) : 1);
      while (p.segs.length) {
        const seg = p.segs[0];
        const t = (now - seg.start) / seg.dur;
        if (t < 0) break;
        if (t >= 1) {
          p.obj.position.copy(seg.to);
          p.segs.shift();
          continue;
        }
        p.obj.position.lerpVectors(seg.from, seg.to, ease(t));
        p.obj.position.y = TILE_H + Math.sin(t * Math.PI) * seg.hop;
        break;
      }
    }
    // Captured pieces jump up, spin and shrink away.
    this.dying = this.dying.filter((p) => {
      const t = (now - p.dying!) / DEATH_MS;
      if (t < 0) return true;
      if (t >= 1) {
        this.scene.remove(p.obj);
        return false;
      }
      p.obj.position.y = TILE_H + Math.sin(t * Math.PI * 0.8) * 0.8;
      p.obj.rotation.z = t * 2.2;
      p.obj.scale.setScalar(Math.max(0.001, 1 - ease(t)));
      return true;
    });
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
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}
