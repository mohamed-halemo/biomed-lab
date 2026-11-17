import { useEffect, useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Panel, Segmented, Select, Slider, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { ImagePicker, useImageInput } from '../components/ImageInput';
import { useDebounced, useWorker } from '../components/hooks';
import { type Gray, toSquare } from '../lib/image';
import { partnerOptions, type MixComponent } from '../lib/fourier2d';
import type { Client } from '../workers/rpc';

const N = 256;
type View = 'magnitude' | 'phase' | 'real' | 'imaginary';
type Spec = Record<View, Gray>;

const LABEL: Record<MixComponent, string> = {
  magnitude: 'Magnitude',
  phase: 'Phase',
  'uniform-magnitude': 'Uniform magnitude',
  'uniform-phase': 'Uniform phase',
  real: 'Real',
  imaginary: 'Imaginary',
};

function Source(props: { name: 'A' | 'B'; def: string; w: Client; onReady: () => void }) {
  const input = useImageInput(props.def, 512);
  const [view, setView] = useState<View>('magnitude');
  const [spec, setSpec] = useState<Spec | null>(null);
  const sq = useMemo(() => (input.img ? toSquare(input.img.gray, N) : null), [input.img]);
  const { w, name, onReady } = props;
  useEffect(() => {
    if (!sq) return;
    let alive = true;
    w.call('spectrum', { key: name, img: sq }).then((r) => {
      if (!alive) return;
      setSpec(r);
      onReady();
    });
    return () => {
      alive = false;
    };
  }, [sq, w, name, onReady]);
  return (
    <Panel title={`Image ${name}`}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <ImagePicker state={input} samples={['xray', 'mri', 'us', 'ct']} />
      </div>
      <Status error={input.error} />
      <div className="grid grid-cols-2 gap-3">
        <ImageView image={sq} range={[0, 255]} label={`Image ${name}`} />
        <div>
          <ImageView image={spec ? spec[view] : null} range={view === 'phase' ? [-Math.PI, Math.PI] : view === 'magnitude' ? 'auto' : [-2000, 2000]} label={`${view} of image ${name}`} />
          <div className="mt-2">
            <Select
              label="Show component"
              value={view}
              onChange={setView}
              options={[
                { value: 'magnitude', label: 'Magnitude (log)' },
                { value: 'phase', label: 'Phase' },
                { value: 'real', label: 'Real' },
                { value: 'imaginary', label: 'Imaginary' },
              ]}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function Mixer() {
  const w = useWorker(() => new Worker(new URL('../workers/fourier.worker.ts', import.meta.url), { type: 'module' }));
  const [ready, setReady] = useState({ A: 0, B: 0 });
  const onA = useMemo(() => () => setReady((r) => ({ ...r, A: r.A + 1 })), []);
  const onB = useMemo(() => () => setReady((r) => ({ ...r, B: r.B + 1 })), []);
  const [mode, setMode] = useState<'mp' | 'ri'>('mp');
  const [comp1, setComp1] = useState<MixComponent>('magnitude');
  const [img1, setImg1] = useState<'A' | 'B'>('A');
  const [w1, setW1] = useState(100);
  const [comp2, setComp2] = useState<MixComponent>('phase');
  const [img2, setImg2] = useState<'A' | 'B'>('B');
  const [w2, setW2] = useState(100);
  const [out, setOut] = useState<Gray | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dw1 = useDebounced(w1, 40);
  const dw2 = useDebounced(w2, 40);

  const comp1Options: MixComponent[] = mode === 'mp' ? ['magnitude', 'phase', 'uniform-magnitude', 'uniform-phase'] : ['real', 'imaginary'];
  const comp2Options = partnerOptions(comp1);
  const c2 = comp2Options.includes(comp2) ? comp2 : comp2Options[0];

  useEffect(() => {
    if (!ready.A || !ready.B) return;
    let alive = true;
    w.call('mix', { comp1, img1, w1: dw1 / 100, comp2: c2, img2, w2: dw2 / 100 }).then((r) => alive && setOut(r), (e) => setErr(String(e.message)));
    return () => {
      alive = false;
    };
  }, [ready, comp1, img1, dw1, c2, img2, dw2, w]);

  const imgOpts = [
    { value: 'A' as const, label: 'Image A' },
    { value: 'B' as const, label: 'Image B' },
  ];
  const other = (x: 'A' | 'B') => (x === 'A' ? 'B' : 'A');

  return (
    <ToolPage
      id="mixer"
      intro={
        <p>
          Each image becomes two Fourier components (magnitude and phase, or real and imaginary). The mixer takes component 1 as w·(chosen image) + (1−w)·(other image), does the same for component 2, and inverts the FFT. With the magnitude of A and the phase of B the result looks like B: phase carries the structure. The weights, the &ldquo;uniform&rdquo; options and the real/imaginary mode follow the original app.
        </p>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Source name="A" def="xray" w={w} onReady={onA} />
        <Source name="B" def="mri" w={w} onReady={onB} />
      </div>
      <Panel title="Mixer" className="mt-4">
        <Status error={err} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <Segmented
              label="Mode"
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === 'ri') {
                  setComp1('real');
                  setComp2('imaginary');
                } else {
                  setComp1('magnitude');
                  setComp2('phase');
                }
              }}
              options={[
                { value: 'mp', label: 'Magnitude & phase' },
                { value: 'ri', label: 'Real & imaginary' },
              ]}
            />
            <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-3">
              <legend className="label px-1">Component 1</legend>
              <Select label="Component" value={comp1} onChange={setComp1} options={comp1Options.map((c) => ({ value: c, label: LABEL[c] }))} />
              <Select label="Mostly from" value={img1} onChange={setImg1} options={imgOpts} />
              <Slider label={`${img1} / ${other(img1)}`} value={w1} min={0} max={100} onChange={setW1} format={(v) => `${v}% / ${100 - v}%`} />
            </fieldset>
            <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-3">
              <legend className="label px-1">Component 2</legend>
              <Select label="Component" value={c2} onChange={setComp2} options={comp2Options.map((c) => ({ value: c, label: LABEL[c] }))} />
              <Select label="Mostly from" value={img2} onChange={setImg2} options={imgOpts} />
              <Slider label={`${img2} / ${other(img2)}`} value={w2} min={0} max={100} onChange={setW2} format={(v) => `${v}% / ${100 - v}%`} />
            </fieldset>
          </div>
          <div className="mx-auto w-full max-w-md">
            <ImageView image={out} range="auto" label="Mixed output image" caption={`${LABEL[comp1]} ${w1}% ${img1} + ${LABEL[c2].toLowerCase()} ${w2}% ${img2}`} />
          </div>
        </div>
      </Panel>
    </ToolPage>
  );
}
