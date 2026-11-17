import { describe, expect, it } from 'vitest';
import { dftNaive, fft2, fftInPlace, fftRecursive, fftshift } from './fft';
import { makeGray, roundHalfEven, type Gray } from './image';
import { zoomBilinear, zoomNearest } from './interp';
import { cdf, equalize, normalizedHistogram } from './histogram';
import { boxBlur, unsharpMask, addNoise, medianFilter, noisePhantom, roiStats } from './filters';
import { boxBlurFrequency, forward, inverse, mix } from './fourier2d';
import { correlation, iradon, linspaceAngles, radon, rmse, sheppLogan } from './radon';
import { align, alignmentScore, centerStar, parseFasta, percentNoGaps, sumOfPairs } from './align';
import { allPassZero, freqResponse, freqz, lfilter, polyFromRoots, withConjugates } from './zplane';
import { features, hashFeatures, LIBRARY, renderTrack, similarity, addWhiteNoise, SR } from './audio';
import { sampleAt, sincReconstruct } from './signal';
import { kirsch, label8, reconstruct, medianU8 } from './exudate';
import { marchingCubes } from './mc';
import { mulberry32 } from './rng';

const rand = mulberry32(42);
const randArr = (n: number) => Array.from({ length: n }, () => rand() * 2 - 1);

describe('FFT', () => {
  it('recursive FFT matches the naive DFT', () => {
    for (const n of [1, 2, 8, 64, 256]) {
      const re = randArr(n);
      const im = randArr(n);
      const a = dftNaive(re, im);
      const b = fftRecursive(re, im);
      for (let k = 0; k < n; k++) {
        expect(b.re[k]).toBeCloseTo(a.re[k], 8);
        expect(b.im[k]).toBeCloseTo(a.im[k], 8);
      }
    }
  });
  it('iterative FFT matches DFT and inverts', () => {
    const re0 = Float64Array.from(randArr(128));
    const re = re0.slice();
    const im = new Float64Array(128);
    const d = dftNaive(re0);
    fftInPlace(re, im);
    for (let k = 0; k < 128; k++) expect(re[k]).toBeCloseTo(d.re[k], 8);
    fftInPlace(re, im, true);
    for (let k = 0; k < 128; k++) expect(re[k]).toBeCloseTo(re0[k], 10);
  });
  it('2-D FFT round trip and DC term', () => {
    const w = 16;
    const h = 8;
    const re = Float64Array.from(randArr(w * h));
    const orig = re.slice();
    const im = new Float64Array(w * h);
    fft2(re, im, w, h);
    const sum = orig.reduce((a, b) => a + b, 0);
    expect(re[0]).toBeCloseTo(sum, 8);
    fft2(re, im, w, h, true);
    for (let i = 0; i < w * h; i++) expect(re[i]).toBeCloseTo(orig[i], 10);
  });
  it('fftshift moves DC to the centre', () => {
    const a = new Float64Array(16);
    a[0] = 1;
    const s = fftshift(a, 4, 4);
    expect(s[2 * 4 + 2]).toBe(1);
  });
});

