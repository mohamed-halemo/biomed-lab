import { useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Panel, Segmented, Select, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { ImagePicker, useImageInput } from '../components/ImageInput';
import { Plot } from '../components/Plot';
import { addNoise, boxBlur, medianFilter, noisePhantom, roiStats, unsharpMask, type NoiseKind, type Padding } from '../lib/filters';
import { fitGray, psnr } from '../lib/image';

const BINS = Float64Array.from({ length: 256 }, (_, i) => i);

function Unsharp() {
  const input = useImageInput('xray', 512);
  const [k, setK] = useState(7);
  const [factor, setFactor] = useState(1.5);
  const [padding, setPadding] = useState<Padding>('replicate');
  const r = useMemo(() => (input.img ? unsharpMask(input.img.gray, k, factor, padding) : null), [input.img, k, factor, padding]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ImagePicker state={input} samples={['xray', 'mri', 'us', 'ct']} />
        <div className="w-40">
          <Slider label="Kernel size" value={k} min={3} max={21} step={2} onChange={setK} format={(v) => `${v}×${v}`} />
        </div>
        <div className="w-40">
          <Slider label="Factor" value={factor} min={0} max={5} step={0.1} onChange={setFactor} format={(v) => v.toFixed(1)} />
        </div>
        <div className="w-48">
          <Select
            label="Border padding"
            value={padding}
            onChange={setPadding}
            options={[
              { value: 'zero', label: 'Zeros (as original)' },
              { value: 'replicate', label: 'Replicate edge' },
            ]}
          />
        </div>
      </div>
      <Status error={input.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Original">
          <ImageView image={input.img?.gray ?? null} range={[0, 255]} label="Original image" />
        </Panel>
        <Panel title={`Box blur ${k}×${k}`}>
          <ImageView image={r?.blur ?? null} range={[0, 255]} label="Blurred image" />
        </Panel>
        <Panel title="Mask = original − blur">
          <ImageView image={r?.mask ?? null} range={[-40, 40]} label="Unsharp mask detail layer" />
        </Panel>
        <Panel title={`Sharpened (factor ${factor.toFixed(1)})`}>
          <ImageView image={r?.out ?? null} range={[0, 255]} label="Sharpened image" />
        </Panel>
      </div>
    </>
  );
}

function Noise() {
  const input = useImageInput('xray', 256);
  const [source, setSource] = useState<'phantom' | 'image'>('phantom');
  const [kind, setKind] = useState<NoiseKind>('gaussian');
  const [sigma, setSigma] = useState(20);
  const [mean, setMean] = useState(0);
  const [ab, setAb] = useState(30);
  const [amount, setAmount] = useState(3000);
  const [seed, setSeed] = useState(1);
  const [method, setMethod] = useState<'median' | 'mean'>('median');
  const [k, setK] = useState(3);
  const [roi, setRoi] = useState({ x0: 45, y0: 45, x1: 75, y1: 75 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const clean = useMemo(() => (source === 'phantom' ? noisePhantom() : input.img ? fitGray(input.img.gray, 256) : null), [source, input.img]);
  const noisy = useMemo(
    () => (clean ? addNoise(clean, kind === 'gaussian' ? { kind, mean, sigma, seed } : kind === 'uniform' ? { kind, a: -ab, b: ab, seed } : { kind, amount, seed }) : null),
    [clean, kind, mean, sigma, ab, amount, seed],
  );
  const den = useMemo(() => (noisy ? (method === 'median' ? medianFilter(noisy, k) : boxBlur(noisy, k, 'replicate')) : null), [noisy, method, k]);
  const st = useMemo(() => (noisy ? roiStats(noisy, Math.round(roi.x0), Math.round(roi.y0), Math.round(roi.x1), Math.round(roi.y1)) : null), [noisy, roi]);
  const stClean = useMemo(() => (clean ? roiStats(clean, Math.round(roi.x0), Math.round(roi.y0), Math.round(roi.x1), Math.round(roi.y1)) : null), [clean, roi]);
  const hist = useMemo(() => (st ? Float64Array.from(st.hist, (v) => v / Math.max(1, st.n)) : null), [st]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented
          label="Source"
          value={source}
          onChange={setSource}
          options={[
            { value: 'phantom', label: 'Task 7 phantom' },
            { value: 'image', label: 'Image' },
          ]}
        />
        {source === 'image' && <ImagePicker state={input} samples={['xray', 'mri', 'us', 'ct']} />}
        <div className="w-44">
          <Select
            label="Noise"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'gaussian', label: 'Gaussian' },
              { value: 'uniform', label: 'Uniform' },
              { value: 'saltpepper', label: 'Salt & pepper' },
            ]}
          />
        </div>
        {kind === 'gaussian' && (
          <>
            <div className="w-36">
              <Slider label="Mean" value={mean} min={-50} max={50} onChange={setMean} />
            </div>
            <div className="w-36">
              <Slider label="Sigma" value={sigma} min={0} max={60} onChange={setSigma} />
            </div>
          </>
        )}
        {kind === 'uniform' && (
          <div className="w-40">
            <Slider label="Range ±a" value={ab} min={0} max={100} onChange={setAb} format={(v) => `U(−${v}, ${v})`} />
          </div>
        )}
        {kind === 'saltpepper' && (
          <div className="w-44">
            <Slider label="Pixels of each" value={amount} min={300} max={10000} step={100} onChange={setAmount} />
          </div>
        )}
        <button type="button" className="btn" onClick={() => setSeed((s) => s + 1)}>
          New noise
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Clean">
          <ImageView image={clean} range={[0, 255]} label="Clean image" pixelated />
        </Panel>
        <Panel title="Noisy — drag to select a region">
          <ImageView
            image={noisy}
            range={[0, 255]}
            pixelated
            label="Noisy image; drag to select a region of interest"
            onPointer={(p) => {
              if (p.type === 'down') {
                setDrag({ x: p.x, y: p.y });
                setRoi({ x0: p.x, y0: p.y, x1: p.x + 1, y1: p.y + 1 });
              } else if (drag && p.buttons) setRoi({ x0: Math.min(drag.x, p.x), y0: Math.min(drag.y, p.y), x1: Math.max(drag.x, p.x) + 1, y1: Math.max(drag.y, p.y) + 1 });
              else if (p.type === 'up') setDrag(null);
            }}
          >
            <rect x={roi.x0} y={roi.y0} width={roi.x1 - roi.x0} height={roi.y1 - roi.y0} fill="none" stroke="#fb923c" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </ImageView>
        </Panel>
        <Panel title={`Denoised (${method} ${k}×${k})`}>
          <ImageView image={den} range={[0, 255]} label="Denoised image" pixelated />
        </Panel>
        <Panel title="Region histogram" className="lg:col-span-2">
          {hist && <Plot label="Histogram of the selected region" height={170} xDomain={[0, 255]} xLabel="gray level" series={[{ x: BINS, y: hist, mode: 'bar', color: 'c2' }]} />}
          {st && stClean && (
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Region mean" value={st.mean.toFixed(2)} />
              <Stat label="Region sigma" value={st.sigma.toFixed(2)} />
              <Stat label="Clean sigma" value={stClean.sigma.toFixed(2)} />
              <Stat label="Pixels" value={st.n} />
            </dl>
          )}
          <p className="mt-2 text-[13px] text-muted">On a flat region the histogram is the noise distribution itself, so the measured sigma estimates the noise level (the trick from Task 7).</p>
        </Panel>
        <Panel title="Denoising">
          <div className="grid gap-3">
            <Segmented
              label="Filter"
              value={method}
              onChange={setMethod}
              options={[
                { value: 'median', label: 'Median' },
                { value: 'mean', label: 'Mean (box)' },
              ]}
            />
            <Slider label="Kernel size" value={k} min={3} max={9} step={2} onChange={setK} format={(v) => `${v}×${v}`} />
            {clean && noisy && den && (
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="PSNR noisy" value={`${psnr(clean.data, noisy.data).toFixed(1)} dB`} />
                <Stat label="PSNR denoised" value={`${psnr(clean.data, den.data).toFixed(1)} dB`} />
              </dl>
            )}
            <p className="text-[13px] text-muted">The median filter is the classic answer to salt &amp; pepper; the mean filter suits Gaussian noise but blurs edges.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}

export default function Filters() {
  const [tab, setTab] = useState<'unsharp' | 'noise'>('unsharp');
  return (
    <ToolPage
      id="filters"
      intro={
        <>
          <p>
            Unsharp masking (Task 4) blurs the image with a k×k mean kernel, subtracts the blur to get the fine detail, and adds that detail back scaled by a factor. Noise (Task 7) adds Gaussian, uniform or salt &amp; pepper noise to a test phantom; selecting a flat region shows the noise histogram, its mean and sigma.
          </p>
          <p className="text-sm">Denoising with a median filter is an addition here; the original apps only had the mean filter.</p>
        </>
      }
      toolbar={
        <Segmented
          label="Section"
          hideLabel
          value={tab}
          onChange={setTab}
          options={[
            { value: 'unsharp', label: 'Unsharp mask' },
            { value: 'noise', label: 'Noise & denoising' },
          ]}
        />
      }
    >
      {tab === 'unsharp' ? <Unsharp /> : <Noise />}
    </ToolPage>
  );
}
