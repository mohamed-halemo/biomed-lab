import { expose } from './rpc';
import { align, centerStar, columnEntropy, percentNoGaps, sumOfPairs, type AlignMode, type Scoring } from '../lib/align';

expose({
  pairwise({ a, b, mode, scoring }: { a: string; b: string; mode: AlignMode; scoring: Scoring }) {
    const r = align(a, b, mode, scoring);
    return { a: r.a, b: r.b, score: r.score, path: r.path, rows: r.dp.rows, cols: r.dp.cols, matrix: r.dp.score, dir: r.dp.dir, order: r.dp.order, best: r.dp.best, start1: r.start1, start2: r.start2 };
  },
  multiple({ seqs, scoring }: { seqs: string[]; scoring: Scoring }) {
    const { aligned, center } = centerStar(seqs, scoring);
    const ent = columnEntropy(aligned);
    return { aligned, center, entropy: ent, meanEntropy: ent.reduce((x, y) => x + y, 0) / Math.max(1, ent.length), sumOfPairs: sumOfPairs(aligned), percentNoGaps: percentNoGaps(aligned) };
  },
});
