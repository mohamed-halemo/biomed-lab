import { expose } from './rpc';
import { backprojectRange, filterSinogram, finishRecon, iradon, linspaceAngles, radon, sheppLogan, type CTFilter } from '../lib/radon';
import type { Gray } from '../lib/image';

let phantom: Gray | null = null;

expose({
  phantom({ n }: { n: number }) {
    phantom = sheppLogan(n);
    return { w: n, h: n, data: phantom.data.slice() };
  },
  setImage({ img }: { img: Gray }) {
    phantom = img;
    return true;
  },
  /** Sinogram for nAngles evenly spaced angles in [0, 180). */
  sinogram({ nAngles }: { nAngles: number }) {
    if (!phantom) throw new Error('no image');
    const angles = linspaceAngles(nAngles);
    const s = radon(phantom, angles);
    return { ...s, angles };
  },
  /** Reconstruct, posting partial images while accumulating projections (for the animation). */
  async reconstruct({ sino, nDet, angles, filter, frames }: { sino: Float32Array; nDet: number; angles: number[]; filter: CTFilter; frames: number }, progress) {
    const nAng = angles.length;
    const f = filterSinogram(sino, nDet, nAng, filter);
    const acc = new Float64Array(nDet * nDet);
    // visit angles in an interleaved order so partial images look like real CT acquisition sweeps
    const step = Math.max(1, Math.ceil(nAng / Math.max(1, frames)));
    for (let a = 0; a < nAng; a += step) {
      const to = Math.min(nAng, a + step);
      backprojectRange(acc, nDet, f, nAng, angles, a, to);
      if (frames > 1 && to < nAng) {
        const img = finishRecon(acc, nDet, to);
        progress({ done: to, total: nAng, image: img }, [img.data.buffer]);
        // pace the frames so the sweep is visible (about 2 s in total)
        await new Promise((r) => setTimeout(r, 40));
      }
    }
    return { image: finishRecon(acc, nDet, nAng), filtered: f };
  },
  iradon({ sino, nDet, angles, filter }: { sino: Float32Array; nDet: number; angles: number[]; filter: CTFilter }) {
    return iradon(sino, nDet, angles, filter);
  },
});
