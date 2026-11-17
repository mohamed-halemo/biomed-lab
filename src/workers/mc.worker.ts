import { expose } from './rpc';
import { marchingCubes } from '../lib/mc';

expose({
  surface({ data, nx, ny, nz, iso, spacing }: { data: Uint8Array; nx: number; ny: number; nz: number; iso: number; spacing: [number, number, number] }) {
    return marchingCubes(data, nx, ny, nz, iso, spacing);
  },
});
