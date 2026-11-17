// Fourier transforms.
// dftNaive and fftRecursive follow the C++ project (Fourier.cpp): an O(N^2) DFT
// and a recursive radix-2 decimation-in-time FFT. fftInPlace is an iterative
// version used for the heavier 2-D image work.

export interface Complex {
  re: Float64Array;
  im: Float64Array;
}

export function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** O(N^2) discrete Fourier transform, X[k] = sum x[n] e^{-j 2pi k n / N}. */
export function dftNaive(re: ArrayLike<number>, im?: ArrayLike<number>): Complex {
  const N = re.length;
  const outRe = new Float64Array(N);
  const outIm = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let sr = 0;
    let si = 0;
    for (let n = 0; n < N; n++) {
      const a = ((2 * Math.PI) / N) * k * n;
      const c = Math.cos(a);
      const s = -Math.sin(a);
      const xr = re[n];
      const xi = im ? im[n] : 0;
      sr += xr * c - xi * s;
      si += xr * s + xi * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}

/** Recursive radix-2 FFT (N must be a power of two), same structure as the C++ FFT(). */
export function fftRecursive(re: ArrayLike<number>, im?: ArrayLike<number>): Complex {
  const N = re.length;
  if (!isPow2(N)) throw new Error('FFT size must be a power of two');
  const xr = Float64Array.from(re);
  const xi = im ? Float64Array.from(im) : new Float64Array(N);
  return rec(xr, xi);
}

function rec(xr: Float64Array, xi: Float64Array): Complex {
  const N = xr.length;
  if (N === 1) return { re: xr, im: xi };
  const M = N / 2;
  const er = new Float64Array(M);
  const ei = new Float64Array(M);
  const or = new Float64Array(M);
  const oi = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    er[i] = xr[2 * i];
    ei[i] = xi[2 * i];
    or[i] = xr[2 * i + 1];
    oi[i] = xi[2 * i + 1];
  }
  const E = rec(er, ei);
  const O = rec(or, oi);
  const outR = new Float64Array(N);
  const outI = new Float64Array(N);
  for (let k = 0; k < M; k++) {
    const a = (-2 * Math.PI * k) / N;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tr = c * O.re[k] - s * O.im[k];
    const ti = c * O.im[k] + s * O.re[k];
    outR[k] = E.re[k] + tr;
    outI[k] = E.im[k] + ti;
    outR[k + M] = E.re[k] - tr;
    outI[k + M] = E.im[k] - ti;
  }
  return { re: outR, im: outI };
}

/** Iterative in-place radix-2 FFT. inverse=true computes the unnormalised inverse then divides by N. */
export function fftInPlace(re: Float64Array, im: Float64Array, inverse = false): void {
  const N = re.length;
  if (!isPow2(N)) throw new Error('FFT size must be a power of two');
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < N; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < N; i++) {
      re[i] /= N;
      im[i] /= N;
    }
  }
}

/** 2-D FFT of a w*h row-major complex image (w and h powers of two). In place. */
export function fft2(re: Float64Array, im: Float64Array, w: number, h: number, inverse = false): void {
  const rr = new Float64Array(w);
  const ri = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    rr.set(re.subarray(o, o + w));
    ri.set(im.subarray(o, o + w));
    fftInPlace(rr, ri, inverse);
    re.set(rr, o);
    im.set(ri, o);
  }
  const cr = new Float64Array(h);
  const ci = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      cr[y] = re[y * w + x];
      ci[y] = im[y * w + x];
    }
    fftInPlace(cr, ci, inverse);
    for (let y = 0; y < h; y++) {
      re[y * w + x] = cr[y];
      im[y * w + x] = ci[y];
    }
  }
}

/** Swap quadrants so the zero frequency sits at the centre (numpy fftshift for even sizes). */
export function fftshift<T extends Float64Array | Float32Array>(a: T, w: number, h: number): T {
  const out = new (a.constructor as { new (n: number): T })(a.length);
  const hw = w >> 1;
  const hh = h >> 1;
  for (let y = 0; y < h; y++) {
    const ny = (y + hh) % h;
    for (let x = 0; x < w; x++) {
      out[ny * w + ((x + hw) % w)] = a[y * w + x];
    }
  }
  return out;
}

/** Inverse of fftshift (identical for even sizes). */
export const ifftshift = fftshift;
