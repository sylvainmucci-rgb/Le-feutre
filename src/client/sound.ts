export type SoundName = "deal" | "chip" | "card" | "win" | "click";

const KEY = "feutre.sound";
const listeners = new Set<() => void>();

let enabled = true;
let ctx: AudioContext | null = null;

function readEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

enabled = readEnabled();

export function soundOn(): boolean {
  return enabled;
}

export function setSoundOn(next: boolean) {
  enabled = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* navigation privée */
  }
  if (!next) {
    ctx?.suspend().catch(() => undefined);
  }
  for (const listener of listeners) listener();
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function context(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0) {
  const audio = context();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function clack() {
  const audio = context();
  if (!audio) return;
  const duration = 0.045;
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * duration)), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1600;
  const amp = audio.createGain();
  amp.gain.value = 0.045;
  source.connect(filter);
  filter.connect(amp);
  amp.connect(audio.destination);
  source.start();
  tone(190, 0.06, "sine", 0.03);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  const audio = context();
  if (!audio) return;
  if (audio.state === "suspended") {
    void audio.resume().catch(() => undefined);
  }
  if (name === "deal") {
    tone(740, 0.05, "triangle", 0.02);
    tone(980, 0.04, "triangle", 0.015, 0.06);
  } else if (name === "card") {
    tone(520, 0.04, "sine", 0.02);
  } else if (name === "chip") {
    clack();
  } else if (name === "win") {
    tone(523, 0.12, "sine", 0.03);
    tone(784, 0.16, "sine", 0.028, 0.1);
  } else {
    tone(660, 0.03, "sine", 0.015);
  }
}

export function installSoundUnlock(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const unlock = () => {
    if (!enabled) return;
    const audio = context();
    if (audio && audio.state === "suspended") void audio.resume().catch(() => undefined);
  };
  window.addEventListener("pointerdown", unlock);
  return () => window.removeEventListener("pointerdown", unlock);
}
