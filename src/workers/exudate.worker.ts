import { expose } from './rpc';
import { detectExudates, type RGBu8 } from '../lib/exudate';

expose({
  detect({ img, od }: { img: RGBu8; od: { x: number; y: number } | null }) {
    return detectExudates(img, od);
  },
});
