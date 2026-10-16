// Grand Tour's sounds, made on the fly with Web Audio: dice rattling in the hand and clattering
// on the board, pawn hops climbing in pitch, coins, a fanfare for a purchase, a pop for a house.
import { setSoundEnabled, soundEnabled } from "@/lib/sound";

let ctx: AudioContext | null = null;

export const soundOn = () => soundEnabled("grand-tour.sound");
export const setSound = setSoundEnabled;

function audio() {
  if (typeof window === "undefined" || !soundOn()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(a: AudioContext, at: number, length: number, freq: number, gain: number, q = 1.2) {
  const len = Math.floor(a.sampleRate * length);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
}
function tone(a: AudioContext, at: number, freq: number, length: number, gain: number, type: OscillatorType = "sine", slide = 1) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, at + length);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + length + 0.03);
}

export type Sound = "rattle" | "dice" | "hop" | "coin" | "pay" | "buy" | "build" | "card" | "jail" | "turn" | "win";
export function playSound(s: Sound, k = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.005;
  switch (s) {
    case "rattle":
      for (let j = 0; j < 3; j++) noise(a, t + j * 0.035 + Math.random() * 0.02, 0.03, 2600 + Math.random() * 1600, 0.25, 3);
      break;
    case "dice":
      for (let j = 0; j < 4; j++) noise(a, t + [0, 0.32, 0.55, 0.7][j], 0.05, 1600 - j * 150, 0.6 - j * 0.12, 2);
      break;
    case "hop":
      tone(a, t, 330 * Math.pow(2, Math.min(k, 12) / 12), 0.09, 0.12, "triangle", 1.5);
      noise(a, t + 0.05, 0.03, 900, 0.18);
      break;
    case "coin":
      tone(a, t, 1318, 0.12, 0.12, "square");
      tone(a, t + 0.08, 1975, 0.3, 0.1, "square");
      break;
    case "pay":
      tone(a, t, 523, 0.14, 0.1, "triangle", 0.8);
      tone(a, t + 0.11, 392, 0.22, 0.1, "triangle", 0.8);
      break;
    case "buy":
      [523, 659, 784, 1046].forEach((f, j) => tone(a, t + j * 0.08, f, 0.22, 0.12, "triangle"));
      noise(a, t + 0.3, 0.12, 5000, 0.12, 0.6);
      break;
    case "build":
      tone(a, t, 220, 0.16, 0.18, "sine", 2.2);
      noise(a, t + 0.08, 0.06, 700, 0.3);
      break;
    case "card":
      noise(a, t, 0.18, 3200, 0.22, 0.5);
      tone(a, t + 0.12, 880, 0.18, 0.06);
      break;
    case "jail":
      tone(a, t, 196, 0.35, 0.12, "sawtooth", 0.9);
      tone(a, t + 0.2, 185, 0.4, 0.1, "sawtooth", 0.9);
      break;
    case "turn":
      tone(a, t, 784, 0.18, 0.1);
      tone(a, t + 0.1, 1175, 0.28, 0.1);
      break;
    case "win":
      [523, 659, 784, 1046, 784, 1046].forEach((f, j) => tone(a, t + j * 0.12, f, 0.3, 0.12, "triangle"));
      break;
  }
}
