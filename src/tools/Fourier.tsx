import { useEffect, useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Panel, Segmented, Select, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { ImagePicker, useImageInput } from '../components/ImageInput';
import { useDebounced, useWorker } from '../components/hooks';
import { type Gray, toSquare } from '../lib/image';
import type { MaskShape } from '../lib/fourier2d';

const N = 256;

export default function Fourier() {
  const input = useImageInput('xray', 512);
  const w = useWorker(() => new Worker(new URL('../workers/fourier.worker.ts', import.meta.url), { type: 'module' }));
  const [spec, setSpec] = useState<{ magnitude: Gray; phase: Gray } | null>(null);
  const [shape, setShape] = useState<MaskShape>('ideal');
  const [pass, setPass] = useState<'low' | 'high'>('low');
  const [cutoff, setCutoff] = useState(0.15);
  const [k, setK] = useState(9);
  const [filt, setFilt] = useState<{ image: Gray; filteredSpectrum: Gray; mask: Gray } | null>(null);
  const [box, setBox] = useState<{ freq: Gray; spatial: Gray; diff: Gray; maxInner: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(0);
  const sq = useMemo(() => (input.img ? toSquare(input.img.gray, N) : null), [input.img]);
  const dCut = useDebounced(cutoff, 60);

  useEffect(() => {
    if (!sq) return;
    let alive = true;
    w.call('spectrum', { key: 'img', img: sq }).then(
      (r) => {
        if (!alive) return;
        setSpec(r);
        setReady((x) => x + 1);
      },
      (e) => setErr(String(e.message)),
    );
    return () => {
      alive = false;
    };
  }, [sq, w]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    w.call('filter', { key: 'img', cutoff: dCut, shape, highPass: pass === 'high' }).then((r) => alive && setFilt(r), (e) => setErr(String(e.message)));
    return () => {
      alive = false;
    };
  }, [ready, dCut, shape, pass, w]);

  useEffect(() => {
    if (!sq) return;
    let alive = true;
    w.call('boxCompare', { img: sq, k }).then((r) => alive && setBox(r), (e) => setErr(String(e.message)));
    return () => {
      alive = false;
    };
  }, [sq, k, w]);

  return (
    <ToolPage
      id="fourier"
      intro={
        <p>
          The 2-D FFT splits an image into spatial frequencies. The log magnitude shows how much of each frequency there is (centre = low frequencies), the phase says where things are. Multiplying the spectrum by a mask and transforming back is filtering: keep the centre for a low-pass (blur), drop it for a high-pass (edges). Images are cropped and resized to 256×256 for the FFT.
        </p>
      }
      toolbar={<ImagePicker state={input} samples={['xray', 'mri', 'us', 'ct']} />}
    >
      <Status error={input.error ?? err} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel title="Image (256×256)">
          <ImageView image={sq} range={[0, 255]} label="Input image" />
        </Panel>
        <Panel title="Log magnitude">
          <ImageView image={spec?.magnitude ?? null} range="auto" label="Log magnitude spectrum, centred" />
        </Panel>
        <Panel title="Phase">
          <ImageView image={spec?.phase ?? null} range={[-Math.PI, Math.PI]} label="Phase spectrum, centred" />
        </Panel>
      </div>
      <Panel title="Frequency-domain filter" className="mt-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Segmented
            label="Type"
            value={pass}
            onChange={setPass}
            options={[
              { value: 'low', label: 'Low-pass' },
              { value: 'high', label: 'High-pass' },
            ]}
          />
          <div className="w-44">
            <Select
              label="Shape"
              value={shape}
              onChange={setShape}
              options={[
                { value: 'ideal', label: 'Ideal (sharp circle)' },
                { value: 'gaussian', label: 'Gaussian' },
                { value: 'butterworth', label: 'Butterworth (n=2)' },
              ]}
            />
          </div>
          <div className="w-56">
            <Slider label="Cutoff (fraction of Nyquist)" value={cutoff} min={0.01} max={1} step={0.01} onChange={setCutoff} format={(v) => v.toFixed(2)} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ImageView image={filt?.mask ?? null} range={[0, 1]} label="Filter mask" caption="Mask H(u, v)" />
          <ImageView image={filt?.filteredSpectrum ?? null} range="auto" label="Filtered log magnitude" caption="Spectrum × mask" />
          <ImageView image={filt?.image ?? null} range={pass === 'low' ? [0, 255] : 'auto'} label="Filtered image" caption="Inverse FFT" />
        </div>
        {shape === 'ideal' && pass === 'low' && cutoff < 0.3 && <p className="mt-2 text-[13px] text-muted">The ripples around edges are ringing: a sharp cut in frequency is a sinc in space. Try the Gaussian shape.</p>}
      </Panel>
      <Panel title="Same blur, two domains (Task 6)" className="mt-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Slider label="Box kernel" value={k} min={3} max={31} step={2} onChange={setK} format={(v) => `${v}×${v}`} />
          </div>
          {box && <Stat label="Max difference away from borders" value={box.maxInner.toExponential(2)} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ImageView image={box?.spatial ?? null} range={[0, 255]} label="Spatial convolution with a box kernel" caption="Convolution in space" />
          <ImageView image={box?.freq ?? null} range={[0, 255]} label="Product of FFTs with the box kernel" caption="Product of FFTs, inverse FFT" />
          <ImageView image={box?.diff ?? null} range={[0, 20]} colormap="hot" label="Absolute difference" caption="|difference| (0 to 20)" />
        </div>
        <p className="mt-2 text-[13px] text-muted">
          Convolution in space equals multiplication in frequency. The only differences are at the borders: the FFT treats the image as periodic, while the spatial version pads with zeros.
        </p>
      </Panel>
    </ToolPage>
  );
}
