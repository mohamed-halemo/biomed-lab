// Audio fingerprinting, following "Shazam Like app": spectrogram features (mel spectrogram, MFCC, chroma)
// are turned into images, each image gets a perceptual hash (pHash), and songs are ranked by the
// average hash similarity. Two songs can be mixed with a weight slider, as in the original.
import { fftInPlace } from './fft';
import { gaussian, mulberry32 } from './rng';

export const SR = 11025;

export interface Matrix {
  rows: number; // frequency bins / coefficients
  cols: number; // frames
  data: Float32Array; // row-major [row][col]
}

export function stft(x: Float32Array, nfft = 1024, hop = 512): Matrix {
  const frames = Math.max(1, 1 + Math.floor((x.length - nfft) / hop));
  const bins = nfft / 2 + 1;
  const out = new Float32Array(bins * frames);
  const win = new Float64Array(nfft);
  for (let i = 0; i < nfft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nfft);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    for (let i = 0; i < nfft; i++) {
      re[i] = (x[o + i] ?? 0) * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let b = 0; b < bins; b++) out[b * frames + f] = re[b] * re[b] + im[b] * im[b];
  }
  return { rows: bins, cols: frames, data: out };
}

const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (10 ** (m / 2595) - 1);

export function melFilterbank(nMels: number, nfft: number, sr: number, fmax = sr / 2): Float32Array[] {
  const bins = nfft / 2 + 1;
  const mMin = hzToMel(0);
  const mMax = hzToMel(fmax);
  const pts = Array.from({ length: nMels + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (nMels + 1)));
  const fb: Float32Array[] = [];
  for (let m = 0; m < nMels; m++) {
    const f = new Float32Array(bins);
    const [l, c, r] = [pts[m], pts[m + 1], pts[m + 2]];
    for (let b = 0; b < bins; b++) {
      const hz = (b * sr) / nfft;
      if (hz > l && hz <= c) f[b] = (hz - l) / (c - l);
      else if (hz > c && hz < r) f[b] = (r - hz) / (r - c);
    }
    fb.push(f);
  }
  return fb;
}

function applyBank(P: Matrix, bank: Float32Array[]): Matrix {
  const out = new Float32Array(bank.length * P.cols);
  for (let m = 0; m < bank.length; m++) {
    const f = bank[m];
    for (let t = 0; t < P.cols; t++) {
      let s = 0;
      for (let b = 0; b < P.rows; b++) if (f[b]) s += f[b] * P.data[b * P.cols + t];
      out[m * P.cols + t] = s;
    }
  }
  return { rows: bank.length, cols: P.cols, data: out };
}

export function powerToDb(M: Matrix, topDb = 80): Matrix {
  const out = new Float32Array(M.data.length);
  let mx = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i] = 10 * Math.log10(Math.max(1e-10, M.data[i]));
    if (out[i] > mx) mx = out[i];
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], mx - topDb);
  return { ...M, data: out };
}

/** DCT-II (orthonormal) of each column, keeping nCoef coefficients: MFCC from a log-mel spectrogram. */
export function mfccFromLogMel(L: Matrix, nCoef: number): Matrix {
  const N = L.rows;
  const out = new Float32Array(nCoef * L.cols);
  for (let k = 0; k < nCoef; k++) {
    const sc = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
    for (let t = 0; t < L.cols; t++) {
      let s = 0;
      for (let n = 0; n < N; n++) s += L.data[n * L.cols + t] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
      out[k * L.cols + t] = s * sc;
    }
  }
  return { rows: nCoef, cols: L.cols, data: out };
}

/** 12-bin chroma from the power spectrogram (pitch class energy), normalised per frame. */
export function chroma(P: Matrix, nfft: number, sr: number): Matrix {
  const out = new Float32Array(12 * P.cols);
  for (let b = 1; b < P.rows; b++) {
    const hz = (b * sr) / nfft;
    if (hz < 55 || hz > 4200) continue;
    const pc = ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12 + 9) % 12; // 0 = C
    for (let t = 0; t < P.cols; t++) out[pc * P.cols + t] += P.data[b * P.cols + t];
  }
  for (let t = 0; t < P.cols; t++) {
    let mx = 0;
    for (let c = 0; c < 12; c++) mx = Math.max(mx, out[c * P.cols + t]);
    if (mx > 0) for (let c = 0; c < 12; c++) out[c * P.cols + t] /= mx;
  }
  return { rows: 12, cols: P.cols, data: out };
}