describe('interpolation', () => {
  const src: Gray = { w: 2, h: 2, data: Float32Array.from([0, 10, 20, 30]) };
  it('nearest neighbour x2 repeats pixels like the original (round half to even)', () => {
    const z = zoomNearest(src, 2);
    expect(z.w).toBe(4);
    // i/F = 0, .5, 1, 1.5 -> round half even = 0, 0, 1, 2(>1 -> int=1)
    expect(Array.from(z.data.slice(0, 4))).toEqual([0, 0, 10, 10]);
    expect(Array.from(z.data.slice(12, 16))).toEqual([20, 20, 30, 30]);
  });
  it('python-style rounding', () => {
    expect(roundHalfEven(0.5)).toBe(0);
    expect(roundHalfEven(1.5)).toBe(2);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
  });
  it('bilinear x2 interpolates between neighbours', () => {
    const z = zoomBilinear(src, 2);
    // x = i * 0.5, y = j * 0.5
    expect(Array.from(z.data.slice(0, 4))).toEqual([0, 5, 10, 10]);
    expect(z.data[1 * 4 + 1]).toBeCloseTo(15); // centre of the 4 pixels
  });
  it('bilinear reproduces a linear ramp exactly inside the image', () => {
    const g = makeGray(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.data[y * 8 + x] = 3 * x + 5 * y;
    const z = zoomBilinear(g, 4);
    for (let i = 0; i < 28; i++)
      for (let j = 0; j < 28; j++) expect(z.data[i * z.w + j]).toBeCloseTo(3 * (j / 4) + 5 * (i / 4), 4);
  });
});

describe('histogram equalization', () => {
  it('CDF ends at 1 and is monotonic', () => {
    const g = makeGray(32, 32);
    g.data.forEach((_, i) => (g.data[i] = Math.floor(rand() * 100)));
    const c = cdf(normalizedHistogram(g));
    expect(c[255]).toBeCloseTo(1, 12);
    for (let i = 1; i < 256; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
  });
  it('maps a two-level image to round(255 * cdf)', () => {
    const g = makeGray(4, 1);
    g.data.set([10, 10, 10, 200]);
    const e = equalize(g);
    expect(Array.from(e.image.data)).toEqual([191, 191, 191, 255]); // round(0.75*255)=191
    expect(e.map[10]).toBe(191);
  });
  it('flattens the histogram of a low-contrast image', () => {
    const g = makeGray(64, 64);
    g.data.forEach((_, i) => (g.data[i] = 100 + (i % 32)));
    const e = equalize(g);
    let lo = 255;
    let hi = 0;
    for (const v of e.image.data) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(hi).toBe(255);
    expect(lo).toBeLessThan(10);
  });
});

describe('spatial filters', () => {
  it('box blur of a constant (replicate) is the constant; zero padding darkens the border', () => {
    const g = makeGray(10, 10, 100);
    expect(boxBlur(g, 3, 'replicate').data[0]).toBeCloseTo(100);
    expect(boxBlur(g, 3, 'zero').data[0]).toBeCloseTo((100 * 4) / 9);
    expect(boxBlur(g, 3, 'zero').data[55]).toBeCloseTo(100);
  });
  it('unsharp mask leaves flat regions unchanged and boosts edges', () => {
    const g = makeGray(20, 20, 50);
    for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) g.data[y * 20 + x] = 150;
    const { out } = unsharpMask(g, 3, 1, 'replicate');
    expect(out.data[10 * 20 + 3]).toBeCloseTo(50);
    expect(out.data[10 * 20 + 10]).toBeGreaterThan(150);
    expect(out.data[10 * 20 + 9]).toBeLessThan(50);
  });
  it('gaussian noise statistics in a flat ROI match sigma', () => {
    const p = noisePhantom();
    const n = addNoise(p, { kind: 'gaussian', mean: 0, sigma: 10, seed: 7 });
    const s = roiStats(n, 42, 42, 62, 62); // corner of the 150 square, outside the disk
    expect(s.mean).toBeCloseTo(150, 0);
    expect(Math.abs(s.sigma - 10)).toBeLessThan(0.8);
  });
  it('median filter removes salt and pepper on a flat image', () => {
    const g = makeGray(64, 64, 100);
    const n = addNoise(g, { kind: 'saltpepper', amount: 200, seed: 3 });
    const m = medianFilter(n, 3);
    let bad = 0;
    for (const v of m.data) if (v !== 100) bad++;
    expect(bad).toBeLessThan(5);
  });
});

describe('frequency domain', () => {
  it('frequency-domain box filter equals circular spatial box blur', () => {
    const g = makeGray(32, 32);
    g.data.forEach((_, i) => (g.data[i] = rand() * 255));
    const f = boxBlurFrequency(g, 3);
    // compare with circular 3x3 mean
    for (const [y, x] of [
      [5, 5],
      [16, 20],
      [0, 0],
      [31, 31],
    ]) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += g.data[((y + j + 32) % 32) * 32 + ((x + i + 32) % 32)];
      expect(f.data[y * 32 + x]).toBeCloseTo(s / 9, 4);
    }
  });
  it('mixing magnitude of A with phase of A (weights 1) reproduces A', () => {
    const a = makeGray(16, 16);
    const b = makeGray(16, 16);
    a.data.forEach((_, i) => (a.data[i] = rand() * 255));
    b.data.forEach((_, i) => (b.data[i] = rand() * 255));
    const A = forward(a);
    const B = forward(b);
    const out = mix({ a: A, b: B, comp1: 'magnitude', img1: 'A', w1: 1, comp2: 'phase', img2: 'A', w2: 1 });
    for (let i = 0; i < 256; i++) expect(out.data[i]).toBeCloseTo(a.data[i], 3);
    const back = inverse(A);
    expect(back.data[17]).toBeCloseTo(a.data[17], 4);
  });
});

