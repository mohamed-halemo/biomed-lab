// Small image helpers shared by the imaging tools.

/** Single-channel float image, row-major. */
export interface Gray {
  w: number;
  h: number;
  data: Float32Array;
}

/** RGB image with float channels, row-major interleaved (r,g,b). */
export interface RGB {
  w: number;
  h: number;
  data: Float32Array;
}

export function makeGray(w: number, h: number, fill = 0): Gray {
  const data = new Float32Array(w * h);
  if (fill) data.fill(fill);
  return { w, h, data };
}

/** Luma as in the original apps: Y = 0.299 R + 0.587 G + 0.114 B. */
export function rgbaToGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const out = makeGray(w, h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    out.data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return out;
}

export function rgbaToRgb(rgba: Uint8ClampedArray, w: number, h: number): RGB {
  const data = new Float32Array(w * h * 3);
  for (let i = 0, j = 0, k = 0; i < w * h; i++, j += 4, k += 3) {
    data[k] = rgba[j];
    data[k + 1] = rgba[j + 1];
    data[k + 2] = rgba[j + 2];
  }
  return { w, h, data };
}

export function minMax(a: ArrayLike<number>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** Rescale to 0..255 like ((x - min) / (max - min)) * 255 in the originals. */
export function normalize255(a: ArrayLike<number>): Float32Array {
  const [lo, hi] = minMax(a);
  const out = new Float32Array(a.length);
  const s = hi > lo ? 255 / (hi - lo) : 0;
  for (let i = 0; i < a.length; i++) out[i] = (a[i] - lo) * s;
  return out;
}

export function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Bilinear resample of a gray image to an exact size (used to bring inputs to a working size). */
export function resizeGray(src: Gray, w: number, h: number): Gray {
  const out = makeGray(w, h);
  const sx = src.w / w;
  const sy = src.h / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(src.h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(src.h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(src.w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(src.w - 1, x0 + 1);
      const tx = fx - x0;
      const a = src.data[y0 * src.w + x0];
      const b = src.data[y0 * src.w + x1];
      const c = src.data[y1 * src.w + x0];
      const d = src.data[y1 * src.w + x1];
      out.data[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

/** Area-average downscale + bilinear upscale to a square power-of-two working image (centre crop). */
export function toSquare(src: Gray, n: number): Gray {
  const s = Math.min(src.w, src.h);
  const ox = Math.floor((src.w - s) / 2);
  const oy = Math.floor((src.h - s) / 2);
  const crop = makeGray(s, s);
  for (let y = 0; y < s; y++) {
    crop.data.set(src.data.subarray((y + oy) * src.w + ox, (y + oy) * src.w + ox + s), y * s);
  }
  if (s === n) return crop;
  if (s > n * 1.5) {
    // box-average first so we don't alias when shrinking a lot
    const f = Math.floor(s / n);
    const m = Math.floor(s / f);
    const small = makeGray(m, m);
    for (let y = 0; y < m; y++)
      for (let x = 0; x < m; x++) {
        let acc = 0;
        for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) acc += crop.data[(y * f + j) * s + x * f + i];
        small.data[y * m + x] = acc / (f * f);
      }
    return resizeGray(small, n, n);
  }
  return resizeGray(crop, n, n);
}

/** Fit inside maxSide keeping aspect ratio (bilinear with box prefilter when shrinking). */
export function fitGray(src: Gray, maxSide: number): Gray {
  const sc = Math.min(1, maxSide / Math.max(src.w, src.h));
  if (sc === 1) return src;
  const w = Math.max(1, Math.round(src.w * sc));
  const h = Math.max(1, Math.round(src.h * sc));
  const f = Math.floor(1 / sc);
  if (f >= 2) {
    const mw = Math.floor(src.w / f);
    const mh = Math.floor(src.h / f);
    const small = makeGray(mw, mh);
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        let acc = 0;
        for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) acc += src.data[(y * f + j) * src.w + x * f + i];
        small.data[y * mw + x] = acc / (f * f);
      }
    return resizeGray(small, w, h);
  }
  return resizeGray(src, w, h);
}

/** Write a gray image (values in [lo, hi]) into RGBA bytes. */
export function grayToRGBA(g: Gray, lo = 0, hi = 255, out?: Uint8ClampedArray): Uint8ClampedArray {
  const px = out ?? new Uint8ClampedArray(g.w * g.h * 4);
  const s = hi > lo ? 255 / (hi - lo) : 0;
  for (let i = 0, j = 0; i < g.w * g.h; i++, j += 4) {
    const v = (g.data[i] - lo) * s;
    px[j] = px[j + 1] = px[j + 2] = v;
    px[j + 3] = 255;
  }
  return px;
}

export function psnr(a: ArrayLike<number>, b: ArrayLike<number>, peak = 255): number {
  let mse = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    mse += d * d;
  }
  mse /= a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((peak * peak) / mse);
}

/** Python-style round (round half to even), used where the originals call round(). */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5 && r % 2 !== 0) return r - 1;
  return r;
}
