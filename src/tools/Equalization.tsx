import { useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Panel, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { ImagePicker, useImageInput } from '../components/ImageInput';
import { Plot } from '../components/Plot';
import { cdf, equalize, normalizedHistogram } from '../lib/histogram';
import { makeGray, minMax } from '../lib/image';

const BINS = Float64Array.from({ length: 256 }, (_, i) => i);

function stdev(a: Float32Array): number {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / a.length);
}

export default function Equalization() {
  const input = useImageInput('xray', 512);
  const [contrast, setContrast] = useState(0.45);
  const [offset, setOffset] = useState(70);

  const src = useMemo(() => {
    const g = input.img?.gray;
    if (!g) return null;
    // squeeze the input into a narrow intensity band so equalization has something to fix
    const out = makeGray(g.w, g.h);
    for (let i = 0; i < g.data.length; i++) out.data[i] = Math.round(Math.max(0, Math.min(255, offset + g.data[i] * contrast)));
    return out;
  }, [input.img, contrast, offset]);

  const res = useMemo(() => {
    if (!src) return null;
    const h0 = normalizedHistogram(src);
    const c0 = cdf(h0);
    const eq = equalize(src);
    const h1 = normalizedHistogram(eq.image);
    const c1 = cdf(h1);
    return { h0, c0, eq, h1, c1, r0: minMax(src.data), r1: minMax(eq.image.data), s0: stdev(src.data), s1: stdev(eq.image.data) };
  }, [src]);

  const ymax = res ? Math.max(...res.h0, ...res.h1) * 1.05 : 1;
  const scaledCdf = (c: Float64Array) => Float64Array.from(c, (v) => v * ymax);

  return (
    <ToolPage
      id="equalization"
      intro={
        <p>
          Histogram equalization builds the cumulative distribution (CDF) of the gray levels and maps each level k to round(255·CDF(k)). Crowded levels get spread apart, so a washed-out image uses the full range. Use the two sliders to squeeze the input into a narrow band and watch the equalized histogram stay spread out.
        </p>
      }
      toolbar={
        <>
          <ImagePicker state={input} samples={['xray', 'mri', 'us', 'ct']} />
          <div className="w-44">
            <Slider label="Input contrast" value={contrast} min={0.1} max={1} step={0.05} onChange={setContrast} format={(v) => `×${v.toFixed(2)}`} />
          </div>
          <div className="w-44">
            <Slider label="Input brightness" value={offset} min={0} max={200} onChange={setOffset} format={(v) => `+${v}`} />
          </div>
        </>
      }
    >
      <Status error={input.error} />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Before">
          <ImageView image={src} range={[0, 255]} label="Input image (contrast reduced)" maxHeight="52vh" />
          {res && (
            <div className="mt-3">
              <Plot
                label="Normalized histogram and CDF of the input"
                height={160}
                xDomain={[0, 255]}
                yDomain={[0, ymax]}
                xLabel="gray level"
                series={[
                  { x: BINS, y: res.h0, mode: 'bar', color: 'c1', label: 'histogram' },
                  { x: BINS, y: scaledCdf(res.c0), color: 'c2', label: 'CDF (scaled)' },
                ]}
              />
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <Stat label="Range" value={`${res.r0[0]} … ${res.r0[1]}`} />
                <Stat label="Std. dev." value={res.s0.toFixed(1)} />
              </dl>
            </div>
          )}
        </Panel>
        <Panel title="After equalization">
          <ImageView image={res?.eq.image ?? null} range={[0, 255]} label="Equalized image" maxHeight="52vh" />
          {res && (
            <div className="mt-3">
              <Plot
                label="Normalized histogram and CDF after equalization"
                height={160}
                xDomain={[0, 255]}
                yDomain={[0, ymax]}
                xLabel="gray level"
                series={[
                  { x: BINS, y: res.h1, mode: 'bar', color: 'c1', label: 'histogram' },
                  { x: BINS, y: scaledCdf(res.c1), color: 'c2', label: 'CDF (scaled)' },
                ]}
              />
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <Stat label="Range" value={`${res.r1[0]} … ${res.r1[1]}`} />
                <Stat label="Std. dev." value={res.s1.toFixed(1)} />
              </dl>
            </div>
          )}
        </Panel>
        {res && (
          <Panel title="Transfer function s = round(255 · CDF(r))" className="md:col-span-2">
            <Plot
              label="Mapping from input gray level to output gray level"
              height={180}
              xDomain={[0, 255]}
              yDomain={[0, 255]}
              xLabel="input level r"
              yLabel="output s"
              series={[
                { x: BINS, y: BINS, color: 'muted', dash: [4, 4], label: 'identity' },
                { x: BINS, y: Float64Array.from(res.eq.map), color: 'c3', mode: 'step', label: 'equalization map' },
              ]}
            />
          </Panel>
        )}
      </div>
    </ToolPage>
  );
}
