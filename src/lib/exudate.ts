// Exudate candidate detection, ported from Exudate-based-detection-in-fundus-images (exDetect.py,
// misc/getFovMask.py, misc/kirschEdges.py), which follows Giancardo et al.'s exudate detector:
//  1. resize to 750 rows, take V (HSV) and the green plane
//  2. field-of-view mask, remove the optic-disc window
//  3. background = median filter (size rows/30) + morphological reconstruction; candidates = V - bg > 0
//  4. edge strength = Kirsch(G) - Kirsch(G with candidates removed by reconstruction)
//  5. score of each candidate region = mean edge strength over the region
import { type Gray, makeGray } from './image';

export interface RGBu8 {
  w: number;
  h: number;
  data: Uint8ClampedArray; // RGBA
}

export interface ExudateResult {
  w: number;
  h: number;
  v8: Uint8Array;
  fov: Uint8Array;
  background: Float32Array;
  candidates: Uint8Array;
  edge: Float32Array;
  score: Float32Array; // per-pixel lesion score (0 outside candidates)
  regions: { label: number; size: number; score: number; cx: number; cy: number }[];
  od: { x: number; y: number; x1: number; y1: number; x2: number; y2: number };
  kernel: number;
}

/** Size used by findGoodResolutionForWavelet: add 4 - (n mod 4) to each side. */
export function workingSize(h: number, w: number): [number, number] {
  const nh = 750;
  const nw = (750 * w) / h;
  const add = (v: number) => v + (4 - (v % 4));
  return [Math.round(add(nh)), Math.round(add(nw))];
}

function resizeChannel(src: Float32Array, sw: number, sh: number, w: number, h: number): Float32Array {
  // area-weighted when shrinking (anti-aliasing), bilinear otherwise
  const out = new Float32Array(w * h);
  const sx = sw / w;
  const sy = sh / h;
  if (sx > 1.2 || sy > 1.2) {
    for (let y = 0; y < h; y++) {
      const y0 = y * sy;
      const y1 = y0 + sy;
      for (let x = 0; x < w; x++) {
        const x0 = x * sx;
        const x1 = x0 + sx;
        let acc = 0;
        let wt = 0;
        for (let yy = Math.floor(y0); yy < Math.ceil(y1) && yy < sh; yy++) {
          const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
          for (let xx = Math.floor(x0); xx < Math.ceil(x1) && xx < sw; xx++) {
            const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
            acc += src[yy * sw + xx] * wx * wy;
            wt += wx * wy;
          }
        }
        out[y * w + x] = acc / wt;
      }
    }
    return out;
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      out[y * w + x] = (src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx) * (1 - ty) + (src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}

/** getFovMask: threshold at the first histogram level where it stops decreasing, erode with an ellipse, clear borders. */
export function fovMask(v8: Uint8Array, w: number, h: number, seSize = 30): Uint8Array {
  const hist = new Int32Array(256);
  for (const v of v8) hist[v]++;
  let lvl = 0;
  for (let i = 0; i < 255; i++)
    if (hist[i + 1] - hist[i] >= 0) {
      lvl = i;
      break;
    }
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = v8[i] > lvl ? 1 : 0;
  const er = erodeEllipse(m, w, h, seSize);
  const b = seSize * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((y >= 1 && y < b) || (x >= 1 && x < b) || (y >= h - 1 - b && y < h - 1) || (x >= w - 1 - b && x < w - 1)) er[y * w + x] = 0;
    }
  return er;
}

/** Binary erosion with OpenCV's MORPH_ELLIPSE(size x size); pixels outside the image count as foreground. */
export function erodeEllipse(m: Uint8Array, w: number, h: number, size: number): Uint8Array {
  const r = Math.floor(size / 2);
  const c = r;
  const rows: { dy: number; dx0: number; dx1: number }[] = [];
  for (let i = 0; i < size; i++) {
    const dy = i - r;
    if (Math.abs(dy) > r) continue;
    const dx = r > 0 ? Math.round(c * Math.sqrt((r * r - dy * dy) / (r * r))) : 0;
    const j1 = Math.max(c - dx, 0);
    const j2 = Math.min(c + dx + 1, size);
    rows.push({ dy, dx0: j1 - c, dx1: j2 - 1 - c });
  }
  // prefix count of zeros per row
  const pz = new Int32Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) s++;
      pz[y * (w + 1) + x + 1] = s;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (const { dy, dx0, dx1 } of rows) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const a = Math.max(0, x + dx0);
        const b = Math.min(w - 1, x + dx1);
        if (b < a) continue;
        if (pz[yy * (w + 1) + b + 1] - pz[yy * (w + 1) + a] > 0) {
          ok = 0;
          break;
        }
      }
      out[y * w + x] = ok;
    }
  return out;
}