describe('CT back-projection', () => {
  const n = 96;
  const ph = sheppLogan(n);
  const angles = linspaceAngles(n);
  const sino = radon(ph, angles);
  it('sinogram columns integrate to the image mass', () => {
    const mass = ph.data.reduce((a, b) => a + b, 0);
    for (const a of [0, 17, 50]) {
      let s = 0;
      for (let t = 0; t < n; t++) s += sino.data[t * sino.nAng + a];
      expect(s / mass).toBeGreaterThan(0.97);
      expect(s / mass).toBeLessThan(1.03);
    }
  });
  it('ramp-filtered back-projection reconstructs the phantom; unfiltered is blurry', () => {
    const fbp = iradon(sino.data, n, angles, 'ramp');
    const bp = iradon(sino.data, n, angles, 'none');
    const cF = correlation(fbp.data, ph.data);
    const cB = correlation(bp.data, ph.data);
    expect(cF).toBeGreaterThan(0.9);
    expect(cB).toBeLessThan(cF);
    expect(rmse(fbp.data, ph.data)).toBeLessThan(0.15);
    // hamming is also a good reconstruction
    expect(correlation(iradon(sino.data, n, angles, "hamming").data, ph.data)).toBeGreaterThan(0.85);
  });
  it('fewer angles gives a worse reconstruction', () => {
    const few = linspaceAngles(8);
    const s8 = radon(ph, few);
    const r8 = iradon(s8.data, n, few, 'ramp');
    const full = iradon(sino.data, n, angles, 'ramp');
    expect(rmse(r8.data, ph.data)).toBeGreaterThan(rmse(full.data, ph.data));
  });
});

describe('sequence alignment', () => {
  it('Needleman-Wunsch textbook example (GATTACA / GCATGCU, +1/-1/-1) scores 0', () => {
    const r = align('GATTACA', 'GCATGCU', 'global', { match: 1, mismatch: -1, gap: -1 });
    expect(r.score).toBe(0);
    expect(r.dp.score[r.dp.score.length - 1]).toBe(0);
    expect(r.a.replace(/-/g, '')).toBe('GATTACA');
    expect(r.b.replace(/-/g, '')).toBe('GCATGCU');
  });
  it('Smith-Waterman textbook example (TGTTACGG / GGTTGACTA, +3/-3/-2) scores 13', () => {
    const r = align('TGTTACGG', 'GGTTGACTA', 'local', { match: 3, mismatch: -3, gap: -2 });
    expect(r.dp.best.value).toBe(13);
    expect(r.score).toBe(13);
    expect(r.a).toBe('GTT-AC');
    expect(r.b).toBe('GTTGAC');
  });
  it('global score from the matrix equals the score of the traced alignment', () => {
    const s = { match: 2, mismatch: -1, gap: -2 };
    const r = align('ACGTTGCAAGT', 'ACTTGCATGT', 'global', s);
    expect(alignmentScore(r.a, r.b, s)).toBe(r.dp.score[r.dp.score.length - 1]);
  });
  it('centre-star MSA keeps every sequence and aligns columns', () => {
    const seqs = ['ACGTACGT', 'ACGACGT', 'ACGTTACGT', 'ACTACGT'];
    const { aligned } = centerStar(seqs, { match: 2, mismatch: -1, gap: -2 });
    const L = aligned[0].length;
    aligned.forEach((a, i) => {
      expect(a.length).toBe(L);
      expect(a.replace(/-/g, '')).toBe(seqs[i]);
    });
    expect(percentNoGaps(aligned)).toBeLessThanOrEqual(100);
    expect(sumOfPairs(['AC', 'AC'])).toBe(2);
    expect(sumOfPairs(['A-', 'AC'])).toBe(-1);
  });
  it('parses FASTA', () => {
    const r = parseFasta('>one\nACG\nT\n>two\nGG');
    expect(r).toEqual([
      { name: 'one', seq: 'ACGT' },
      { name: 'two', seq: 'GG' },
    ]);
  });
});

