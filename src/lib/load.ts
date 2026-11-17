// Loading images and files in the browser.
import { type Gray, rgbaToGray } from './image';

export interface Loaded {
  rgba: ImageData;
  gray: Gray;
}

export async function loadImageFromBlob(blob: Blob, maxSide = 0): Promise<Loaded> {
  const bmp = await createImageBitmap(blob);
  let w = bmp.width;
  let h = bmp.height;
  if (maxSide && Math.max(w, h) > maxSide) {
    const s = maxSide / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, w, h);
  return { rgba, gray: rgbaToGray(rgba.data, w, h) };
}

export async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
  return r.blob();
}

export async function loadImageUrl(url: string, maxSide = 0): Promise<Loaded> {
  return loadImageFromBlob(await fetchBlob(url), maxSide);
}

export async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
  return r.arrayBuffer();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