/** scipy medfilt2d on uint8 with zero padding, via a sliding histogram (Huang). */
export function medianU8(src: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const r = (k - 1) >> 1;
  const out = new Uint8Array(w * h);
  const half = (k * k) >> 1;
  const hist = new Int32Array(256);
  for (let y = 0; y < h; y++) {
    hist.fill(0);
    // initial window at x = 0
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const yy = y + dy;
        const xx = dx;
        hist[yy < 0 || yy >= h || xx < 0 || xx >= w ? 0 : src[yy * w + xx]]++;
      }
    for (let x = 0; x < w; x++) {
      if (x > 0) {
        const xo = x - r - 1;
        const xn = x + r;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          const inY = yy >= 0 && yy < h;
          hist[inY && xo >= 0 && xo < w ? src[yy * w + xo] : 0]--;
          hist[inY && xn >= 0 && xn < w ? src[yy * w + xn] : 0]++;
        }
      }
      let acc = 0;
      let v = 0;
      for (; v < 256; v++) {
        acc += hist[v];
        if (acc > half) break;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

const N8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Grayscale reconstruction by dilation of marker under mask (8-connected), Vincent's hybrid algorithm.
 * Same fixed point as the repo's loop of dilate(3x3) followed by min(., mask).
 */
export function reconstruct(marker: Float32Array, mask: Float32Array, w: number, h: number): Float32Array {
  const J = new Float32Array(marker.length);
  for (let i = 0; i < J.length; i++) J[i] = Math.min(marker[i], mask[i]);
  // raster
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let m = J[p];
      if (x > 0) m = Math.max(m, J[p - 1]);
      if (y > 0) {
        m = Math.max(m, J[p - w]);
        if (x > 0) m = Math.max(m, J[p - w - 1]);
        if (x < w - 1) m = Math.max(m, J[p - w + 1]);
      }
      J[p] = Math.min(m, mask[p]);
    }
  const queue: number[] = [];
  let qh = 0;
  const push = (v: number) => {
    queue.push(v);
  };
  // anti-raster
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      let m = J[p];
      if (x < w - 1) m = Math.max(m, J[p + 1]);
      if (y < h - 1) {
        m = Math.max(m, J[p + w]);
        if (x < w - 1) m = Math.max(m, J[p + w + 1]);
        if (x > 0) m = Math.max(m, J[p + w - 1]);
      }
      J[p] = Math.min(m, mask[p]);
      const jp = J[p];
      const check = (q: number) => J[q] < jp && J[q] < mask[q];
      if ((x < w - 1 && check(p + 1)) || (y < h - 1 && (check(p + w) || (x < w - 1 && check(p + w + 1)) || (x > 0 && check(p + w - 1))))) push(p);
    }
  while (qh < queue.length) {
    const p = queue[qh++];
    const x = p % w;
    const y = (p - x) / w;
    for (const [dx, dy] of N8) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = yy * w + xx;
      if (J[q] < J[p] && mask[q] !== J[q]) {
        J[q] = Math.min(J[p], mask[q]);
        push(q);
      }
    }
  }
  return J;
}

const KIRSCH = [
  [5, -3, -3, 5, 0, -3, 5, -3, -3],
  [-3, -3, 5, -3, 0, 5, -3, -3, 5],
  [-3, -3, -3, 5, 0, -3, 5, 5, -3],
  [-3, 5, 5, -3, 0, 5, -3, -3, -3],
  [-3, -3, -3, -3, 0, -3, 5, 5, 5],
  [5, 5, 5, -3, 0, -3, -3, -3, -3],
  [-3, -3, -3, -3, 0, 5, -3, 5, 5],
  [5, 5, -3, 5, 0, -3, -3, -3, -3],
].map((k) => k.map((v) => v / 15));

/** Maximum response over the 8 Kirsch compass templates (zero padded, 'same' size). */
export function kirsch(img: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h).fill(-Infinity);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  for (const k of KIRSCH) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += k[(j + 1) * 3 + (i + 1)] * at(x + i, y + j);
        const p = y * w + x;
        if (s > out[p]) out[p] = s;
      }
  }
  return out;
}

export function label8(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h);
  let count = 0;
  const stack: number[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || labels[p]) continue;
    count++;
    labels[p] = count;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % w;
      const y = (q - x) / w;
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const r = yy * w + xx;
        if (mask[r] && !labels[r]) {
          labels[r] = count;
          stack.push(r);
        }
      }
    }
  }
  return { labels, count };
}

