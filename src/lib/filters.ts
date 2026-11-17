// Spatial filters and noise, ported from Task4-UnsharpMask (convolve2D) and Task7-Noise.
import { type Gray, makeGray, clamp255 } from './image';
import { gaussian, mulberry32, randInt } from './rng';

export type Padding = 'zero' | 'replicate';

/** k x k mean (box) filter, kernel = ones(k,k)/k^2, centred, padding (k-1)/2 like the original. */
export function boxBlur(src: Gray, k: number, padding: Padding = 'zero'): Gray {
  if (k % 2 === 0 || k < 1) throw new Error('kernel size must be odd');
  const r = (k - 1) / 2;
  const { w, h } = src;
  const out = makeGray(w, h);
  // separable sums give the same result as the 2-D window sum
  const tmp = new Float64Array(w * h);
  const get = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      if (padding === 'zero') return 0;
      x = Math.min(w - 1, Math.max(0, x));
      y = Math.min(h - 1, Math.max(0, y));
    }
    return src.data[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += get(x + i, y);
      tmp[y * w + x] = s;
    }
  }
  const getT = (x: number, y: number) => {
    if (y < 0 || y >= h) {
      if (padding === 'zero') return 0;
      y = Math.min(h - 1, Math.max(0, y));
    }
    return tmp[y * w + x];
  };
  const inv = 1 / (k * k);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += getT(x, y + j);
      out.data[y * w + x] = s * inv;
    }
  }
  return out;
}

/** Unsharp mask: output = image + factor * (image - blur), clipped to 0..255. */
export function unsharpMask(src: Gray, k: number, factor: number, padding: Padding = 'zero'): { blur: Gray; mask: Gray; out: Gray } {
  const blur = boxBlur(src, k, padding);
  const mask = makeGray(src.w, src.h);
  const out = makeGray(src.w, src.h);
  for (let i = 0; i < src.data.length; i++) {
    const m = src.data[i] - blur.data[i];
    mask.data[i] = m;
    out.data[i] = clamp255(src.data[i] + factor * m);
  }
  return { blur, mask, out };
}

/** k x k median filter with replicated borders. */
export function medianFilter(src: Gray, k: number): Gray {
  const r = (k - 1) >> 1;
  const { w, h } = src;
  const out = makeGray(w, h);
  const buf = new Float32Array(k * k);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let j = -r; j <= r; j++) {
        const yy = Math.min(h - 1, Math.max(0, y + j));
        for (let i = -r; i <= r; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          buf[n++] = src.data[yy * w + xx];
        }
      }
      const s = buf.subarray(0, n).sort();
      out.data[y * w + x] = s[n >> 1];
    }
  }
  return out;
}

/** Test phantom from Task7 DrawImage(): 256x256 background 50, square [40:220) = 150, disk r=64 at centre = 250. */
export function noisePhantom(): Gray {
  const n = 256;
  const g = makeGray(n, n, 50);
  for (let y = 40; y < 220; y++) for (let x = 40; x < 220; x++) g.data[y * n + x] = 150;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if ((x - 128) ** 2 + (y - 128) ** 2 <= 64 * 64) g.data[y * n + x] = 250;
  return g;
}

export type NoiseKind = 'gaussian' | 'uniform' | 'saltpepper';

export interface NoiseParams {
  kind: NoiseKind;
  mean?: number;
  sigma?: number;
  a?: number;
  b?: number;
  /** salt & pepper: number of white and black pixels range, as in the original randint(300, 10000) */
  amount?: number;
  seed?: number;
}

/**
 * Additive noise. Gaussian ~ N(mean, sigma), uniform ~ U(a, b), salt & pepper sets random pixels to 255 / 0.
 * Noise is added in intensity units and clipped to 0..255.
 */
export function addNoise(src: Gray, p: NoiseParams): Gray {
  const rand = mulberry32(p.seed ?? 1);
  const out = makeGray(src.w, src.h);
  out.data.set(src.data);
  if (p.kind === 'gaussian') {
    const m = p.mean ?? 0;
    const s = p.sigma ?? 5;
    for (let i = 0; i < out.data.length; i++) out.data[i] = clamp255(out.data[i] + m + s * gaussian(rand));
  } else if (p.kind === 'uniform') {
    const a = p.a ?? -10;
    const b = p.b ?? 10;
    for (let i = 0; i < out.data.length; i++) out.data[i] = clamp255(out.data[i] + a + (b - a) * rand());
  } else {
    const n = p.amount ?? 3000;
    for (const v of [255, 0]) {
      for (let k = 0; k < n; k++) {
        const y = randInt(rand, 0, src.h - 1);
        const x = randInt(rand, 0, src.w - 1);
        out.data[y * src.w + x] = v;
      }
    }
  }
  return out;
}

/** Mean and standard deviation inside a rectangle (Task7 ROI statistics). */
export function roiStats(g: Gray, x0: number, y0: number, x1: number, y1: number): { mean: number; sigma: number; hist: Uint32Array; n: number } {
  const hist = new Uint32Array(256);
  let s = 0;
  let n = 0;
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(g.w, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(g.h, Math.max(y0, y1));
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const v = g.data[y * g.w + x];
      s += v;
      n++;
      hist[Math.max(0, Math.min(255, Math.round(v)))]++;
    }
  const mean = n ? s / n : 0;
  let d = 0;
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      const v = g.data[y * g.w + x] - mean;
      d += v * v;
    }
  return { mean, sigma: n ? Math.sqrt(d / n) : 0, hist, n };
}

/** Local variance in a k x k window (Task9 colour map texture feature). */
export function localVariance(g: Gray, k: number): Gray {
  const r = (k - 1) >> 1;
  const { w, h } = g;
  // integral images of x and x^2
  const S = new Float64Array((w + 1) * (h + 1));
  const S2 = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rs2 = 0;
    for (let x = 0; x < w; x++) {
      const v = g.data[y * w + x];
      rs += v;
      rs2 += v * v;
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + rs;
      S2[(y + 1) * (w + 1) + x + 1] = S2[y * (w + 1) + x + 1] + rs2;
    }
  }
  const out = makeGray(w, h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w, x + r + 1);
      const n = (yb - ya) * (xb - xa);
      const a = S[yb * (w + 1) + xb] - S[ya * (w + 1) + xb] - S[yb * (w + 1) + xa] + S[ya * (w + 1) + xa];
      const b = S2[yb * (w + 1) + xb] - S2[ya * (w + 1) + xb] - S2[yb * (w + 1) + xa] + S2[ya * (w + 1) + xa];
      const m = a / n;
      out.data[y * w + x] = Math.max(0, b / n - m * m);
    }
  }
  return out;
}
