// Marching cubes iso-surface (the browser counterpart of the VTK contour filter used in
// Medical-images-rendering-VTK). Produces a non-indexed triangle soup with per-vertex normals
// from the volume gradient.
import { edgeTable, triTable } from './mcTables';

const VERT = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
const EDGE = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  triangles: number;
}

export function marchingCubes(data: Uint8Array, nx: number, ny: number, nz: number, iso: number, spacing: [number, number, number] = [1, 1, 1]): Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const at = (x: number, y: number, z: number) => {
    x = Math.max(0, Math.min(nx - 1, x));
    y = Math.max(0, Math.min(ny - 1, y));
    z = Math.max(0, Math.min(nz - 1, z));
    return data[(z * ny + y) * nx + x];
  };
  const grad = (x: number, y: number, z: number): [number, number, number] => [
    at(x - 1, y, z) - at(x + 1, y, z),
    at(x, y - 1, z) - at(x, y + 1, z),
    at(x, y, z - 1) - at(x, y, z + 1),
  ];
  const vals = new Float64Array(8);
  const ev = new Float64Array(12 * 6);
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        let idx = 0;
        for (let i = 0; i < 8; i++) {
          vals[i] = at(x + VERT[i][0], y + VERT[i][1], z + VERT[i][2]);
          if (vals[i] < iso) idx |= 1 << i;
        }
        const edges = edgeTable[idx];
        if (!edges) continue;
        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue;
          const [a, b] = EDGE[e];
          const va = vals[a];
          const vb = vals[b];
          const t = vb !== va ? (iso - va) / (vb - va) : 0.5;
          const pa = VERT[a];
          const pb = VERT[b];
          const px = x + pa[0] + t * (pb[0] - pa[0]);
          const py = y + pa[1] + t * (pb[1] - pa[1]);
          const pz = z + pa[2] + t * (pb[2] - pa[2]);
          const ga = grad(x + pa[0], y + pa[1], z + pa[2]);
          const gb = grad(x + pb[0], y + pb[1], z + pb[2]);
          const o = e * 6;
          ev[o] = px * spacing[0];
          ev[o + 1] = py * spacing[1];
          ev[o + 2] = pz * spacing[2];
          ev[o + 3] = ga[0] + t * (gb[0] - ga[0]);
          ev[o + 4] = ga[1] + t * (gb[1] - ga[1]);
          ev[o + 5] = ga[2] + t * (gb[2] - ga[2]);
        }
        const base = idx * 16;
        for (let i = 0; triTable[base + i] !== -1; i += 3) {
          for (let j = 0; j < 3; j++) {
            const o = triTable[base + i + j] * 6;
            pos.push(ev[o], ev[o + 1], ev[o + 2]);
            const l = Math.hypot(ev[o + 3], ev[o + 4], ev[o + 5]) || 1;
            nor.push(ev[o + 3] / l, ev[o + 4] / l, ev[o + 5] / l);
          }
        }
      }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), triangles: pos.length / 9 };
}
