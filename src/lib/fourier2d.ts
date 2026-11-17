// 2-D Fourier tools for images: spectrum display (Task5/6), frequency-domain filtering, and the image mixer.
import { fft2, fftshift } from './fft';
import { type Gray, makeGray } from './image';

export interface Spectrum {
  w: number;
  h: number;
  re: Float64Array;
  im: Float64Array;
}

export function forward(g: Gray): Spectrum {
  const re = Float64Array.from(g.data);
  const im = new Float64Array(g.data.length);
  fft2(re, im, g.w, g.h);
  return { w: g.w, h: g.h, re, im };
}

export function inverse(s: Spectrum): Gray {
  const re = Float64Array.from(s.re);
  const im = Float64Array.from(s.im);
  fft2(re, im, s.w, s.h, true);
  const out = makeGray(s.w, s.h);
  for (let i = 0; i < re.length; i++) out.data[i] = re[i];
  return out;
}

/** Centred log magnitude scaled like the original: c = 255 / log(1 + max), c * log(1 + |F|). */
export function logMagnitude(s: Spectrum): Gray {
  const n = s.re.length;
  const mag = new Float64Array(n);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    mag[i] = Math.hypot(s.re[i], s.im[i]);
    if (mag[i] > mx) mx = mag[i];
  }
  const c = 255 / Math.log(1 + mx);
  const sh = fftshift(mag, s.w, s.h);
  const out = makeGray(s.w, s.h);
  for (let i = 0; i < n; i++) out.data[i] = c * Math.log(1 + sh[i]);
  return out;
}

/** Centred phase in radians (atan2). */
export function phase(s: Spectrum): Gray {
  const n = s.re.length;
  const ph = new Float64Array(n);
  for (let i = 0; i < n; i++) ph[i] = Math.atan2(s.im[i], s.re[i]);
  const sh = fftshift(ph, s.w, s.h);
  return { w: s.w, h: s.h, data: Float32Array.from(sh) };
}

/**
 * Box filter applied in the frequency domain, as in FourierLPF(): a k x k kernel of 1/k^2 placed in the
 * centre of a zero image, both transformed, multiplied, inverse transformed, then ifftshift-ed.
 * The result matches the spatial box blur with circular (wrap-around) borders.
 */
export function boxBlurFrequency(g: Gray, k: number): Gray {
  const { w, h } = g;
  const ker = new Float64Array(w * h);
  const kh = Math.floor((w - k + 1) / 2);
  const kw = Math.floor((h - k + 1) / 2);
  for (let i = kw; i < kw + k; i++) for (let j = kh; j < kh + k; j++) ker[i * w + j] = 1 / (k * k);
  const A = forward(g);
  const kre = ker;
  const kim = new Float64Array(w * h);
  fft2(kre, kim, w, h);
  const re = new Float64Array(w * h);
  const im = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    re[i] = A.re[i] * kre[i] - A.im[i] * kim[i];
    im[i] = A.re[i] * kim[i] + A.im[i] * kre[i];
  }
  fft2(re, im, w, h, true);
  const mag = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) mag[i] = Math.hypot(re[i], im[i]);
  const sh = fftshift(mag, w, h);
  return { w, h, data: Float32Array.from(sh) };
}

export type MaskShape = 'ideal' | 'gaussian' | 'butterworth';

/** Low-pass mask H(u,v) on the *unshifted* frequency grid; cutoff as a fraction of Nyquist (0..1). */
export function lowPassMask(w: number, h: number, cutoff: number, shape: MaskShape, order = 2): Float64Array {
  const m = new Float64Array(w * h);
  const d0 = cutoff * Math.min(w, h) * 0.5;
  for (let y = 0; y < h; y++) {
    const fy = y < h / 2 ? y : y - h;
    for (let x = 0; x < w; x++) {
      const fx = x < w / 2 ? x : x - w;
      const d = Math.hypot(fx, fy);
      let v: number;
      if (shape === 'ideal') v = d <= d0 ? 1 : 0;
      else if (shape === 'gaussian') v = Math.exp(-(d * d) / (2 * d0 * d0));
      else v = 1 / (1 + Math.pow(d / Math.max(d0, 1e-9), 2 * order));
      m[y * w + x] = v;
    }
  }
  return m;
}

