/**
 * Cavern sound effects, synthesized with the WebAudio API.
 *
 * No audio files and no network: every cue is a few oscillators and one noise
 * burst, so the game stays instant and offline. Sound starts muted-safe (no
 * context is created before a user gesture) and the on/off choice persists.
 */

const STORAGE_KEY = "gemhaven:sound";

let ctx: AudioContext | null = null;
let muted = false;
let hydrated = false;

function readPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

/** True when the player has switched cave sounds off. */
export function isMuted(): boolean {
  if (!hydrated) {
    muted = readPreference();
    hydrated = true;
  }
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "off" : "on");
  } catch {
    // Private-mode browsers may refuse — the session preference still applies.
  }
}

/** AudioContexts must be born from a user gesture, so create it lazily. */
function audio(): AudioContext | null {
  if (typeof window === "undefined" || isMuted()) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type ToneOptions = {
  type?: OscillatorType;
  duration?: number;
  gain?: number;
  delay?: number;
  /** Optional frequency to glide toward, for thuds and sweeps. */
  slide?: number;
};

function tone(freq: number, options: ToneOptions = {}): void {
  const ac = audio();
  if (!ac) return;
  const { type = "sine", duration = 0.16, gain = 0.06, delay = 0, slide } = options;
  const t0 = ac.currentTime + delay;

  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide !== undefined) osc.frequency.exponentialRampToValueAtTime(slide, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** A short filtered noise burst — the pickaxe biting into rock. */
function crunch(duration = 0.12, gain = 0.05, cutoff = 950): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;

  const frames = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  source.connect(filter).connect(amp).connect(ac.destination);
  source.start(t0);
}

/** Selecting a deposit or a Dig kind — a light crystal tick. */
export function playPick(): void {
  tone(740, { type: "triangle", duration: 0.07, gain: 0.035 });
  tone(1180, { type: "sine", duration: 0.09, gain: 0.02, delay: 0.03 });
}

/** The Dig itself: crunch of the strike, then a low stone thud. */
export function playDig(): void {
  crunch(0.14, 0.06, 1100);
  tone(150, { type: "sine", duration: 0.22, gain: 0.05, delay: 0.02, slide: 58 });
}

/** A strike: a rising four-note sparkle. */
export function playWin(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    tone(freq, { type: "triangle", duration: 0.22, gain: 0.05, delay: i * 0.085 });
  });
}

/** A miss: a soft descending thud — no punishment, just the cave settling. */
export function playLose(): void {
  tone(196, { type: "sine", duration: 0.3, gain: 0.05, slide: 98 });
  crunch(0.09, 0.02, 420);
}

/** A claim lands: two bright coin pings. */
export function playClaim(): void {
  tone(880, { type: "triangle", duration: 0.12, gain: 0.05 });
  tone(1318.5, { type: "triangle", duration: 0.2, gain: 0.045, delay: 0.09 });
}

/** The Bonanza pot releases: a quick golden fanfare. */
export function playBonanza(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
  notes.forEach((freq, i) => {
    tone(freq, { type: "triangle", duration: 0.26, gain: 0.05, delay: i * 0.07 });
  });
  tone(2093, { type: "sine", duration: 0.5, gain: 0.03, delay: 0.42 });
}
