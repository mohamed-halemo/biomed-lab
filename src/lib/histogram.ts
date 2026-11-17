// Histogram + equalization, ported from Task3-Equalization (NormalizeHistogram / EqualizedHistogram).
import { type Gray, makeGray, roundHalfEven } from './image';

/** 256-bin histogram of round(values) (values outside 0..255 are clamped). */
export function histogram(g: Gray): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i++) {
    let v = roundHalfEven(g.data[i]);
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    h[v]++;
  }
  return h;
}

/** Histogram divided by the number of pixels. */
export function normalizedHistogram(g: Gray): Float64Array {
  const h = histogram(g);
  const n = g.w * g.h;
  const out = new Float64Array(256);
  for (let i = 0; i < 256; i++) out[i] = h[i] / n;
  return out;
}

/** Cumulative sum of the normalized histogram (ends at 1). */
export function cdf(p: ArrayLike<number>): Float64Array {
  const out = new Float64Array(p.length);
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += p[i];
    out[i] = acc;
  }
  return out;
}

/** Equalization map s_k = round(255 * cdf_k), and the equalized image NewIM[i,j] = map[im[i,j]]. */
export function equalize(g: Gray): { image: Gray; map: Int32Array; cdf: Float64Array } {
  const c = cdf(normalizedHistogram(g));
  const map = new Int32Array(256);
  for (let i = 0; i < 256; i++) map[i] = roundHalfEven(c[i] * 255);
  const image = makeGray(g.w, g.h);
  for (let i = 0; i < g.data.length; i++) {
    let v = roundHalfEven(g.data[i]);
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    image.data[i] = map[v];
  }
  return { image, map, cdf: c };
}