describe('pole-zero filters', () => {
  it('a zero at -1 is a low-pass: |H(0)| = 2, |H(pi)| = 0', () => {
    const r = freqResponse([{ re: -1, im: 0 }], [], 101);
    expect(r.mag[0]).toBeCloseTo(2);
    expect(r.mag[100]).toBeCloseTo(0);
  });
  it('root form matches expanded coefficients (zpk2tf + freqz)', () => {
    const zeros = withConjugates([{ re: 0.3, im: 0.8 }]);
    const poles = withConjugates([{ re: 0.5, im: 0.4 }, { re: -0.7, im: 0 }]);
    const a = freqResponse(zeros, poles, 64);
    const b = freqz(polyFromRoots(zeros), polyFromRoots(poles), 64);
    for (let k = 0; k < 64; k++) {
      expect(a.mag[k]).toBeCloseTo(b.mag[k], 9);
      expect(Math.cos(a.phase[k])).toBeCloseTo(Math.cos(b.phase[k]), 9);
    }
    // conjugate pairs give real coefficients
    for (const c of polyFromRoots(poles)) expect(Math.abs(c.im)).toBeLessThan(1e-12);
  });
  it('biquad from conjugate poles matches the textbook coefficients', () => {
    const r = 0.9;
    const th = Math.PI / 4;
    const a = polyFromRoots(withConjugates([{ re: r * Math.cos(th), im: r * Math.sin(th) }]));
    expect(a[1].re).toBeCloseTo(-2 * r * Math.cos(th));
    expect(a[2].re).toBeCloseTo(r * r);
  });
  it('all-pass section has unit magnitude', () => {
    const p = { re: 0.5, im: 0.3 };
    const r = freqResponse([allPassZero(p)], [p], 50);
    const g = r.mag[0];
    for (const m of r.mag) expect(m / g).toBeCloseTo(1, 9);
  });
  it('impulse response of a single pole at 0.5 is 0.5^n', () => {
    const x = new Float64Array(8);
    x[0] = 1;
    const y = lfilter([{ re: 1, im: 0 }], polyFromRoots([{ re: 0.5, im: 0 }]), x);
    for (let n = 0; n < 8; n++) expect(y[n]).toBeCloseTo(0.5 ** n);
  });
});

describe('audio fingerprint', () => {
  it('a noisy excerpt is matched to its source track', () => {
    const tracks = LIBRARY.slice(0, 4).map((t) => renderTrack(t, 6));
    const lib = tracks.map((x) => hashFeatures(features(x)));
    const query = addWhiteNoise(tracks[2], 15);
    const q = hashFeatures(features(query));
    const scores = lib.map((h) => similarity(q, h).total);
    const best = scores.indexOf(Math.max(...scores));
    expect(best).toBe(2);
    expect(SR).toBe(11025);
  });
});

describe('sampling', () => {
  it('sinc reconstruction recovers a band-limited sine sampled above Nyquist', () => {
    const fsDense = 1000;
    const x = Array.from({ length: 2000 }, (_, i) => Math.sin(2 * Math.PI * 5 * (i / fsDense)));
    const s = sampleAt(x, fsDense, 40);
    const at = Array.from({ length: 200 }, (_, i) => 0.5 + i / 1000);
    const y = sincReconstruct(s, 40, at);
    let err = 0;
    at.forEach((t, i) => (err = Math.max(err, Math.abs(y[i] - Math.sin(2 * Math.PI * 5 * t)))));
    expect(err).toBeLessThan(0.05);
  });
});

describe('exudate pipeline pieces', () => {
  it('reconstruction by dilation fills a regional maximum down to its surroundings', () => {
    const w = 7;
    const h = 7;
    const mask = new Float32Array(w * h).fill(10);
    mask[3 * w + 3] = 50; // bright spot
    const marker = mask.map((v) => v - 1);
    marker[3 * w + 3] = 9;
    const r = reconstruct(marker, mask, w, h);
    expect(r[3 * w + 3]).toBe(9);
    expect(r[0]).toBe(9);
  });
  it('median of zero-padded uint8 matches brute force', () => {
    const w = 9;
    const h = 7;
    const src = new Uint8Array(w * h).map(() => Math.floor(rand() * 255));
    const m = medianU8(src, w, h, 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v: number[] = [];
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) v.push(y + j < 0 || y + j >= h || x + i < 0 || x + i >= w ? 0 : src[(y + j) * w + x + i]);
        v.sort((a, b) => a - b);
        expect(m[y * w + x]).toBe(v[4]);
      }
  });
  it('Kirsch is zero on a flat interior and labels count 8-connected blobs', () => {
    const img = new Float32Array(25).fill(1);
    expect(kirsch(img, 5, 5)[12]).toBeCloseTo(0);
    const m = new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(label8(m, 3, 3).count).toBe(1);
  });
});

describe('marching cubes', () => {
  it('extracts a closed sphere-like surface', () => {
    const n = 20;
    const d = new Uint8Array(n * n * n);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) d[(z * n + y) * n + x] = Math.hypot(x - 9.5, y - 9.5, z - 9.5) < 6 ? 200 : 0;
    const m = marchingCubes(d, n, n, n, 100);
    expect(m.triangles).toBeGreaterThan(100);
    for (let i = 0; i < m.positions.length; i += 3) {
      const r = Math.hypot(m.positions[i] - 9.5, m.positions[i + 1] - 9.5, m.positions[i + 2] - 9.5);
      expect(r).toBeGreaterThan(4.5);
      expect(r).toBeLessThan(7.5);
    }
  });
});
