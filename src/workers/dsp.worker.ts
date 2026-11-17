import { expose } from './rpc';
import { dftNaive, fftRecursive } from '../lib/fft';

expose({
  compare({ x }: { x: Float64Array }) {
    const t0 = performance.now();
    const f = fftRecursive(x);
    const t1 = performance.now();
    // repeat the FFT a few times for a stable timing
    let reps = 1;
    while (performance.now() - t1 < 30 && reps < 200) {
      fftRecursive(x);
      reps++;
    }
    const fftMs = (performance.now() - t1 + (t1 - t0)) / (reps + 1);
    const t2 = performance.now();
    const d = dftNaive(x);
    const dftMs = performance.now() - t2;
    let maxErr = 0;
    for (let k = 0; k < x.length; k++) maxErr = Math.max(maxErr, Math.hypot(f.re[k] - d.re[k], f.im[k] - d.im[k]));
    return { re: f.re, im: f.im, fftMs, dftMs, maxErr };
  },
});
