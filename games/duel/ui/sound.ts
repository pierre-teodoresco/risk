// Board sounds of the two-player games, made on the fly with Web Audio: a wooden tap for a
// move, a heavier knock for a capture, a bright ping for a check, a soft tick for a premove, two
// notes for the start and the end of a game.
import { setSoundEnabled, soundEnabled } from "@/lib/sound";

let ctx: AudioContext | null = null;

export const soundOn = () => soundEnabled("duel.sound");
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

/** A short filtered noise burst on top of a falling tone: the sound of wood on wood. */
function knock(a: AudioContext, at: number, pitch: number, gain: number) {
  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const noise = a.createBufferSource();
  noise.buffer = buf;
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = pitch * 6;
  band.Q.value = 1.4;
  const ng = a.createGain();
  ng.gain.value = gain;
  noise.connect(band).connect(ng).connect(a.destination);
  noise.start(at);

  const tone = a.createOscillator();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(pitch * 1.6, at);
  tone.frequency.exponentialRampToValueAtTime(pitch, at + 0.05);
  const tg = a.createGain();
  tg.gain.setValueAtTime(gain * 0.9, at);
  tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  tone.connect(tg).connect(a.destination);
  tone.start(at);
  tone.stop(at + 0.1);
}

function note(a: AudioContext, at: number, freq: number, gain: number, length = 0.18) {
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + length + 0.02);
}

export type Sound = "move" | "capture" | "castle" | "check" | "start" | "end" | "low" | "premove";
export function playSound(s: Sound) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.005;
  if (s === "move") knock(a, t, 190, 0.5);
  else if (s === "capture") {
    knock(a, t, 150, 0.7);
    knock(a, t + 0.035, 230, 0.35);
  } else if (s === "castle") {
    knock(a, t, 190, 0.45);
    knock(a, t + 0.09, 210, 0.45);
  } else if (s === "check") {
    knock(a, t, 190, 0.45);
    note(a, t + 0.02, 1046, 0.12, 0.22);
  } else if (s === "start") {
    note(a, t, 660, 0.12);
    note(a, t + 0.12, 880, 0.12, 0.25);
  } else if (s === "end") {
    note(a, t, 880, 0.12);
    note(a, t + 0.14, 660, 0.12, 0.3);
  } else if (s === "premove") knock(a, t, 260, 0.22);
  else note(a, t, 1320, 0.06, 0.08);
}