export interface Features {
  spec: Matrix; // log power spectrogram (dB)
  mel: Matrix; // log mel spectrogram (dB)
  mfcc: Matrix;
  chroma: Matrix;
}

const NFFT = 1024;
const HOP = 512;
let bankCache: Float32Array[] | null = null;

export function features(x: Float32Array): Features {
  const P = stft(x, NFFT, HOP);
  bankCache ??= melFilterbank(64, NFFT, SR, 5000);
  const melP = applyBank(P, bankCache);
  const mel = powerToDb(melP);
  return { spec: powerToDb(P), mel, mfcc: mfccFromLogMel(mel, 20), chroma: chroma(P, NFFT, SR) };
}

export function sliceCols(M: Matrix, c0: number, c1: number): Matrix {
  const cols = c1 - c0;
  const out = new Float32Array(M.rows * cols);
  for (let r = 0; r < M.rows; r++) out.set(M.data.subarray(r * M.cols + c0, r * M.cols + c1), r * cols);
  return { rows: M.rows, cols, data: out };
}

/**
 * Perceptual hash like imagehash.phash: resize the feature image to 32x32, take the 2-D DCT, keep the
 * 8x8 low-frequency block and set each bit to (coef > median). Returns 64 bits as a Uint8Array of 0/1.
 */
export function phash(M: Matrix): Uint8Array {
  const S = 32;
  const img = new Float64Array(S * S);
  for (let y = 0; y < S; y++) {
    // image rows: high frequencies at the top, like a plotted spectrogram
    const fy = ((S - 1 - y + 0.5) * M.rows) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const fx = ((x + 0.5) * M.cols) / S - 0.5;
      img[y * S + x] = bilinear(M, fy, fx);
    }
  }
  const dct = new Float64Array(S * S);
  const cos = new Float64Array(S * S);
  for (let k = 0; k < S; k++) for (let n = 0; n < S; n++) cos[k * S + n] = Math.cos((Math.PI * k * (2 * n + 1)) / (2 * S));
  const tmp = new Float64Array(S * S);
  for (let y = 0; y < S; y++)
    for (let k = 0; k < S; k++) {
      let s = 0;
      for (let n = 0; n < S; n++) s += img[y * S + n] * cos[k * S + n];
      tmp[y * S + k] = s;
    }
  for (let k = 0; k < S; k++)
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let n = 0; n < S; n++) s += tmp[n * S + x] * cos[k * S + n];
      dct[k * S + x] = s;
    }
  const low: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) low.push(dct[y * S + x]);
  const med = [...low].sort((a, b) => a - b);
  const m = (med[31] + med[32]) / 2;
  return Uint8Array.from(low.map((v) => (v > m ? 1 : 0)));
}

function bilinear(M: Matrix, r: number, c: number): number {
  r = Math.max(0, Math.min(M.rows - 1, r));
  c = Math.max(0, Math.min(M.cols - 1, c));
  const r0 = Math.floor(r);
  const c0 = Math.floor(c);
  const r1 = Math.min(M.rows - 1, r0 + 1);
  const c1 = Math.min(M.cols - 1, c0 + 1);
  const tr = r - r0;
  const tc = c - c0;
  const at = (rr: number, cc: number) => M.data[rr * M.cols + cc];
  return (at(r0, c0) * (1 - tc) + at(r0, c1) * tc) * (1 - tr) + (at(r1, c0) * (1 - tc) + at(r1, c1) * tc) * tr;
}

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export interface Hashes {
  mel: Uint8Array;
  mfcc: Uint8Array;
  chroma: Uint8Array;
}

export function hashFeatures(f: Features, c0 = 0, c1 = f.mel.cols): Hashes {
  return {
    mel: phash(sliceCols(f.mel, c0, c1)),
    mfcc: phash(sliceCols(f.mfcc, c0, c1)),
    chroma: phash(sliceCols(f.chroma, c0, c1)),
  };
}

/** Similarity per feature = 1 - hamming / 64; overall = mean of the three, in percent. */
export function similarity(a: Hashes, b: Hashes): { mel: number; mfcc: number; chroma: number; total: number } {
  const mel = 1 - hamming(a.mel, b.mel) / 64;
  const mfcc = 1 - hamming(a.mfcc, b.mfcc) / 64;
  const chroma = 1 - hamming(a.chroma, b.chroma) / 64;
  return { mel, mfcc, chroma, total: ((mel + mfcc + chroma) / 3) * 100 };
}

