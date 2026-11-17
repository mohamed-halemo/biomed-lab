// 1-D signal helpers for the ECG viewer and FFT explorer.
import { fftInPlace, nextPow2 } from './fft';

/** Pick samples of x (rate fsIn) at a new rate fsOut by nearest index (ideal sampler on the dense grid). */
export function sampleAt(x: ArrayLike<number>, fsIn: number, fsOut: number, t0 = 0, t1 = x.length / fsIn): { t: Float64Array; v: Float64Array } {
  const n = Math.max(1, Math.floor((t1 - t0) * fsOut));
  const t = new Float64Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ti = t0 + i / fsOut;
    t[i] = ti;
    // linear interpolation between dense samples
    const fi = ti * fsIn;
    const a = Math.floor(fi);
    const f = fi - a;
    const xa = x[Math.min(x.length - 1, a)];
    const xb = x[Math.min(x.length - 1, a + 1)];
    v[i] = xa * (1 - f) + xb * f;
  }
  return { t, v };
}

const sinc = (u: number) => (u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u));

/** Whittaker-Shannon reconstruction x(t) = sum x[n] sinc((t - nT) / T), evaluated at times `at`. */
export function sincReconstruct(samples: { t: Float64Array; v: Float64Array }, fs: number, at: ArrayLike<number>): Float64Array {
  const out = new Float64Array(at.length);
  const T = 1 / fs;
  const t0 = samples.t[0] ?? 0;
  const N = samples.v.length;
  const W = 64; // truncate the sum to +-W samples around t for speed
  for (let i = 0; i < at.length; i++) {
    const k = Math.round((at[i] - t0) / T);
    let s = 0;
    for (let n = Math.max(0, k - W); n < Math.min(N, k + W + 1); n++) s += samples.v[n] * sinc((at[i] - samples.t[n]) / T);
    out[i] = s;
  }
  return out;
}

/** Zero-order hold reconstruction (staircase). */
export function holdReconstruct(samples: { t: Float64Array; v: Float64Array }, fs: number, at: ArrayLike<number>): Float64Array {
  const out = new Float64Array(at.length);
  const t0 = samples.t[0] ?? 0;
  for (let i = 0; i < at.length; i++) {
    const k = Math.min(samples.v.length - 1, Math.max(0, Math.floor((at[i] - t0) * fs)));
    out[i] = samples.v[k];
  }
  return out;
}

/** One-sided magnitude spectrum (Hann window), returns frequency axis in Hz. */
export function magnitudeSpectrum(x: ArrayLike<number>, fs: number, removeMean = true): { f: Float64Array; mag: Float64Array } {
  const N = nextPow2(x.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let mean = 0;
  if (removeMean) {
    for (let i = 0; i < x.length; i++) mean += x[i];
    mean /= x.length;
  }
  for (let i = 0; i < x.length; i++) re[i] = (x[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1)));
  fftInPlace(re, im);
  const half = N / 2 + 1;
  const f = new Float64Array(half);
  const mag = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    f[k] = (k * fs) / N;
    mag[k] = (2 * Math.hypot(re[k], im[k])) / x.length;
  }
  return { f, mag };
}

/**
 * 10-band equalizer from the Signal Viewer: the spectrum 0..fs/2 is split into 10 equal bands and each
 * band is multiplied by its slider gain before the inverse FFT.
 */
export function equalize10(x: ArrayLike<number>, gains: number[]): Float64Array {
  const N = nextPow2(x.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < x.length; i++) re[i] = x[i];
  fftInPlace(re, im);
  for (let k = 0; k < N; k++) {
    const kk = k <= N / 2 ? k : N - k; // mirror for negative frequencies
    const band = Math.min(9, Math.floor((kk / (N / 2)) * 10));
    re[k] *= gains[band];
    im[k] *= gains[band];
  }
  fftInPlace(re, im, true);
  return re.slice(0, x.length);
}

/** Magnitude spectrogram in dB [freq][time]. */
export function spectrogram(x: ArrayLike<number>, nfft: number, hop: number): { data: Float32Array; rows: number; cols: number } {
  const frames = Math.max(1, 1 + Math.floor((x.length - nfft) / hop));
  const rows = nfft / 2;
  const data = new Float32Array(rows * frames);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < nfft; i++) {
      re[i] = (x[f * hop + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nfft));
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < rows; k++) data[k * frames + f] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-12);
  }
  return { data, rows, cols: frames };
}

/** Parse "time value" (whitespace/comma separated) or single-column text. */
export function parseSignalText(text: string): { fs: number; y: number[] } {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[#%a-z"]/i.test(l))
    .map((l) => l.split(/[\s,;]+/).map(Number));
  const ok = rows.filter((r) => r.every((v) => Number.isFinite(v)));
  if (ok.length < 8) throw new Error('Could not read numbers from the file');
  if (ok[0].length >= 2) {
    const dt = ok[1][0] - ok[0][0];
    return { fs: dt > 0 ? 1 / dt : 360, y: ok.map((r) => r[1]) };
  }
  return { fs: 360, y: ok.map((r) => r[0]) };
}
