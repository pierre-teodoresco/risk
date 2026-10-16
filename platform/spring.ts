// Tiny spring physics for game feel: values chase a target with stiffness and damping, so
// motion keeps its momentum when the target moves mid-flight (drag, hover, reflow).
export type SpringConfig = { stiffness: number; damping: number };
export const SPRINGS = {
  /** Follows the pointer closely: hover tilt, drag. */
  snappy: { stiffness: 520, damping: 34 },
  /** Settles calmly: hand reflow, pile landing. */
  soft: { stiffness: 210, damping: 24 },
  /** Overshoots and bounces back: lift on hover, card arrival. */
  wobbly: { stiffness: 320, damping: 15 },
} satisfies Record<string, SpringConfig>;

const REST_DELTA = 0.01;
const MAX_STEP_S = 1 / 30;

export class Spring {
  velocity = 0;
  constructor(
    public value: number,
    public config: SpringConfig = SPRINGS.soft,
    public target = value,
  ) {}
  /** Advances by `dt` seconds; returns false once at rest. */
  step(dt: number) {
    const force = -this.config.stiffness * (this.value - this.target) - this.config.damping * this.velocity;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
    if (Math.abs(this.value - this.target) < REST_DELTA && Math.abs(this.velocity) < REST_DELTA) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
  /** Jumps to `value` without animation. */
  set(value: number) {
    this.value = this.target = value;
    this.velocity = 0;
  }
}

/**
 * Runs `frame(dt)` on every animation frame while it returns true, and wakes up on `kick()`.
 * One loop per component keeps rendering out of React.
 */
export function createLoop(frame: (dt: number) => boolean) {
  let raf = 0,
    last = 0;
  const tick = (t: number) => {
    const dt = Math.min(MAX_STEP_S, last ? (t - last) / 1000 : 1 / 60);
    last = t;
    raf = frame(dt) ? requestAnimationFrame(tick) : 0;
    if (!raf) last = 0;
  };
  return {
    kick() {
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
  };
}

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
