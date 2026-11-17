// Pole-zero filter design, following "Z-transform and plotting website" (zpk2tf + freqz, all-pass sections).

export interface C {
  re: number;
  im: number;
}

const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

/** Expand prod (1 - r_k z^-1) into coefficients [1, c1, c2, ...] (like np.poly / zpk2tf). */
export function polyFromRoots(roots: C[]): C[] {
  let p: C[] = [{ re: 1, im: 0 }];
  for (const r of roots) {
    const next: C[] = new Array(p.length + 1).fill(null).map(() => ({ re: 0, im: 0 }));
    for (let i = 0; i < p.length; i++) {
      next[i] = { re: next[i].re + p[i].re, im: next[i].im + p[i].im };
      const t = mul(p[i], r);
      next[i + 1] = { re: next[i + 1].re - t.re, im: next[i + 1].im - t.im };
    }
    p = next;
  }
  return p;
}

export interface Response {
  w: Float64Array; // 0..pi
  mag: Float64Array;
  phase: Float64Array; // radians, wrapped to (-pi, pi]
}

/** H(e^jw) = gain * prod(e^jw - z_k) / prod(e^jw - p_k), evaluated directly from the roots. */
export function freqResponse(zeros: C[], poles: C[], n = 512, gain = 1): Response {
  const w = new Float64Array(n);
  const mag = new Float64Array(n);
  const phase = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const om = (Math.PI * k) / (n - 1);
    w[k] = om;
    const e: C = { re: Math.cos(om), im: Math.sin(om) };
    let num: C = { re: gain, im: 0 };
    for (const z of zeros) num = mul(num, sub(e, z));
    let den: C = { re: 1, im: 0 };
    for (const p of poles) den = mul(den, sub(e, p));
    // align with the z^-1 form (zpk2tf/freqz): multiply by e^{-jw(nz - np)} ... i.e. z^{np - nz}
    const shift = poles.length - zeros.length;
    const s: C = { re: Math.cos(om * shift), im: Math.sin(om * shift) };
    const h = mul(div(num, den), s);
    mag[k] = Math.hypot(h.re, h.im);
    phase[k] = Math.atan2(h.im, h.re);
  }
  return { w, mag, phase };
}

/** Same response from the expanded coefficients b, a (freqz). Used to cross-check polyFromRoots. */
export function freqz(b: C[], a: C[], n = 512): Response {
  const w = new Float64Array(n);
  const mag = new Float64Array(n);
  const phase = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const om = (Math.PI * k) / (n - 1);
    w[k] = om;
    const ev = (c: C[]) => {
      let acc: C = { re: 0, im: 0 };
      c.forEach((ci, i) => {
        const e: C = { re: Math.cos(-om * i), im: Math.sin(-om * i) };
        const t = mul(ci, e);
        acc = { re: acc.re + t.re, im: acc.im + t.im };
      });
      return acc;
    };
    const h = div(ev(b), ev(a));
    mag[k] = Math.hypot(h.re, h.im);
    phase[k] = Math.atan2(h.im, h.re);
  }
  return { w, mag, phase };
}

export function unwrap(p: ArrayLike<number>): Float64Array {
  const out = Float64Array.from(p);
  let off = 0;
  for (let i = 1; i < out.length; i++) {
    const d = p[i] - p[i - 1];
    if (d > Math.PI) off -= 2 * Math.PI;
    else if (d < -Math.PI) off += 2 * Math.PI;
    out[i] = p[i] + off;
  }
  return out;
}

/** All-pass section with pole a has its zero at 1 / conj(a), giving |H| = 1 for all w. */
export function allPassZero(a: C): C {
  const d = a.re * a.re + a.im * a.im;
  return { re: a.re / d, im: a.im / d };
}

/** Run the difference equation y[n] = sum b_k x[n-k] - sum_{k>=1} a_k y[n-k]; returns Re{y}. */
export function lfilter(b: C[], a: C[], x: ArrayLike<number>): Float64Array {
  const N = x.length;
  const yr = new Float64Array(N);
  const yi = new Float64Array(N);
  const a0 = a[0];
  for (let n = 0; n < N; n++) {
    let sr = 0;
    let si = 0;
    for (let k = 0; k < b.length && k <= n; k++) {
      sr += b[k].re * x[n - k];
      si += b[k].im * x[n - k];
    }
    for (let k = 1; k < a.length && k <= n; k++) {
      sr -= a[k].re * yr[n - k] - a[k].im * yi[n - k];
      si -= a[k].re * yi[n - k] + a[k].im * yr[n - k];
    }
    const q = div({ re: sr, im: si }, a0);
    yr[n] = q.re;
    yi[n] = q.im;
  }
  return yr;
}

export function withConjugates(pts: C[]): C[] {
  const out: C[] = [];
  for (const p of pts) {
    out.push(p);
    if (Math.abs(p.im) > 1e-9) out.push({ re: p.re, im: -p.im });
  }
  return out;
}
