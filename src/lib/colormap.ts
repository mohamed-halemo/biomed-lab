// Colour maps for pseudo-colouring gray images (Task9-Color map used OpenCV's COLORMAP_JET).
export type ColormapName = 'jet' | 'hot' | 'bone' | 'viridis' | 'gray';

export const COLORMAPS: ColormapName[] = ['jet', 'hot', 'bone', 'viridis', 'gray'];

const VIRIDIS = [
  [0x44, 0x01, 0x54],
  [0x48, 0x28, 0x78],
  [0x3e, 0x49, 0x89],
  [0x31, 0x68, 0x8e],
  [0x26, 0x82, 0x8e],
  [0x1f, 0x9e, 0x89],
  [0x35, 0xb7, 0x79],
  [0x6e, 0xce, 0x58],
  [0xfd, 0xe7, 0x25],
];

const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Map t in [0,1] to an [r,g,b] triple in 0..255. */
export function colormap(name: ColormapName, t: number): [number, number, number] {
  t = c01(t);
  switch (name) {
    case 'jet': {
      const r = c01(1.5 - Math.abs(4 * t - 3));
      const g = c01(1.5 - Math.abs(4 * t - 2));
      const b = c01(1.5 - Math.abs(4 * t - 1));
      return [r * 255, g * 255, b * 255];
    }
    case 'hot':
      return [c01(3 * t) * 255, c01(3 * t - 1) * 255, c01(3 * t - 2) * 255];
    case 'bone': {
      // (7 * gray + reversed hot) / 8
      const r = (7 * t + c01(3 * t - 2)) / 8;
      const g = (7 * t + c01(3 * t - 1)) / 8;
      const b = (7 * t + c01(3 * t)) / 8;
      return [r * 255, g * 255, b * 255];
    }
    case 'viridis': {
      const x = t * (VIRIDIS.length - 1);
      const i = Math.min(VIRIDIS.length - 2, Math.floor(x));
      const f = x - i;
      const a = VIRIDIS[i];
      const b = VIRIDIS[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    default:
      return [t * 255, t * 255, t * 255];
  }
}

/** 256-entry lookup table as packed RGB bytes. */
export function lut(name: ColormapName): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = colormap(name, i / 255);
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

export function cssGradient(name: ColormapName): string {
  const stops = Array.from({ length: 9 }, (_, i) => {
    const [r, g, b] = colormap(name, i / 8);
    return `rgb(${r | 0},${g | 0},${b | 0}) ${(i / 8) * 100}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
