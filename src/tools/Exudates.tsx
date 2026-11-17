import { useEffect, useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Check, FileButton, Panel, Select, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { useWorker } from '../components/hooks';
import { asset } from '../tools';
import { fetchBlob, loadImageFromBlob } from '../lib/load';
import type { ExudateResult } from '../lib/exudate';
import type { Gray } from '../lib/image';

const SAMPLES = [
  { value: 'hao', label: 'Hard exudates (Hao et al. 2022, CC BY 4.0)', file: 'samples/fundus-hao2022.jpg', od: { x: 225, y: 292 } },
  { value: 'nei', label: 'Macular edema (NEI, public domain)', file: 'samples/fundus-nei.jpg', od: { x: 40, y: 290 } },
];

export default function Exudates() {
  const w = useWorker(() => new Worker(new URL('../workers/exudate.worker.ts', import.meta.url), { type: 'module' }));
  const [sample, setSample] = useState('hao');
  const [img, setImg] = useState<{ rgba: ImageData; name: string } | null>(null);
  const [od, setOd] = useState<{ x: number; y: number } | null>(SAMPLES[0].od);
  const [pickOd, setPickOd] = useState(false);
  const [res, setRes] = useState<ExudateResult | null>(null);
  const [thr, setThr] = useState(0.02);
  const [showCand, setShowCand] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (sample === 'upload') return;
    const s = SAMPLES.find((x) => x.value === sample)!;
    let alive = true;
    fetchBlob(asset(s.file))
      .then((b) => loadImageFromBlob(b))
      .then((l) => {
        if (!alive) return;
        setImg({ rgba: l.rgba, name: s.label });
        setOd(s.od);
      })
      .catch((e) => setErr(String(e.message)));
    return () => {
      alive = false;
    };
  }, [sample]);

  useEffect(() => {
    if (!img) return;
    let alive = true;
    setBusy(true);
    const data = new Uint8ClampedArray(img.rgba.data);
    w.call<ExudateResult>('detect', { img: { w: img.rgba.width, h: img.rgba.height, data }, od }, undefined, [data.buffer]).then(
      (r) => {
        if (!alive) return;
        setRes(r);
        setBusy(false);
        setErr(null);
      },
      (e) => {
        setErr(String(e.message));
        setBusy(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [img, od, w]);

  // colour image at the working resolution, with candidates and detections overlaid
  const overlay = useMemo(() => {
    if (!img || !res) return null;
    const { w: W, h: H } = res;
    const out = new ImageData(W, H);
    const src = img.rgba;
    for (let y = 0; y < H; y++) {
      const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / H));
      for (let x = 0; x < W; x++) {
        const sx = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / W));
        const s = (sy * src.width + sx) * 4;
        const i = y * W + x;
        const o = i * 4;
        let r = src.data[s];
        let g = src.data[s + 1];
        let b = src.data[s + 2];
        if (res.score[i] > thr) {
          r = 0;
          g = 255;
          b = 120;
        } else if (showCand && res.candidates[i]) {
          r = r * 0.4;
          g = g * 0.4;
          b = 255;
        }
        out.data[o] = r;
        out.data[o + 1] = g;
        out.data[o + 2] = b;
        out.data[o + 3] = 255;
      }
    }
    return out;
  }, [img, res, thr, showCand]);

  const steps = useMemo(() => {
    if (!res) return null;
    const { w: W, h: H } = res;
    const g = (a: ArrayLike<number>): Gray => ({ w: W, h: H, data: Float32Array.from(a) });
    return { v: g(res.v8), fov: g(res.fov), bg: g(res.background), cand: g(res.candidates), edge: g(res.edge), score: g(res.score) };
  }, [res]);

  const found = useMemo(() => (res ? res.regions.filter((r) => r.score > thr) : []), [res, thr]);
  const area = found.reduce((a, r) => a + r.size, 0);
  const sc = res ? res.w / (img?.rgba.width ?? res.w) : 1;

  return (
    <ToolPage
      id="exudates"
      intro={
        <>
          <p>
            Hard exudates are bright yellow lipid deposits, an early sign of diabetic macular edema. The pipeline from the original repo (after Giancardo et al.): estimate the background with a large median filter and morphological reconstruction, keep pixels brighter than it as candidates, then score each candidate by how much edge (Kirsch operator) it adds to the green channel. The optic disc is bright too, so a window around it is removed.
          </p>
          <p className="text-sm">This is a teaching demo of a classic method, not a diagnostic tool. Large confluent exudates wider than the median window are partly absorbed into the background estimate.</p>
        </>
      }
      toolbar={
        <>
          <div className="w-80 max-w-full">
            <Select label="Fundus image" value={sample} onChange={setSample} options={[...SAMPLES.map((s) => ({ value: s.value, label: s.label })), ...(sample === 'upload' ? [{ value: 'upload', label: img?.name ?? 'Your image' }] : [])]} />
          </div>
          <FileButton
            accept="image/*"
            onFiles={async (f) => {
              try {
                const l = await loadImageFromBlob(f[0], 1600);
                setSample('upload');
                setOd(null);
                setImg({ rgba: l.rgba, name: f[0].name });
              } catch (e) {
                setErr(`Could not open ${f[0].name}: ${e instanceof Error ? e.message : e}`);
              }
            }}
          />
          <button type="button" className={`btn ${pickOd ? 'btn-primary' : ''}`} aria-pressed={pickOd} onClick={() => setPickOd(!pickOd)}>
            {pickOd ? 'Click the optic disc…' : 'Set optic disc'}
          </button>
          <button type="button" className="btn" onClick={() => setOd(null)}>
            Auto-detect disc
          </button>
        </>
      }
    >
      <Status busy={busy} error={err}>
        {res && `Working size ${res.w}×${res.h}, median window ${res.kernel}×${res.kernel}, ${res.regions.length} candidate regions`}
      </Status>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Detections">
          <ImageView
            image={overlay}
            label="Fundus image with detected exudates in green"
            maxHeight="72vh"
            onPointer={(p) => {
              if (!pickOd || p.type !== 'down' || !res || !img) return;
              setOd({ x: (p.x / res.w) * img.rgba.width, y: (p.y / res.h) * img.rgba.height });
              setPickOd(false);
            }}
          >
            {res && <rect x={res.od.x1} y={res.od.y1} width={res.od.x2 - res.od.x1} height={res.od.y2 - res.od.y1} fill="none" stroke="#facc15" strokeDasharray="6 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          </ImageView>
          <p className="mt-1.5 text-xs text-subtle">Green: exudates above the threshold. Dashed box: optic disc window removed from the search{od ? '' : ' (auto-detected)'}.</p>
        </Panel>
        <div className="grid min-w-0 content-start gap-4">
          <Panel title="Threshold">
            <Slider label="Minimum mean edge strength" value={thr} min={0} max={0.12} step={0.002} onChange={setThr} format={(v) => v.toFixed(3)} />
            <div className="mt-3">
              <Check label="Show all candidates (blue)" checked={showCand} onChange={setShowCand} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Stat label="Regions kept" value={found.length} />
              <Stat label="Area" value={res ? `${((area / (res.fov.reduce((a, b) => a + b, 0) || 1)) * 100).toFixed(2)}% of FOV` : '…'} />
              <Stat label="Largest score" value={res && res.regions.length ? Math.max(...res.regions.map((r) => r.score)).toFixed(3) : '…'} />
              <Stat label="Scale" value={`${sc.toFixed(2)}×`} />
            </dl>
          </Panel>
          <Panel title="Pipeline steps">
            <div className="grid grid-cols-2 gap-3">
              <ImageView image={steps?.v ?? null} range={[0, 255]} label="V channel" caption="1. V channel (HSV)" />
              <ImageView image={steps?.fov ?? null} range={[0, 1]} label="Field of view mask" caption="2. FOV mask minus disc" />
              <ImageView image={steps?.bg ?? null} range={[0, 255]} label="Estimated background" caption="3. Median + reconstruction" />
              <ImageView image={steps?.cand ?? null} range={[0, 1]} label="Candidate pixels" caption="4. Candidates (V > bg)" />
              <ImageView image={steps?.edge ?? null} range={[-0.05, 0.15]} label="Edge strength" caption="5. Kirsch edge added" />
              <ImageView image={steps?.score ?? null} range={[0, 0.08]} colormap="hot" label="Candidate scores" caption="6. Mean edge per region" />
            </div>
          </Panel>
        </div>
      </div>
    </ToolPage>
  );
}
