// Zoom by nearest-neighbour and bilinear interpolation, ported from Task2-ZOOM (showKNN / ShowBilinear).
import { type Gray, makeGray, roundHalfEven } from './image';

/**
 * Nearest neighbour: zoomed[i, j] = Y[round(i / F), round(j / F)],
 * falling back to int() (floor) when the rounded index would leave the image.
 */
export function zoomNearest(src: Gray, factor: number): Gray {
  if (!(factor > 0)) throw new Error('zoom factor must be positive');
  const nh = Math.floor(factor * src.h);
  const nw = Math.floor(factor * src.w);
  const out = makeGray(nw, nh);
  for (let i = 0; i < nh; i++) {
    const fi = i / factor;
    for (let j = 0; j < nw; j++) {
      const fj = j / factor;
      let si: number;
      let sj: number;
      if (fi > src.h - 1 || fj > src.w - 1) {
        si = Math.floor(fi);
        sj = Math.floor(fj);
      } else {
        si = roundHalfEven(fi);
        sj = roundHalfEven(fj);
      }
      si = Math.min(src.h - 1, si);
      sj = Math.min(src.w - 1, sj);
      out.data[i * nw + j] = src.data[si * src.w + sj];
    }
  }
  return out;
}

/**
 * Bilinear: source coordinate x = i * (old_h / new_h), y = j * (old_w / new_w);
 * weights from floor/ceil neighbours, with the same special cases as the original.
 */
export function zoomBilinear(src: Gray, factor: number): Gray {
  if (!(factor > 0)) throw new Error('zoom factor must be positive');
  const nh = Math.floor(factor * src.h);
  const nw = Math.floor(factor * src.w);
  const out = makeGray(nw, nh);
  const oh = src.h;
  const ow = src.w;
  const hs = nh !== 0 ? oh / nh : 0;
  const ws = nw !== 0 ? ow / nw : 0;
  const at = (r: number, c: number) => src.data[r * ow + c];
  for (let i = 0; i < nh; i++) {
    const x = i * hs;
    const xf = Math.floor(x);
    const xc = Math.min(oh - 1, Math.ceil(x));
    for (let j = 0; j < nw; j++) {
      const y = j * ws;
      const yf = Math.floor(y);
      const yc = Math.min(ow - 1, Math.ceil(y));
      let q: number;
      if (xc === xf && yc === yf) {
        q = at(Math.floor(x), Math.floor(y));
      } else if (xc === xf) {
        q = at(Math.floor(x), yf) * (yc - y) + at(Math.floor(x), yc) * (y - yf);
      } else if (yc === yf) {
        q = at(xf, Math.floor(y)) * (xc - x) + at(xc, Math.floor(y)) * (x - xf);
      } else {
        const q1 = at(xf, yf) * (xc - x) + at(xc, yf) * (x - xf);
        const q2 = at(xf, yc) * (xc - x) + at(xc, yc) * (x - xf);
        q = q1 * (yc - y) + q2 * (y - yf);
      }
      out.data[i * nw + j] = q;
    }
  }
  return out;
}

/** Cut a rectangle out of an image (clamped to bounds). */
export function crop(src: Gray, x0: number, y0: number, w: number, h: number): Gray {
  const out = makeGray(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.h - 1, Math.max(0, y0 + y));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.w - 1, Math.max(0, x0 + x));
      out.data[y * w + x] = src.data[sy * src.w + sx];
    }
  }
  return out;
}
