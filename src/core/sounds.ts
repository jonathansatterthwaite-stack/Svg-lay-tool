/**
 * Sounds for hotspots' sound actions (see interaction.ts): built-in ones made with Web Audio as
 * they're played (nothing to download, works offline), and a document's own short sounds (audio
 * data URLs in `doc.sounds`). Where there's no audio (a test, an old browser) playing does nothing.
 */
import type { SvgDocument } from './types';

export const BUILTIN_SOUNDS: { name: string; label: string }[] = [
  { name: 'drum', label: 'Drum' },
  { name: 'bell', label: 'Bell' },
  { name: 'click', label: 'Click' },
  { name: 'chime', label: 'Chime' },
  { name: 'pour', label: 'Pour' },
  { name: 'tick', label: 'Tick' },
  { name: 'whoosh', label: 'Whoosh' },
  { name: 'dice', label: 'Dice' },
];

/** What a sound action's sound is called (a document's own, or built in). */
export function soundLabel(doc: SvgDocument | null | undefined, name: string): string {
  return doc?.sounds?.find((s) => s.id === name)?.name ?? BUILTIN_SOUNDS.find((s) => s.name === name)?.label ?? name;
}

type AC = AudioContext;
let shared: AC | null = null;

function audio(): AC | null {
  const g = globalThis as unknown as { AudioContext?: new () => AC; webkitAudioContext?: new () => AC };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    shared ??= new Ctor();
    if (shared.state === 'suspended') void shared.resume();
    return shared;
  } catch {
    return null;
  }
}

function noise(ac: AC, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** A gain that rises quickly to `peak` and falls away over `decay` seconds. */
function envelope(ac: AC, out: AudioNode, at: number, peak: number, decay: number, attack = 0.004): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(out);
  return g;
}

function tone(ac: AC, out: AudioNode, at: number, type: OscillatorType, freq: number, peak: number, decay: number, toFreq?: number): void {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, at + decay * 0.8);
  o.connect(envelope(ac, out, at, peak, decay));
  o.start(at);
  o.stop(at + decay + 0.05);
}

function burst(ac: AC, out: AudioNode, at: number, seconds: number, peak: number, filter: BiquadFilterType, freq: number, q = 1, toFreq?: number, attack = 0.004): void {
  const src = ac.createBufferSource();
  src.buffer = noise(ac, seconds + 0.05);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, at);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, at + seconds);
  f.Q.value = q;
  src.connect(f);
  f.connect(envelope(ac, out, at, peak, seconds, attack));
  src.start(at);
  src.stop(at + seconds + 0.05);
}

const SYNTHS: Record<string, (ac: AC, out: AudioNode, t: number) => void> = {
  drum: (ac, out, t) => {
    tone(ac, out, t, 'sine', 160, 0.9, 0.45, 45);
    burst(ac, out, t, 0.08, 0.35, 'lowpass', 1800);
  },
  bell: (ac, out, t) => {
    tone(ac, out, t, 'sine', 880, 0.35, 1.6);
    tone(ac, out, t, 'sine', 2210, 0.12, 0.9);
    tone(ac, out, t, 'sine', 3520, 0.05, 0.5);
  },
  click: (ac, out, t) => burst(ac, out, t, 0.025, 0.5, 'highpass', 2500, 0.7),
  chime: (ac, out, t) => {
    [1046.5, 1318.5, 1568].forEach((f, i) => tone(ac, out, t + i * 0.11, 'sine', f, 0.22, 1.1));
  },
  pour: (ac, out, t) => burst(ac, out, t, 1.1, 0.25, 'bandpass', 500, 1.5, 1400, 0.3),
  tick: (ac, out, t) => tone(ac, out, t, 'square', 2000, 0.12, 0.02),
  whoosh: (ac, out, t) => burst(ac, out, t, 0.45, 0.35, 'bandpass', 300, 0.8, 2500, 0.12),
  dice: (ac, out, t) => {
    for (let i = 0; i < 6; i++) burst(ac, out, t + i * 0.055 + Math.random() * 0.03, 0.03, 0.45 - i * 0.05, 'bandpass', 1800 + Math.random() * 1500, 2);
  },
};

const decoded = new Map<string, Promise<AudioBuffer | null>>();

function decode(ac: AC, data: string): Promise<AudioBuffer | null> {
  let p = decoded.get(data);
  if (!p) {
    p = (async () => {
      try {
        const bin = atob(data.slice(data.indexOf(',') + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return await ac.decodeAudioData(bytes.buffer);
      } catch {
        return null;
      }
    })();
    if (decoded.size > 32) decoded.clear();
    decoded.set(data, p);
  }
  return p;
}

/**
 * Play a sound action's sound: the document's own of that id, else a built-in one. `volume` 0..1.
 * Does nothing where there's no audio, or for a name it doesn't know.
 */
export function playSound(doc: SvgDocument | null | undefined, name: string, volume = 1): void {
  const vol = Math.min(1, Math.max(0, volume));
  if (vol <= 0) return;
  const own = doc?.sounds?.find((s) => s.id === name);
  if (!own && !SYNTHS[name]) return;
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = vol;
  out.connect(ac.destination);
  if (own) {
    void decode(ac, own.data).then((buf) => {
      if (!buf) return;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start();
    });
    return;
  }
  try {
    SYNTHS[name](ac, out, ac.currentTime + 0.01);
  } catch {
    /* audio refused: stay quiet */
  }
}
