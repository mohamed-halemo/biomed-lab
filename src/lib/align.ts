// Pairwise alignment (Needleman-Wunsch / Smith-Waterman) ported from Alignment_app/pairwise_alignment.py,
// plus a progressive (centre-star) multiple alignment and the metrics from metrics.py.

export type AlignMode = 'global' | 'local';

export interface Scoring {
  match: number;
  mismatch: number;
  gap: number;
}

/** Direction codes per cell: 0 none, 1 diagonal, 2 "H" (gap in seq2: up), 3 "V" (gap in seq1: left). */
export const DIR_NONE = 0;
export const DIR_D = 1;
export const DIR_H = 2;
export const DIR_V = 3;

export interface DPResult {
  rows: number; // len(seq1) + 1
  cols: number; // len(seq2) + 1
  score: Float64Array; // rows * cols
  dir: Uint8Array;
  /** cells in the order they were filled (outer loop over seq2, inner over seq1, like the original) */
  order: Int32Array;
  best: { i: number; j: number; value: number };
}

export function fillMatrix(seq1: string, seq2: string, mode: AlignMode, s: Scoring): DPResult {
  const rows = seq1.length + 1;
  const cols = seq2.length + 1;
  const score = new Float64Array(rows * cols);
  const dir = new Uint8Array(rows * cols);
  if (mode === 'global') {
    for (let j = 1; j < cols; j++) {
      score[j] = s.gap * j;
      dir[j] = DIR_V;
    }
    for (let i = 1; i < rows; i++) {
      score[i * cols] = s.gap * i;
      dir[i * cols] = DIR_H;
    }
  }
  const order = new Int32Array((rows - 1) * (cols - 1));
  let k = 0;
  let best = { i: 0, j: 0, value: 0 };
  for (let j = 1; j < cols; j++) {
    for (let i = 1; i < rows; i++) {
      const val = seq1[i - 1] === seq2[j - 1] ? s.match : s.mismatch;
      const d = score[(i - 1) * cols + (j - 1)] + val;
      const h = score[(i - 1) * cols + j] + s.gap;
      const v = score[i * cols + (j - 1)] + s.gap;
      // np.argmax picks the first maximum: diagonal, then H, then V
      let m = d;
      let dd = DIR_D;
      if (h > m) {
        m = h;
        dd = DIR_H;
      }
      if (v > m) {
        m = v;
        dd = DIR_V;
      }
      if (mode === 'local' && m <= 0) {
        m = 0;
        dd = DIR_NONE;
      }
      score[i * cols + j] = m;
      dir[i * cols + j] = dd;
      if (mode === 'local' && m >= best.value) best = { i, j, value: m };
      order[k++] = i * cols + j;
    }
  }
  if (mode === 'global') best = { i: rows - 1, j: cols - 1, value: score[rows * cols - 1] };
  return { rows, cols, score, dir, order, best };
}

export interface Alignment {
  a: string;
  b: string;
  score: number;
  /** traceback path as flat cell indices from start cell back to the origin */
  path: number[];
  start1: number;
  start2: number;
}

export function traceback(dp: DPResult, seq1: string, seq2: string, mode: AlignMode): { a: string; b: string; path: number[]; start1: number; start2: number } {
  let i = dp.best.i;
  let j = dp.best.j;
  const { cols } = dp;
  let a = '';
  let b = '';
  const path: number[] = [i * cols + j];
  while (i > 0 || j > 0) {
    const idx = i * cols + j;
    if (mode === 'local' && dp.score[idx] <= 0) break;
    const d = dp.dir[idx];
    if (d === DIR_D) {
      a += seq1[i - 1];
      b += seq2[j - 1];
      i--;
      j--;
    } else if (d === DIR_H) {
      a += seq1[i - 1];
      b += '-';
      i--;
    } else if (d === DIR_V) {
      a += '-';
      b += seq2[j - 1];
      j--;
    } else break;
    path.push(i * cols + j);
  }
  return { a: [...a].reverse().join(''), b: [...b].reverse().join(''), path, start1: i, start2: j };
}

/** Score of an alignment string pair, as in _calc_score. */
export function alignmentScore(a: string, b: string, s: Scoring): number {
  let sc = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) sc += s.match;
    else if (a[i] === '-' || b[i] === '-') sc += s.gap;
    else sc += s.mismatch;
  }
  return sc;
}

export function align(seq1: string, seq2: string, mode: AlignMode, s: Scoring): Alignment & { dp: DPResult } {
  const dp = fillMatrix(seq1, seq2, mode, s);
  const t = traceback(dp, seq1, seq2, mode);
  return { ...t, score: alignmentScore(t.a, t.b, s), dp };
}

export function identity(a: string, b: string): number {
  if (!a.length) return 0;
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i] && a[i] !== '-') m++;
  return m / a.length;
}

// ---- FASTA ----

export interface FastaRecord {
  name: string;
  seq: string;
}

