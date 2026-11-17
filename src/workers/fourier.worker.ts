import { expose } from './rpc';
import { applyMask, boxBlurFrequency, forward, inverse, logMagnitude, lowPassMask, mix, phase, type MaskShape, type MixComponent, type Spectrum } from '../lib/fourier2d';
import { boxBlur } from '../lib/filters';
import { fftshift } from '../lib/fft';
import type { Gray } from '../lib/image';

const spectra = new Map<string, Spectrum>();

expose({
  spectrum({ key, img }: { key: string; img: Gray }) {
    const s = forward(img);
    spectra.set(key, s);
    const re = Float32Array.from(s.re);
    const im = Float32Array.from(s.im);
    return { magnitude: logMagnitude(s), phase: phase(s), real: { w: s.w, h: s.h, data: fftshift(re, s.w, s.h) }, imaginary: { w: s.w, h: s.h, data: fftshift(im, s.w, s.h) } };
  },
  filter({ key, cutoff, shape, highPass }: { key: string; cutoff: number; shape: MaskShape; highPass: boolean }) {
    const s = spectra.get(key);
    if (!s) throw new Error('no spectrum');
    const m = lowPassMask(s.w, s.h, cutoff, shape);
    const f = applyMask(s, m, highPass);
    const vis = new Float64Array(m.length);
    for (let i = 0; i < m.length; i++) vis[i] = highPass ? 1 - m[i] : m[i];
    return { image: inverse(f), filteredSpectrum: logMagnitude(f), mask: { w: s.w, h: s.h, data: Float32Array.from(fftshift(vis, s.w, s.h)) } };
  },
  boxCompare({ img, k }: { img: Gray; k: number }) {
    const freq = boxBlurFrequency(img, k);
    const spatial = boxBlur(img, k, 'zero');
    const diff = new Float32Array(freq.data.length);
    let maxInner = 0;
    const r = (k - 1) / 2;
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const i = y * img.w + x;
        diff[i] = Math.abs(freq.data[i] - spatial.data[i]);
        if (x >= r && y >= r && x < img.w - r && y < img.h - r) maxInner = Math.max(maxInner, diff[i]);
      }
    return { freq, spatial, diff: { w: img.w, h: img.h, data: diff }, maxInner };
  },
  mix(p: { comp1: MixComponent; img1: 'A' | 'B'; w1: number; comp2: MixComponent; img2: 'A' | 'B'; w2: number }) {
    const a = spectra.get('A');
    const b = spectra.get('B');
    if (!a || !b) throw new Error('load both images first');
    return mix({ a, b, ...p });
  },
});
