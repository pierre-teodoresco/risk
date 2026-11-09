// Little synthesised sounds, Web Audio only (no files): blips, boings and a fanfare that would
// not be out of place in a 2006 browser game. Reads the hub-wide sound switch at play time.
import { soundEnabled } from "@/lib/sound";

let ctx: AudioContext | null = null;
const last = new Map<string, number>();

function audio() {
  if (typeof window === "undefined" || !soundEnabled(undefined, false)) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
function tone(a: AudioContext, at: number, freq: number, length: number, gain: number, type: OscillatorType = "square", slide = 1) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, at + length);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + length + 0.02);
}
function noise(a: AudioContext, at: number, length: number, freq: number, gain: number) {
  const len = Math.floor(a.sampleRate * length), buf = a.createBuffer(1, len, a.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
}

export type Cue = "select" | "order" | "rally" | "capture" | "lose" | "kill" | "shot" | "alarm" | "drop" | "crate" | "chicken" | "militia" | "victory" | "defeat" | "start";
/** Minimum gap per cue, so a big fight does not turn into noise. */
const GAP: Partial<Record<Cue, number>> = { kill: 90, shot: 160, capture: 120, alarm: 3500, lose: 800 };

export function play(cue: Cue) {
  const now = performance.now();
  if (now - (last.get(cue) ?? -1e9) < (GAP[cue] ?? 40)) return;
  last.set(cue, now);
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (cue) {
    case "select": tone(a, t, 660, 0.06, 0.05); tone(a, t + 0.05, 990, 0.06, 0.04); break;
    case "order": tone(a, t, 440, 0.07, 0.05, "triangle", 1.5); break;
    case "rally": tone(a, t, 523, 0.08, 0.05, "triangle"); tone(a, t + 0.08, 784, 0.1, 0.05, "triangle"); break;
    case "capture": tone(a, t, 880, 0.05, 0.035, "square"); tone(a, t + 0.05, 1320, 0.08, 0.03, "square"); break;
    case "lose": tone(a, t, 330, 0.18, 0.04, "sawtooth", 0.6); break;
    case "kill": noise(a, t, 0.09, 900 + Math.random() * 600, 0.12); break;
    case "shot": tone(a, t, 1200, 0.07, 0.025, "square", 0.3); break;
    case "alarm": for (let i = 0; i < 3; i++) tone(a, t + i * 0.18, 740, 0.12, 0.05, "square"); break;
    case "drop": tone(a, t, 1400, 0.5, 0.04, "sine", 0.25); break;
    case "crate": [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.06, f, 0.1, 0.05, "square")); break;
    case "chicken": tone(a, t, 900, 0.08, 0.06, "sawtooth", 1.4); tone(a, t + 0.1, 950, 0.08, 0.06, "sawtooth", 1.5); tone(a, t + 0.22, 700, 0.25, 0.06, "sawtooth", 1.8); break;
    case "militia": [392, 392, 523].forEach((f, i) => tone(a, t + i * 0.14, f, 0.12, 0.05, "square")); break;
    case "victory": [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(a, t + i * 0.13, f, i === 5 ? 0.5 : 0.12, 0.06, "square")); break;
    case "defeat": [392, 370, 349, 262].forEach((f, i) => tone(a, t + i * 0.22, f, i === 3 ? 0.6 : 0.2, 0.05, "triangle")); break;
    case "start": [262, 330, 392, 523].forEach((f, i) => tone(a, t + i * 0.08, f, 0.09, 0.05, "square")); break;
  }
}