// ---- synthetic library ----

export interface TrackSpec {
  id: string;
  title: string;
  bpm: number;
  /** semitone offsets from root, one per beat (null = rest) */
  melody: (number | null)[];
  root: number; // MIDI note
  timbre: 'sine' | 'organ' | 'square' | 'pluck' | 'brass';
  bass: number[]; // semitones, one per bar (4 beats)
  drums: 'none' | 'rock' | 'four' | 'shuffle';
}

export const LIBRARY: TrackSpec[] = [
  { id: 'a', title: 'Morning Arpeggio', bpm: 112, root: 60, timbre: 'pluck', melody: [0, 4, 7, 12, 7, 4, 0, 4, 5, 9, 12, 9, 7, 11, 14, 11], bass: [0, 5, 7, 0], drums: 'none' },
  { id: 'b', title: 'Organ Walk', bpm: 92, root: 57, timbre: 'organ', melody: [0, 2, 3, 5, 7, 5, 3, 2, 0, null, 3, null, 7, 8, 7, null], bass: [0, 3, 5, 7], drums: 'shuffle' },
  { id: 'c', title: 'Square Dance', bpm: 140, root: 64, timbre: 'square', melody: [0, 0, 7, 7, 9, 9, 7, null, 5, 5, 4, 4, 2, 2, 0, null], bass: [0, 5, 0, 7], drums: 'four' },
  { id: 'd', title: 'Slow Sine Choir', bpm: 70, root: 55, timbre: 'sine', melody: [0, null, 4, null, 7, null, 11, null, 12, null, 11, null, 7, null, 4, null], bass: [0, -3, -7, -5], drums: 'none' },
  { id: 'e', title: 'Brass Riff', bpm: 120, root: 50, timbre: 'brass', melody: [0, 3, 0, 5, 0, 6, 5, 3, 0, 3, 0, 10, 12, 10, 7, 5], bass: [0, 0, 5, 3], drums: 'rock' },
  { id: 'f', title: 'Pentatonic Run', bpm: 128, root: 62, timbre: 'pluck', melody: [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0, -3, 0, 2, 4, null], bass: [0, -5, -3, -7], drums: 'rock' },
  { id: 'g', title: 'Minor Waltz', bpm: 100, root: 57, timbre: 'organ', melody: [0, 3, 7, 3, 7, 12, 8, 7, 3, 2, 3, 7, 5, 3, 2, 0], bass: [0, -4, -2, -5], drums: 'four' },
  { id: 'h', title: 'Chiptune Loop', bpm: 150, root: 67, timbre: 'square', melody: [12, 7, 4, 0, 12, 7, 4, 0, 14, 9, 5, 2, 14, 9, 5, 2], bass: [0, 0, 2, 2], drums: 'four' },
];

export const TRACK_SECONDS = 12;

function osc(timbre: TrackSpec['timbre'], ph: number, tNote: number): number {
  const s = (k: number) => Math.sin(ph * k);
  switch (timbre) {
    case 'sine':
      return s(1) * 0.9 + 0.1 * s(2);
    case 'organ':
      return 0.6 * s(1) + 0.3 * s(2) + 0.2 * s(3) + 0.1 * s(4);
    case 'square':
      return 0.7 * (s(1) + s(3) / 3 + s(5) / 5 + s(7) / 7);
    case 'pluck':
      return (s(1) + 0.5 * s(2) + 0.25 * s(3)) * Math.exp(-5 * tNote);
    case 'brass':
      return (0.5 * s(1) + 0.4 * s(2) + 0.3 * s(3) + 0.2 * s(4) + 0.15 * s(5)) * Math.min(1, tNote * 20);
  }
}