export function applyMask(s: Spectrum, mask: Float64Array, highPass: boolean): Spectrum {
  const re = new Float64Array(s.re.length);
  const im = new Float64Array(s.re.length);
  for (let i = 0; i < re.length; i++) {
    const m = highPass ? 1 - mask[i] : mask[i];
    re[i] = s.re[i] * m;
    im[i] = s.im[i] * m;
  }
  return { w: s.w, h: s.h, re, im };
}

// ---- Image mixer (Images mixer/main.py) ----

export type MixComponent = 'magnitude' | 'phase' | 'uniform-magnitude' | 'uniform-phase' | 'real' | 'imaginary';

export interface MixInput {
  a: Spectrum;
  b: Spectrum;
  /** component 1 and which image it is weighted towards */
  comp1: MixComponent;
  img1: 'A' | 'B';
  w1: number; // 0..1
  comp2: MixComponent;
  img2: 'A' | 'B';
  w2: number;
}

function component(s: Spectrum, c: MixComponent): Float64Array {
  const n = s.re.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    switch (c) {
      case 'magnitude':
        out[i] = Math.hypot(s.re[i], s.im[i]);
        break;
      case 'phase':
        out[i] = Math.atan2(s.im[i], s.re[i]);
        break;
      case 'uniform-magnitude':
        out[i] = 1;
        break;
      case 'uniform-phase':
        out[i] = 0;
        break;
      case 'real':
        out[i] = s.re[i];
        break;
      case 'imaginary':
        out[i] = s.im[i];
        break;
    }
  }
  return out;
}

/** The partner component that completes component 1 (magnitude <-> phase, real <-> imaginary). */
export function partnerOptions(c: MixComponent): MixComponent[] {
  if (c === 'magnitude' || c === 'uniform-magnitude') return ['phase', 'uniform-phase'];
  if (c === 'phase' || c === 'uniform-phase') return ['magnitude', 'uniform-magnitude'];
  if (c === 'real') return ['imaginary'];
  return ['real'];
}

/**
 * RESULT = w * comp(chosen image) + (1 - w) * comp(other image), for each of the two components,
 * then ifft2(MAG * exp(j PHASE)) or ifft2(REAL + j IMAG). Returns |result|.
 */
export function mix(p: MixInput): Gray {
  const blend = (c: MixComponent, which: 'A' | 'B', w: number) => {
    const first = component(which === 'A' ? p.a : p.b, c);
    const second = component(which === 'A' ? p.b : p.a, c);
    const out = new Float64Array(first.length);
    for (let i = 0; i < out.length; i++) out[i] = first[i] * w + second[i] * (1 - w);
    return out;
  };
  const c1 = blend(p.comp1, p.img1, p.w1);
  const c2 = blend(p.comp2, p.img2, p.w2);
  const n = c1.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const isMagPhase = !(p.comp1 === 'real' || p.comp1 === 'imaginary');
  if (isMagPhase) {
    const magFirst = p.comp1 === 'magnitude' || p.comp1 === 'uniform-magnitude';
    const M = magFirst ? c1 : c2;
    const P = magFirst ? c2 : c1;
    for (let i = 0; i < n; i++) {
      re[i] = M[i] * Math.cos(P[i]);
      im[i] = M[i] * Math.sin(P[i]);
    }
  } else {
    const R = p.comp1 === 'real' ? c1 : c2;
    const I = p.comp1 === 'real' ? c2 : c1;
    re.set(R);
    im.set(I);
  }
  fft2(re, im, p.a.w, p.a.h, true);
  const out = makeGray(p.a.w, p.a.h);
  for (let i = 0; i < n; i++) out.data[i] = Math.hypot(re[i], im[i]);
  return out;
}
