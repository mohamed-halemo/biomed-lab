// 3-D volumes: NIfTI-1 reading, DICOM series stacking (Image-Modalities/phase1), and gzip helpers.
import { parseDicom } from './dicom';

export interface Volume {
  /** dims x (fastest), y, z */
  nx: number;
  ny: number;
  nz: number;
  /** voxel size in mm */
  sx: number;
  sy: number;
  sz: number;
  /** intensities scaled to 0..255 */
  data: Uint8Array;
  label: string;
}

export async function gunzipIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    const ds = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).arrayBuffer();
  }
  return buf;
}

function to8bit(src: ArrayLike<number>, n: number): Uint8Array {
  // robust window: 0.5..99.5 percentile
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(n / 200000));
  for (let i = 0; i < n; i += step) if (Number.isFinite(src[i])) sample.push(src[i]);
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor(sample.length * 0.005)] ?? 0;
  const hi = sample[Math.floor(sample.length * 0.995)] ?? 1;
  const out = new Uint8Array(n);
  const s = hi > lo ? 255 / (hi - lo) : 0;
  for (let i = 0; i < n; i++) {
    const v = (src[i] - lo) * s;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/** Minimal NIfTI-1 reader (single volume; 4-D files use the first volume). */
export function parseNifti(raw: ArrayBuffer, label = 'NIfTI'): Volume {
  let dv = new DataView(raw);
  let le = true;
  if (dv.getInt32(0, true) !== 348) {
    if (dv.getInt32(0, false) === 348) le = false;
    else throw new Error('Not a NIfTI-1 file');
  }
  const dim = Array.from({ length: 8 }, (_, i) => dv.getInt16(40 + i * 2, le));
  const datatype = dv.getInt16(70, le);
  const pixdim = Array.from({ length: 8 }, (_, i) => dv.getFloat32(76 + i * 4, le));
  const voxOffset = Math.max(352, Math.floor(dv.getFloat32(108, le)));
  let slope = dv.getFloat32(112, le);
  const inter = dv.getFloat32(116, le);
  if (!slope) slope = 1;
  const [nx, ny, nz] = [dim[1], Math.max(1, dim[2]), Math.max(1, dim[3])];
  const n = nx * ny * nz;
  dv = new DataView(raw, voxOffset);
  const vals = new Float32Array(n);
  const rd: Record<number, [number, (o: number) => number]> = {
    2: [1, (o) => dv.getUint8(o)],
    4: [2, (o) => dv.getInt16(o, le)],
    8: [4, (o) => dv.getInt32(o, le)],
    16: [4, (o) => dv.getFloat32(o, le)],
    64: [8, (o) => dv.getFloat64(o, le)],
    256: [1, (o) => dv.getInt8(o)],
    512: [2, (o) => dv.getUint16(o, le)],
    768: [4, (o) => dv.getUint32(o, le)],
  };
  const r = rd[datatype];
  if (!r) throw new Error(`Unsupported NIfTI datatype ${datatype}`);
  if (voxOffset + n * r[0] > raw.byteLength) throw new Error('NIfTI file is truncated');
  for (let i = 0; i < n; i++) vals[i] = r[1](i * r[0]) * slope + inter;
  return { nx, ny, nz, sx: Math.abs(pixdim[1]) || 1, sy: Math.abs(pixdim[2]) || 1, sz: Math.abs(pixdim[3]) || 1, data: to8bit(vals, n), label };
}

/**
 * Stack a DICOM series into a volume: sort slices by ImagePositionPatient z (falling back to InstanceNumber),
 * take pixel spacing and slice thickness for the plane aspect ratios, as in Image-Modalities/phase1/main.py.
 */
export function stackDicom(buffers: ArrayBuffer[], label = 'DICOM series'): Volume {
  const slices = buffers.map((b) => parseDicom(b)).filter((s) => s.samplesPerPixel === 1);
  if (!slices.length) throw new Error('No grayscale DICOM slices found');
  slices.sort((a, b) => (a.position?.[2] ?? a.instanceNumber ?? 0) - (b.position?.[2] ?? b.instanceNumber ?? 0));
  const { rows, cols } = slices[0];
  const same = slices.filter((s) => s.rows === rows && s.cols === cols);
  const nz = same.length;
  const all = new Float32Array(rows * cols * nz);
  same.forEach((s, k) => all.set(s.pixels, k * rows * cols));
  const ps = slices[0].pixelSpacing ?? [1, 1];
  let sz = slices[0].sliceThickness ?? 1;
  if (same.length > 1 && same[0].position && same[1].position) {
    const d = Math.abs(same[1].position[2] - same[0].position[2]);
    if (d > 0) sz = d;
  }
  return { nx: cols, ny: rows, nz, sx: ps[1], sy: ps[0], sz, data: to8bit(all, all.length), label };
}

/** Halve each dimension by 2x2x2 averaging (used before marching cubes). */
export function downsample2(v: Volume): Volume {
  const nx = Math.floor(v.nx / 2);
  const ny = Math.floor(v.ny / 2);
  const nz = Math.max(1, Math.floor(v.nz / 2));
  const out = new Uint8Array(nx * ny * nz);
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        let s = 0;
        let c = 0;
        for (let dz = 0; dz < 2; dz++)
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
              const zz = Math.min(v.nz - 1, 2 * z + dz);
              s += v.data[(zz * v.ny + 2 * y + dy) * v.nx + 2 * x + dx];
              c++;
            }
        out[(z * ny + y) * nx + x] = s / c;
      }
  return { ...v, nx, ny, nz, sx: v.sx * 2, sy: v.sy * 2, sz: v.nz > 1 ? v.sz * 2 : v.sz, data: out };
}
