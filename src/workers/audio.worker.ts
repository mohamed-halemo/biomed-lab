import { expose } from './rpc';
import { features, hashFeatures, LIBRARY, renderTrack, similarity, addWhiteNoise, resample, SR, TRACK_SECONDS, type Features, type Hashes } from '../lib/audio';

interface Entry {
  id: string;
  title: string;
  audio: Float32Array;
  feats: Features;
  full: Hashes;
}
let lib: Entry[] | null = null;

function ensure(): Entry[] {
  if (!lib) {
    lib = LIBRARY.map((t) => {
      const audio = renderTrack(t);
      const feats = features(audio);
      return { id: t.id, title: t.title, audio, feats, full: hashFeatures(feats) };
    });
  }
  return lib;
}

function analyse(q: Float32Array) {
  const L = ensure();
  const f = features(q);
  const qh = hashFeatures(f);
  const qCols = f.mel.cols;
  const results = L.map((e) => {
    // slide a window of the query's length over the song (1 s hop) and keep the best match
    let best = similarity(qh, e.full);
    let at = 0;
    const cols = e.feats.mel.cols;
    if (qCols < cols - 2) {
      const hop = Math.max(1, Math.round(SR / 512));
      best = { mel: 0, mfcc: 0, chroma: 0, total: -1 };
      for (let c0 = 0; c0 + qCols <= cols; c0 += hop) {
        const s = similarity(qh, hashFeatures(e.feats, c0, c0 + qCols));
        if (s.total > best.total) {
          best = s;
          at = (c0 * 512) / SR;
        }
      }
    }
    return { id: e.id, title: e.title, ...best, at };
  });
  results.sort((a, b) => b.total - a.total);
  return { results, features: f };
}

expose({
  library() {
    const L = ensure();
    return L.map((e) => ({ id: e.id, title: e.title, audio: e.audio.slice(), seconds: TRACK_SECONDS }));
  },
  /** Weighted mix of two library songs (Mixing() in the original), then rank. */
  mix({ a, b, w }: { a: string; b: string; w: number }) {
    const L = ensure();
    const A = L.find((e) => e.id === a)!.audio;
    const B = L.find((e) => e.id === b)!.audio;
    const q = new Float32Array(Math.min(A.length, B.length));
    for (let i = 0; i < q.length; i++) q[i] = A[i] * w + B[i] * (1 - w);
    return { query: q, ...analyse(q) };
  },
  clip({ id, start, seconds, snr }: { id: string; start: number; seconds: number; snr: number }) {
    const L = ensure();
    const A = L.find((e) => e.id === id)!.audio;
    const s0 = Math.floor(start * SR);
    let q: Float32Array = A.slice(s0, Math.min(A.length, s0 + Math.floor(seconds * SR)));
    if (snr < 60) q = addWhiteNoise(q, snr, Math.floor(start * 100) + 1);
    return { query: q, ...analyse(q) };
  },
  upload({ data, sampleRate }: { data: Float32Array; sampleRate: number }) {
    let q: Float32Array = resample(data, sampleRate, SR);
    if (q.length > SR * TRACK_SECONDS) q = q.slice(0, SR * TRACK_SECONDS);
    return { query: q, ...analyse(q) };
  },
});
