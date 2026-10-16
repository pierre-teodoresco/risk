// Synthesised card sounds: no files to download, one shared AudioContext created on first use.
export type Cue = "hover" | "select" | "play" | "draw" | "turn" | "call" | "catch" | "win" | "error";

let ctx: AudioContext | null = null;
function audio() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  ctx = Ctor ? new Ctor() : null;
  return ctx;
}

function noise(a: AudioContext, at: number, length: number, filter: BiquadFilterType, from: number, to: number, volume: number) {
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + length);
  const g = a.createGain();
  g.gain.setValueAtTime(volume, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
  src.stop(at + length);
}
function tone(a: AudioContext, at: number, freq: number, length: number, type: OscillatorType, volume: number, endFreq = freq) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(endFreq, at + length);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + length + 0.02);
}

export function playCue(cue: Cue) {
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  const t = a.currentTime;
  switch (cue) {
    case "hover":
      return noise(a, t, 0.035, "highpass", 5000, 7000, 0.025);
    case "select":
      return noise(a, t, 0.05, "bandpass", 3200, 1800, 0.08);
    case "play":
      noise(a, t, 0.16, "bandpass", 2600, 600, 0.18);
      return tone(a, t + 0.12, 140, 0.12, "sine", 0.18, 70);
    case "draw":
      return noise(a, t, 0.22, "lowpass", 1800, 500, 0.12);
    case "turn":
      tone(a, t, 784, 0.35, "sine", 0.06);
      return tone(a, t + 0.09, 1175, 0.4, "sine", 0.05);
    case "call":
      tone(a, t, 660, 0.12, "triangle", 0.12);
      return tone(a, t + 0.11, 990, 0.2, "triangle", 0.12);
    case "catch":
      return tone(a, t, 220, 0.3, "square", 0.05, 110);
    case "win":
      return [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.1, f, 0.5, "triangle", 0.09));
    case "error":
      return tone(a, t, 180, 0.14, "sawtooth", 0.035, 150);
  }
}