export function parseFasta(text: string): FastaRecord[] {
  const out: FastaRecord[] = [];
  let cur: FastaRecord | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('>')) {
      cur = { name: line.slice(1).trim() || `seq${out.length + 1}`, seq: '' };
      out.push(cur);
    } else {
      if (!cur) {
        cur = { name: `seq${out.length + 1}`, seq: '' };
        out.push(cur);
      }
      cur.seq += line.replace(/[^A-Za-z-]/g, '').toUpperCase();
    }
  }
  return out.filter((r) => r.seq.length > 0);
}

// ---- Multiple alignment (centre star) ----

/**
 * Centre-star progressive alignment: pick the sequence with the highest total pairwise global score,
 * align every other sequence to it, and merge using "once a gap, always a gap".
 */
export function centerStar(seqs: string[], s: Scoring): { aligned: string[]; center: number } {
  const n = seqs.length;
  if (n < 2) return { aligned: seqs.slice(), center: 0 };
  const tot = new Float64Array(n);
  const pair: (Alignment | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const r = align(seqs[i], seqs[j], 'global', s);
      pair[i][j] = r;
      pair[j][i] = { ...r, a: r.b, b: r.a };
      tot[i] += r.score;
      tot[j] += r.score;
    }
  let c = 0;
  for (let i = 1; i < n; i++) if (tot[i] > tot[c]) c = i;
  // merged centre with gaps, and aligned rows
  let center = pair[c][c === 0 ? 1 : 0]!.a;
  const rows: string[] = [];
  const idx: number[] = [];
  const first = c === 0 ? 1 : 0;
  rows.push(pair[c][first]!.b);
  idx.push(first);
  for (let k = 0; k < n; k++) {
    if (k === c || k === first) continue;
    const p = pair[c][k]!;
    // merge p.a (centre with its own gaps) into current centre
    const merged = mergeIntoCenter(center, rows, p.a, p.b);
    center = merged.center;
    rows.length = 0;
    rows.push(...merged.rows);
    idx.push(k);
  }
  const aligned = new Array<string>(n);
  aligned[c] = center;
  idx.forEach((k, r) => (aligned[k] = rows[r]));
  return { aligned, center: c };
}

function mergeIntoCenter(center: string, rows: string[], newCenter: string, newRow: string): { center: string; rows: string[] } {
  let i = 0;
  let j = 0;
  let outC = '';
  const outRows = rows.map(() => '');
  let outNew = '';
  while (i < center.length || j < newCenter.length) {
    const a = center[i];
    const b = newCenter[j];
    if (i < center.length && j < newCenter.length && a === b) {
      outC += a;
      rows.forEach((r, k) => (outRows[k] += r[i]));
      outNew += newRow[j];
      i++;
      j++;
    } else if (i < center.length && a === '-') {
      outC += '-';
      rows.forEach((r, k) => (outRows[k] += r[i]));
      outNew += '-';
      i++;
    } else if (j < newCenter.length && b === '-') {
      outC += '-';
      rows.forEach((_, k) => (outRows[k] += '-'));
      outNew += newRow[j];
      j++;
    } else {
      // should not happen (same residues in the same order), keep both safely
      if (i < center.length) {
        outC += a;
        rows.forEach((r, k) => (outRows[k] += r[i]));
        outNew += '-';
        i++;
      } else {
        outC += '-';
        rows.forEach((_, k) => (outRows[k] += '-'));
        outNew += newRow[j];
        j++;
      }
    }
  }
  return { center: outC, rows: [...outRows, outNew] };
}

// ---- metrics.py ----

/** Shannon entropy (bits) of each alignment column; the app reports the mean. */
export function columnEntropy(seqs: string[]): number[] {
  const L = seqs[0]?.length ?? 0;
  const out: number[] = [];
  for (let i = 0; i < L; i++) {
    const counts = new Map<string, number>();
    for (const s of seqs) counts.set(s[i], (counts.get(s[i]) ?? 0) + 1);
    let e = 0;
    for (const c of counts.values()) {
      const p = c / seqs.length;
      e -= p * Math.log2(p);
    }
    out.push(e);
  }
  return out;
}

/** Sum of pairs with the app's scoring: match +1, mismatch -1, residue vs gap -2, gap vs gap 0. */
export function sumOfPairs(seqs: string[]): number {
  let sp = 0;
  for (let i = 0; i < seqs.length - 1; i++)
    for (let j = i + 1; j < seqs.length; j++)
      for (let k = 0; k < seqs[0].length; k++) {
        const a = seqs[i][k];
        const b = seqs[j][k];
        if (a === '-' && b === '-') continue;
        if (a === b) sp += 1;
        else if (a === '-' || b === '-') sp -= 2;
        else sp -= 1;
      }
  return sp;
}

export function percentNoGaps(seqs: string[]): number {
  let gaps = 0;
  for (const s of seqs) for (const ch of s) if (ch === '-') gaps++;
  return 100 - (gaps / (seqs.length * seqs[0].length)) * 100;
}
