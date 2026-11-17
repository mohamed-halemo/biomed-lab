import { useEffect, useRef, type ReactNode, type PointerEvent as RPE } from 'react';
import { type Gray, minMax } from '../lib/image';
import { lut, type ColormapName } from '../lib/colormap';

export type ImageSource = Gray | ImageData;

function isGray(s: ImageSource): s is Gray {
  return (s as Gray).data instanceof Float32Array;
}

export function renderToImageData(src: ImageSource, range?: [number, number] | 'auto', cmap?: ColormapName): ImageData {
  if (!isGray(src)) return src;
  const [lo, hi] = range === undefined || range === 'auto' ? minMax(src.data) : range;
  const img = new ImageData(src.w, src.h);
  const d = img.data;
  const s = hi > lo ? 255 / (hi - lo) : 0;
  const table = cmap && cmap !== 'gray' ? lut(cmap) : null;
  for (let i = 0, j = 0; i < src.w * src.h; i++, j += 4) {
    let v = (src.data[i] - lo) * s;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (table) {
      const k = (v | 0) * 3;
      d[j] = table[k];
      d[j + 1] = table[k + 1];
      d[j + 2] = table[k + 2];
    } else d[j] = d[j + 1] = d[j + 2] = v;
    d[j + 3] = 255;
  }
  return img;
}

export interface PointerInfo {
  x: number;
  y: number;
  type: 'down' | 'move' | 'up';
  buttons: number;
}

/**
 * Draws an image at its native resolution and scales it with CSS. SVG children are drawn on top
 * in image pixel coordinates.
 */
export function ImageView(props: {
  image: ImageSource | null;
  label: string;
  range?: [number, number] | 'auto';
  colormap?: ColormapName;
  pixelated?: boolean;
  onPointer?: (p: PointerInfo) => void;
  children?: ReactNode;
  className?: string;
  aspect?: number; // display width/height ratio override (e.g. anisotropic voxels)
  caption?: ReactNode;
  maxHeight?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { image, range, colormap } = props;
  useEffect(() => {
    const c = ref.current;
    if (!c || !image) return;
    const w = isGray(image) ? image.w : image.width;
    const h = isGray(image) ? image.h : image.height;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    c.getContext('2d')!.putImageData(renderToImageData(image, range, colormap), 0, 0);
  }, [image, range, colormap]);

  const w = image ? (isGray(image) ? image.w : image.width) : 1;
  const h = image ? (isGray(image) ? image.h : image.height) : 1;
  const ratio = props.aspect ?? w / h;
  const toImg = (e: RPE<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  const handlers = props.onPointer
    ? {
        onPointerDown: (e: RPE<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          props.onPointer!({ ...toImg(e), type: 'down', buttons: e.buttons });
        },
        onPointerMove: (e: RPE<HTMLDivElement>) => props.onPointer!({ ...toImg(e), type: 'move', buttons: e.buttons }),
        onPointerUp: (e: RPE<HTMLDivElement>) => props.onPointer!({ ...toImg(e), type: 'up', buttons: e.buttons }),
      }
    : {};
  return (
    <figure className={`m-0 min-w-0 ${props.className ?? ''}`}>
      <div
        className={`relative w-full overflow-hidden rounded-md border border-line bg-black ${props.onPointer ? 'cursor-crosshair touch-none' : ''}`}
        style={{ aspectRatio: `${ratio}`, maxHeight: props.maxHeight }}
        {...handlers}
      >
        {image ? (
          <canvas ref={ref} role="img" aria-label={props.label} className={`absolute inset-0 h-full w-full ${props.pixelated ? 'pixelated' : ''}`} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-neutral-400">Loading…</div>
        )}
        {props.children && image && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
            {props.children}
          </svg>
        )}
      </div>
      {props.caption && <figcaption className="mt-1.5 text-xs text-subtle">{props.caption}</figcaption>}
    </figure>
  );
}
