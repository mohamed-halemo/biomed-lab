// CT reconstruction, following Task8-BackProjection which used skimage radon / iradon on the
// Shepp-Logan phantom: sinogram -> (filtered) back-projection with filter None / ramp / hamming.
import { fftInPlace, nextPow2 } from './fft';
import { type Gray, makeGray } from './image';

/** Modified Shepp-Logan ellipses (Toft), same intensities skimage uses. [A, a, b, x0, y0, phi(deg)] */
const ELLIPSES: number[][] = [
  [1, 0.69, 0.92, 0, 0, 0],
  [-0.8, 0.6624, 0.874, 0, -0.0184, 0],
  [-0.2, 0.11, 0.31, 0.22, 0, -18],
  [-0.2, 0.16, 0.41, -0.22, 0, 18],
  [0.1, 0.21, 0.25, 0, 0.35, 0],
  [0.1, 0.046, 0.046, 0, 0.1, 0],
  [0.1, 0.046, 0.046, 0, -0.1, 0],
  [0.1, 0.046, 0.023, -0.08, -0.605, 0],
  [0.1, 0.023, 0.023, 0, -0.606, 0],
  [0.1, 0.023, 0.046, 0.06, -0.605, 0],
];

export function sheppLogan(n: number): Gray {
  const g = makeGray(n, n);
  for (let r = 0; r < n; r++) {
    const y = 1 - (2 * r + 1) / n; // +1 at top
    for (let c = 0; c < n; c++) {
      const x = (2 * c + 1) / n - 1;
      let v = 0;
      for (const [A, a, b, x0, y0, phi] of ELLIPSES) {
        const t = (phi * Math.PI) / 180;
        const dx = x - x0;
        const dy = y - y0;
        const xr = dx * Math.cos(t) + dy * Math.sin(t);
        const yr = -dx * Math.sin(t) + dy * Math.cos(t);
        if ((xr * xr) / (a * a) + (yr * yr) / (b * b) <= 1) v += A;
      }
      g.data[r * n + c] = v;
    }
  }
  return g;
}

/** Evenly spaced angles in [0, 180) degrees, like np.linspace(0, 180, n, endpoint=False). */
export function linspaceAngles(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (180 * i) / n);
}

function sample(g: Gray, x: number, y: number): number {
  // bilinear, zero outside
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h ? 0 : g.data[yy * g.w + xx]);
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}

/**
 * Radon transform of a square image (circle assumption as in skimage's default): returns a sinogram
 * with n detector rows and one column per angle, stored row-major [detector][angle].
 */
export function radon(img: Gray, anglesDeg: number[]): { data: Float32Array; nDet: number; nAng: number } {
  const n = img.w;
  const nAng = anglesDeg.length;
  const out = new Float32Array(n * nAng);
  const c = (n - 1) / 2;
  for (let a = 0; a < nAng; a++) {
    const th = (anglesDeg[a] * Math.PI) / 180;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    for (let t = 0; t < n; t++) {
      const tt = t - c;
      let s = 0;
      for (let u = 0; u < n; u++) {
        const uu = u - c;
        // detector axis rotated by theta; integrate along the perpendicular
        const x = c + tt * cs - uu * sn;
        const y = c - (tt * sn + uu * cs);
        s += sample(img, x, y);
      }
      out[t * nAng + a] = s;
    }
  }
  return { data: out, nDet: n, nAng };
}

export type CTFilter = 'none' | 'ramp' | 'hamming' | 'shepp-logan';

/**
 * Frequency response of the reconstruction filter, built the same way as skimage's _get_fourier_filter:
 * the ramp is the FFT of the band-limited spatial ramp kernel (avoids the DC bias of a naive |f| ramp).
 */
export function fourierFilter(size: number, filter: CTFilter): Float64Array {
  const resp = new Float64Array(size);
  if (filter === 'none') {
    resp.fill(1);
    return resp;
  }
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re[0] = 0.25;
  for (let i = 1; i <= size / 2; i++) {
    if (i % 2 === 1) {
      const v = -1 / (Math.PI * i) ** 2;
      re[i] = v;
      re[size - i] = v;
    }
  }
  fftInPlace(re, im);
  for (let k = 0; k < size; k++) {
    let f = 2 * re[k];
    const omega = (Math.PI * (k <= size / 2 ? k : k - size)) / (size / 2) / 1; // -pi..pi
    const absW = Math.abs(omega);
    if (filter === 'hamming') {
      // np.fft.fftshift(np.hamming(size))
      const m = (k + size / 2) % size;
      f *= 0.54 - 0.46 * Math.cos((2 * Math.PI * m) / (size - 1));
    } else if (filter === 'shepp-logan') {
      if (k !== 0) f *= Math.sin(absW / 2) / (absW / 2);
    }
    resp[k] = f;
  }
  return resp;
}

/** Filter each projection (column) of the sinogram in the frequency domain. */
export function filterSinogram(sino: Float32Array, nDet: number, nAng: number, filter: CTFilter): Float32Array {
  if (filter === 'none') return sino.slice();
  const size = Math.max(64, nextPow2(2 * nDet));
  const H = fourierFilter(size, filter);
  const out = new Float32Array(sino.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let a = 0; a < nAng; a++) {
    re.fill(0);
    im.fill(0);
    for (let t = 0; t < nDet; t++) re[t] = sino[t * nAng + a];
    fftInPlace(re, im);
    for (let k = 0; k < size; k++) {
      re[k] *= H[k];
      im[k] *= H[k];
    }
    fftInPlace(re, im, true);
    for (let t = 0; t < nDet; t++) out[t * nAng + a] = re[t];
  }
  return out;
}

/**
 * Back-project projections [from, to) into an accumulator. Each projection is smeared back across the
 * image along its angle (linear interpolation on the detector axis).
 */
export function backprojectRange(acc: Float64Array, n: number, sino: Float32Array, nAng: number, anglesDeg: number[], from: number, to: number): void {
  const c = (n - 1) / 2;
  for (let a = from; a < to; a++) {
    const th = (anglesDeg[a] * Math.PI) / 180;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    for (let r = 0; r < n; r++) {
      const y = c - r;
      for (let col = 0; col < n; col++) {
        const x = col - c;
        const t = x * cs + y * sn + c;
        const t0 = Math.floor(t);
        if (t0 < 0 || t0 >= n - 1) continue;
        const ft = t - t0;
        acc[r * n + col] += sino[t0 * nAng + a] * (1 - ft) + sino[(t0 + 1) * nAng + a] * ft;
      }
    }
  }
}

/** Full (filtered) back-projection, scaled by pi / (2 * nAngles) like iradon, masked to the reconstruction circle. */
export function iradon(sino: Float32Array, nDet: number, anglesDeg: number[], filter: CTFilter): Gray {
  const nAng = anglesDeg.length;
  const f = filterSinogram(sino, nDet, nAng, filter);
  const acc = new Float64Array(nDet * nDet);
  backprojectRange(acc, nDet, f, nAng, anglesDeg, 0, nAng);
  return finishRecon(acc, nDet, nAng);
}

export function finishRecon(acc: Float64Array, n: number, nAngDone: number): Gray {
  const out = makeGray(n, n);
  const sc = nAngDone > 0 ? Math.PI / (2 * nAngDone) : 0;
  const c = (n - 1) / 2;
  const rr = (n / 2) ** 2;
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++) {
      const inside = (r - c) ** 2 + (col - c) ** 2 <= rr;
      out.data[r * n + col] = inside ? acc[r * n + col] * sc : 0;
    }
  return out;
}

export function rmse(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length);
}

export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return sab / Math.sqrt(saa * sbb);
}
