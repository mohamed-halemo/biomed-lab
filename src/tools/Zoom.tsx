import { useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Panel, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { ImagePicker, useImageInput } from '../components/ImageInput';
import { crop, zoomBilinear, zoomNearest } from '../lib/interp';
import { makeGray } from '../lib/image';

const OUT = 256;

export default function Zoom() {
  const input = useImageInput('mri', 512);
  const [factor, setFactor] = useState(4);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const g = input.img?.gray ?? null;

  const region = useMemo(() => {
    if (!g) return null;
    const size = factor >= 1 ? Math.max(4, Math.ceil(OUT / factor)) : Math.max(g.w, g.h);
    const sw = Math.min(g.w, size);
    const sh = Math.min(g.h, size);
    const c = center ?? { x: g.w / 2, y: g.h / 2 };
    const x0 = Math.max(0, Math.min(g.w - sw, Math.round(c.x - sw / 2)));
    const y0 = Math.max(0, Math.min(g.h - sh, Math.round(c.y - sh / 2)));
    return { x0, y0, sw, sh };
  }, [g, factor, center]);

  const out = useMemo(() => {
    if (!g || !region) return null;
    const src = crop(g, region.x0, region.y0, region.sw, region.sh);
    const t0 = performance.now();
    const nn = zoomNearest(src, factor);
    const t1 = performance.now();
    const bl = zoomBilinear(src, factor);
    const t2 = performance.now();
    const diff = makeGray(nn.w, nn.h);
    for (let i = 0; i < diff.data.length; i++) diff.data[i] = Math.abs(nn.data[i] - bl.data[i]);
    return { nn, bl, diff, tn: t1 - t0, tb: t2 - t1 };
  }, [g, region, factor]);

  return (
    <ToolPage
      id="zoom"
      intro={
        <p>
          Zooming needs a value for output pixels that fall between input pixels. Nearest neighbour copies the closest input pixel, so edges turn into blocks; bilinear blends the four neighbours, so edges get smoother but softer. Both are ported line by line from the Task 2 app. Click the source image to choose the region to magnify.
        </p>
      }
      toolbar={
        <>
          <ImagePicker state={input} samples={['mri', 'xray', 'ct']} />
          <div className="w-56">
            <Slider label="Zoom factor" value={factor} min={0.25} max={8} step={0.25} onChange={setFactor} format={(v) => `×${v}`} />
          </div>
        </>
      }
    >
      <Status error={input.error} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)]">
        <Panel title="Source">
          <ImageView
            image={g}
            label="Source image; click to choose the zoom region"
            range={[0, 255]}
            onPointer={(p) => {
              if (p.type === 'down' || p.buttons) setCenter({ x: p.x, y: p.y });
            }}
            caption="Click or drag to move the region."
          >
            {region && <rect x={region.x0} y={region.y0} width={region.sw} height={region.sh} fill="none" stroke="#6fd3c4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          </ImageView>
          {out && (
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Stat label="Region" value={`${region!.sw}×${region!.sh}`} />
              <Stat label="Output" value={`${out.nn.w}×${out.nn.h}`} />
              <Stat label="Nearest" value={`${out.tn.toFixed(1)} ms`} />
              <Stat label="Bilinear" value={`${out.tb.toFixed(1)} ms`} />
            </dl>
          )}
        </Panel>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Panel title="Nearest neighbour">
            <ImageView image={out?.nn ?? null} range={[0, 255]} pixelated label={`Nearest neighbour zoom ×${factor}`} />
          </Panel>
          <Panel title="Bilinear">
            <ImageView image={out?.bl ?? null} range={[0, 255]} pixelated label={`Bilinear zoom ×${factor}`} />
          </Panel>
          <Panel title="Difference |nearest − bilinear|" className="sm:col-span-2">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ImageView image={out?.diff ?? null} range="auto" colormap="hot" pixelated label="Absolute difference between the two zooms" />
              <p className="text-[13px] leading-relaxed text-muted">
                The two methods agree on flat areas and differ along edges. The original used the rule <code className="font-mono text-xs">Y[round(i/F), round(j/F)]</code> for nearest neighbour (Python rounds halves to even) and source coordinates <code className="font-mono text-xs">i·old/new</code> for bilinear, so the zoomed image is anchored at the top-left corner.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </ToolPage>
  );
}