/** Render a library track deterministically at SR Hz. */
export function renderTrack(spec: TrackSpec, seconds = TRACK_SECONDS): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const beat = 60 / spec.bpm;
  const rand = mulberry32(spec.id.charCodeAt(0) * 7919);
  const noise = new Float32Array(Math.floor(0.2 * SR)).map(() => gaussian(rand));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const b = Math.floor(t / beat);
    const tb = t - b * beat;
    const note = spec.melody[b % spec.melody.length];
    let v = 0;
    if (note !== null) {
      const f = 440 * 2 ** ((spec.root + note - 69) / 12);
      const env = Math.min(1, tb * 60) * Math.max(0, 1 - tb / (beat * 0.95));
      v += 0.5 * env * osc(spec.timbre, 2 * Math.PI * f * t, tb);
    }
    const bar = Math.floor(b / 4);
    const bf = 440 * 2 ** ((spec.root - 24 + spec.bass[bar % spec.bass.length] - 69) / 12);
    v += 0.25 * Math.sin(2 * Math.PI * bf * t) * (0.6 + 0.4 * Math.exp(-3 * ((t - bar * 4 * beat) % (4 * beat))));
    // drums
    const kick = (dt: number) => (dt >= 0 && dt < 0.15 ? Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-dt * 30)) * dt) * Math.exp(-dt * 25) * 0.7 : 0);
    const hat = (dt: number) => (dt >= 0 && dt < 0.05 ? noise[Math.floor(dt * SR)] * Math.exp(-dt * 90) * 0.15 : 0);
    const snare = (dt: number) => (dt >= 0 && dt < 0.2 ? noise[Math.floor(dt * SR)] * Math.exp(-dt * 25) * 0.3 : 0);
    if (spec.drums === 'four') {
      v += kick(tb) + hat(t % (beat / 2));
    } else if (spec.drums === 'rock') {
      const pos = b % 4;
      if (pos === 0 || pos === 2) v += kick(tb);
      else v += snare(tb);
      v += hat(t % (beat / 2));
    } else if (spec.drums === 'shuffle') {
      v += hat(t % (beat / 3)) + (b % 2 === 0 ? kick(tb) : snare(tb) * 0.6);
    }
    out[i] = v;
  }
  // normalise peak to 0.9
  let mx = 0;
  for (const x of out) mx = Math.max(mx, Math.abs(x));
  if (mx > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / mx) * 0.9;
  return out;
}

export function addWhiteNoise(x: Float32Array, snrDb: number, seed = 3): Float32Array {
  let p = 0;
  for (const v of x) p += v * v;
  p /= x.length;
  const sigma = Math.sqrt(p / 10 ** (snrDb / 10));
  const rand = mulberry32(seed);
  return x.map((v) => v + sigma * gaussian(rand));
}

/** Linear resampling to SR (good enough for fingerprint features). */
export function resample(x: Float32Array, from: number, to = SR): Float32Array {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from);
  const out = new Float32Array(n);
  // simple box low-pass when downsampling
  const k = Math.max(1, Math.round(from / to));
  for (let i = 0; i < n; i++) {
    const src = (i * from) / to;
    const i0 = Math.floor(src);
    let s = 0;
    let c = 0;
    for (let j = 0; j < k; j++) {
      const idx = i0 + j;
      if (idx < x.length) {
        s += x[idx];
        c++;
      }
    }
    out[i] = c ? s / c : 0;
  }
  return out;
}

/** Minimal WAV (PCM 8/16/24/32-bit int or 32-bit float) decoder, mixed to mono. */
export function decodeWav(buf: ArrayBuffer): { sampleRate: number; data: Float32Array } {
  const dv = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let o = 12;
  let fmt = 1;
  let ch = 1;
  let sr = 44100;
  let bits = 16;
  while (o + 8 <= dv.byteLength) {
    const id = tag(o);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = dv.getUint16(o + 8, true);
      ch = dv.getUint16(o + 10, true);
      sr = dv.getUint32(o + 12, true);
      bits = dv.getUint16(o + 22, true);
      if (fmt === 0xfffe) fmt = dv.getUint16(o + 32, true);
    } else if (id === 'data') {
      const bps = bits / 8;
      const n = Math.floor(Math.min(size, dv.byteLength - o - 8) / (bps * ch));
      const out = new Float32Array(n);
      let p = o + 8;
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < ch; c++, p += bps) {
          if (fmt === 3 && bits === 32) s += dv.getFloat32(p, true);
          else if (bits === 8) s += (dv.getUint8(p) - 128) / 128;
          else if (bits === 16) s += dv.getInt16(p, true) / 32768;
          else if (bits === 24) s += (((dv.getUint8(p + 2) << 24) | (dv.getUint8(p + 1) << 16) | (dv.getUint8(p) << 8)) >> 8) / 8388608;
          else if (bits === 32) s += dv.getInt32(p, true) / 2147483648;
        }
        out[i] = s / ch;
      }
      return { sampleRate: sr, data: out };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}
