import { useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Panel, Segmented, Select, Slider, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { ImagePicker, useImageInput } from '../components/ImageInput';
import { COLORMAPS, cssGradient, lut, type ColormapName } from '../lib/colormap';
import { localVariance } from '../lib/filters';
import { minMax } from '../lib/image';

export default function Colormap() {
  const input = useImageInput('us', 640);
  const [cmap, setCmap] = useState<ColormapName>('jet');
  const [mode, setMode] = useState<'variance' | 'intensity'>('variance');
  const [win, setWin] = useState(25);
  const [alpha, setAlpha] = useState(0.85);
  const [roi, setRoi] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const g = input.img?.gray ?? null;
  const r = useMemo(() => {
    if (!g) return null;
    return roi ?? { x0: Math.round(g.w * 0.25), y0: Math.round(g.h * 0.45), x1: Math.round(g.w * 0.75), y1: Math.round(g.h * 0.9) };
  }, [g, roi]);

  const feature = useMemo(() => (g ? (mode === 'variance' ? localVariance(g, win) : g) : null), [g, mode, win]);

  const out = useMemo(() => {
    if (!g || !feature || !r) return null;
    const img = new ImageData(g.w, g.h);
    const table = lut(cmap);
    // normalise the feature inside the ROI to 0..255 (as the original did), then colour and blend
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = r.y0; y < r.y1; y++)
      for (let x = r.x0; x < r.x1; x++) {
        const v = feature.data[y * g.w + x];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    const s = hi > lo ? 255 / (hi - lo) : 0;
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const i = y * g.w + x;
        const v = g.data[i];
        const o = i * 4;
        if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) {
          const t = Math.max(0, Math.min(255, (feature.data[i] - lo) * s)) | 0;
          img.data[o] = v * (1 - alpha) + table[t * 3] * alpha;
          img.data[o + 1] = v * (1 - alpha) + table[t * 3 + 1] * alpha;
          img.data[o + 2] = v * (1 - alpha) + table[t * 3 + 2] * alpha;
        } else img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
        img.data[o + 3] = 255;
      }
    return img;
  }, [g, feature, r, cmap, alpha]);

  const featRange = useMemo(() => (feature ? minMax(feature.data) : null), [feature]);

  return (
    <ToolPage
      id="colormap"
      intro={
        <p>
          The eye separates colours better than gray levels. Task 9 took a region of an ultrasound image, replaced each pixel by the variance of its 25×25 neighbourhood (a simple texture measure that separates speckle from smooth tissue and fluid), stretched it to 0–255 and coloured it with the jet map. Drag on the image to pick the region.
        </p>
      }
      toolbar={
        <>
          <ImagePicker state={input} samples={['us', 'xray', 'mri', 'ct']} />
          <Segmented
            label="Feature"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'variance', label: 'Local variance' },
              { value: 'intensity', label: 'Intensity' },
            ]}
          />
          <div className="w-36">
            <Select label="Colour map" value={cmap} onChange={setCmap} options={COLORMAPS.map((c) => ({ value: c, label: c }))} />
          </div>
          {mode === 'variance' && (
            <div className="w-40">
              <Slider label="Window" value={win} min={3} max={51} step={2} onChange={setWin} format={(v) => `${v}×${v}`} />
            </div>
          )}
          <div className="w-36">
            <Slider label="Opacity" value={alpha} min={0} max={1} step={0.05} onChange={setAlpha} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
          <button type="button" className="btn" onClick={() => g && setRoi({ x0: 0, y0: 0, x1: g.w, y1: g.h })}>
            Whole image
          </button>
        </>
      }
    >
      <Status error={input.error} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Colour-mapped region — drag to select">
          <ImageView
            image={out}
            label="Image with the selected region colour mapped"
            maxHeight="70vh"
            onPointer={(p) => {
              if (!g) return;
              const x = Math.max(0, Math.min(g.w, Math.round(p.x)));
              const y = Math.max(0, Math.min(g.h, Math.round(p.y)));
              if (p.type === 'down') setDrag({ x, y });
              else if (drag && p.buttons) {
                const nr = { x0: Math.min(drag.x, x), y0: Math.min(drag.y, y), x1: Math.max(drag.x, x), y1: Math.max(drag.y, y) };
                if (nr.x1 - nr.x0 > 3 && nr.y1 - nr.y0 > 3) setRoi(nr);
              } else if (p.type === 'up') setDrag(null);
            }}
          >
            {r && <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="none" stroke="#ffffff" strokeOpacity={0.8} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </ImageView>
          <div className="mt-3">
            <div className="h-3 w-full rounded" style={{ background: cssGradient(cmap) }} aria-hidden="true" />
            <div className="mt-1 flex justify-between text-xs text-subtle">
              <span>low {mode === 'variance' ? 'variance' : 'intensity'}</span>
              <span>high</span>
            </div>
          </div>
        </Panel>
        <Panel title={mode === 'variance' ? `Local variance (${win}×${win})` : 'Gray image'}>
          <ImageView image={feature} range={featRange ?? 'auto'} colormap={cmap} label="Feature image shown with the colour map" />
          <p className="mt-2 text-[13px] text-muted">
            {mode === 'variance' ? 'Bright speckle and tissue boundaries have high variance; amniotic fluid and smooth regions are low.' : 'Plain pseudo-colouring: the colour map is applied to the gray level directly.'}
          </p>
        </Panel>
      </div>
    </ToolPage>
  );
}