/** Optic disc guess: centre of the brightest large blob (box mean of V over a window ~ rows/8). */
export function guessOpticDisc(v: Float32Array, w: number, h: number): { x: number; y: number } {
  const r = Math.max(4, Math.round(h / 16));
  const S = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    for (let x = 0; x < w; x++) {
      rs += v[y * w + x];
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + rs;
    }
  }
  let best = -Infinity;
  let bx = w / 2;
  let by = h / 2;
  for (let y = r; y < h - r; y += 2)
    for (let x = r; x < w - r; x += 2) {
      const s = S[(y + r) * (w + 1) + x + r] - S[(y - r) * (w + 1) + x + r] - S[(y + r) * (w + 1) + x - r] + S[(y - r) * (w + 1) + x - r];
      if (s > best) {
        best = s;
        bx = x;
        by = y;
      }
    }
  return { x: bx, y: by };
}

/**
 * Run the detector. `od` is the optic-disc centre in original-image pixels (null = automatic guess).
 */
export function detectExudates(img: RGBu8, od: { x: number; y: number } | null): ExudateResult {
  const [H, W] = workingSize(img.h, img.w);
  const n0 = img.w * img.h;
  const ch = [0, 1, 2].map((c) => {
    const a = new Float32Array(n0);
    for (let i = 0; i < n0; i++) a[i] = img.data[i * 4 + c] / 255;
    return resizeChannel(a, img.w, img.h, W, H);
  });
  const n = W * H;
  const imgG = ch[1];
  const v = new Float32Array(n);
  const v8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = Math.max(ch[0][i], ch[1][i], ch[2][i]);
    v8[i] = Math.floor(v[i] * 255);
  }
  // optic disc window
  let onX: number;
  let onY: number;
  if (od) {
    onY = Math.round((od.y * H) / img.h);
    onX = Math.round((od.x * W) / img.w);
  } else {
    const g = guessOpticDisc(v, W, H);
    onX = g.x;
    onY = g.y;
  }
  const wy = H / 8;
  const wx = W / 8;
  const y1 = Math.max(1, Math.floor(onY - wy));
  const y2 = Math.min(H, Math.floor(onY + wy));
  const x1 = Math.max(1, Math.floor(onX - wx));
  const x2 = Math.min(W, Math.floor(onX + wx));
  const fov = fovMask(v8, W, H, 30);
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) fov[y * W + x] = 0;

  // background via median + reconstruction
  let k = Math.round(H / 30);
  if (k % 2 === 0) k += 1;
  const med = medianU8(v8, W, H, k);
  const medBg = Float32Array.from(med);
  const maskImg = new Float32Array(n);
  for (let i = 0; i < n; i++) maskImg[i] = v8[i] < medBg[i] ? medBg[i] : v8[i];
  const bg = reconstruct(medBg, maskImg, W, H);
  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = (v8[i] - bg[i]) * fov[i];
    cand[i] = s > 0 && Math.floor(s) > 0 ? 1 : 0;
  }
  // edge strength
  const kG = kirsch(imgG, W, H);
  const img0 = new Float32Array(n);
  for (let i = 0; i < n; i++) img0[i] = cand[i] ? 0 : imgG[i];
  const rec = reconstruct(img0, imgG, W, H);
  const k0 = kirsch(rec, W, H);
  const edge = new Float32Array(n);
  for (let i = 0; i < n; i++) edge[i] = fov[i] * (kG[i] - k0[i]);
  // per-candidate mean edge strength
  const { labels, count } = label8(cand, W, H);
  const sum = new Float64Array(count + 1);
  const cnt = new Int32Array(count + 1);
  const sx = new Float64Array(count + 1);
  const sy = new Float64Array(count + 1);
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    if (!l) continue;
    sum[l] += edge[i];
    cnt[l]++;
    sx[l] += i % W;
    sy[l] += Math.floor(i / W);
  }
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) if (labels[i]) score[i] = sum[labels[i]] / cnt[labels[i]];
  const regions = [];
  for (let l = 1; l <= count; l++) regions.push({ label: l, size: cnt[l], score: sum[l] / cnt[l], cx: sx[l] / cnt[l], cy: sy[l] / cnt[l] });
  return { w: W, h: H, v8, fov, background: bg, candidates: cand, edge, score, regions, od: { x: onX, y: onY, x1, y1, x2, y2 }, kernel: k };
}

export function toGray(a: ArrayLike<number>, w: number, h: number): Gray {
  const g = makeGray(w, h);
  for (let i = 0; i < a.length; i++) g.data[i] = a[i];
  return g;
}
