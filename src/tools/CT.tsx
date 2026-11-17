import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { FileButton, Panel, Select, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { Plot } from '../components/Plot';
import { useDebounced, usePrefersReducedMotion, useWorker } from '../components/hooks';
import { PauseIcon, PlayIcon } from '../components/Icons';
import { type Gray, minMax, toSquare } from '../lib/image';
import { loadImageFromBlob } from '../lib/load';
import { correlation, rmse, type CTFilter } from '../lib/radon';

const N = 192;

interface Sino {
  data: Float32Array;
  nDet: number;
  nAng: number;
  angles: number[];
}

export default function CT() {
  const w = useWorker(() => new Worker(new URL('../workers/ct.worker.ts', import.meta.url), { type: 'module' }));
  const reduced = usePrefersReducedMotion();
  const [phantom, setPhantom] = useState<Gray | null>(null);
  const [srcName, setSrcName] = useState('Shepp-Logan phantom');
  const [nAngles, setNAngles] = useState(60);
  const [filter, setFilter] = useState<CTFilter>('ramp');
  const [sino, setSino] = useState<Sino | null>(null);
  const [recon, setRecon] = useState<Gray | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const runId = useRef(0);
  const dAngles = useDebounced(nAngles, 150);

  useEffect(() => {
    w.call('phantom', { n: N }).then(setPhantom, (e) => setErr(String(e.message)));
  }, [w]);

  useEffect(() => {
    if (!phantom) return;
    let alive = true;
    w.call('sinogram', { nAngles: dAngles }).then((s) => alive && setSino(s), (e) => setErr(String(e.message)));
    return () => {
      alive = false;
    };
  }, [phantom, dAngles, w]);

  const reconstruct = useCallback(
    (animate: boolean) => {
      if (!sino) return;
      const id = ++runId.current;
      const frames = animate && !reduced ? Math.min(sino.nAng, 48) : 1;
      setPlaying(animate && !reduced);
      setProgress(animate && !reduced ? { done: 0, total: sino.nAng } : null);
      // the worker posts partial images; throttle them to animation frames
      let pending: { done: number; total: number; image: Gray } | null = null;
      let raf = 0;
      const flush = () => {
        raf = 0;
        if (pending && id === runId.current) {
          setRecon(pending.image);
          setProgress({ done: pending.done, total: pending.total });
        }
      };
      w.call(
        'reconstruct',
        { sino: sino.data, nDet: sino.nDet, angles: sino.angles, filter, frames },
        (p) => {
          pending = p;
          if (!raf) raf = requestAnimationFrame(flush);
        },
      ).then(
        (r) => {
          if (id !== runId.current) return;
          cancelAnimationFrame(raf);
          setRecon(r.image);
          setProgress(null);
          setPlaying(false);
        },
        (e) => setErr(String(e.message)),
      );
    },
    [sino, filter, reduced, w],
  );

  // reconstruct immediately whenever the inputs change
  useEffect(() => {
    reconstruct(false);
  }, [reconstruct]);

  const sinoImg = useMemo<Gray | null>(() => (sino ? { w: sino.nAng, h: sino.nDet, data: sino.data } : null), [sino]);
  const stats = useMemo(() => (recon && phantom ? { rmse: rmse(recon.data, phantom.data), r: correlation(recon.data, phantom.data) } : null), [recon, phantom]);
  const profile = useMemo(() => {
    if (!recon || !phantom) return null;
    const row = Math.round(N * 0.55);
    return { a: phantom.data.slice(row * N, row * N + N), b: recon.data.slice(row * N, row * N + N), row };
  }, [recon, phantom]);
  const reconRange: [number, number] = filter === 'none' ? [0, Math.max(1e-6, recon ? minMax(recon.data)[1] : 1)] : [0, 1.05];

  const upload = async (files: File[]) => {
    try {
      const l = await loadImageFromBlob(files[0], 1024);
      const g = toSquare(l.gray, N);
      // scale to 0..1 and zero outside the reconstruction circle (radon assumes the object fits)
      const c = (N - 1) / 2;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.data[y * N + x] = (x - c) ** 2 + (y - c) ** 2 <= (N / 2) ** 2 ? g.data[y * N + x] / 255 : 0;
      await w.call('setImage', { img: g });
      setPhantom(g);
      setSrcName(files[0].name);
    } catch (e) {
      setErr(`Could not open ${files[0].name}: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <ToolPage
      id="ct"
      intro={
        <p>
          A CT scanner measures line integrals of attenuation at many angles; stacked together they form the sinogram (Radon transform). Smearing each projection back across the image (back-projection) gives a blurry laminogram. Filtering each projection with a ramp first (filtered back-projection) cancels the blur. Fewer angles means streaks. Task 8 did this with scikit-image's radon/iradon on the Shepp-Logan phantom; here the same steps run in a Web Worker.
        </p>
      }
      toolbar={
        <>
          <div className="w-56">
            <Slider label="Number of angles (0–180°)" value={nAngles} min={2} max={256} onChange={setNAngles} />
          </div>
          <div className="w-52">
            <Select
              label="Filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'none', label: 'None (laminogram)' },
                { value: 'ramp', label: 'Ramp' },
                { value: 'hamming', label: 'Ramp × Hamming' },
                { value: 'shepp-logan', label: 'Shepp-Logan' },
              ]}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => reconstruct(true)} disabled={!sino || playing}>
            {playing ? <PauseIcon /> : <PlayIcon />}
            {playing ? 'Back-projecting…' : 'Animate back-projection'}
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => { setFilter('none'); setNAngles(8); }}>
              8 angles, unfiltered
            </button>
            <button type="button" className="btn" onClick={() => { setFilter('ramp'); setNAngles(180); }}>
              180 angles, ramp
            </button>
          </div>
          <FileButton accept="image/*" onFiles={upload} label="Use your image" />
        </>
      }
    >
      <Status error={err}>{srcName}</Status>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Object">
          <ImageView image={phantom} range={[0, 1]} label={`Object: ${srcName}`} />
        </Panel>
        <Panel title={`Sinogram (${sino?.nAng ?? '…'} angles)`}>
          <ImageView image={sinoImg} range="auto" aspect={1} label="Sinogram: detector position vertically, projection angle horizontally" caption="x: angle 0→180°, y: detector position">
            {progress && sino && <line x1={progress.done} x2={progress.done} y1={0} y2={sino.nDet} stroke="#fb923c" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          </ImageView>
        </Panel>
        <Panel title={filter === 'none' ? 'Back-projection (unfiltered)' : 'Filtered back-projection'}>
          <ImageView image={recon} range={reconRange} label="Reconstructed image" caption={progress ? `${progress.done} / ${progress.total} projections` : `${sino?.nAng ?? 0} projections`} />
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Line profile through the reconstruction">
          {profile && (
            <Plot
              label="Intensity profile across one row: object versus reconstruction"
              height={180}
              xLabel="pixel"
              series={[
                { y: profile.a, color: 'muted', label: 'object', width: 1.5 },
                { y: filter === 'none' ? Float32Array.from(profile.b, (v) => v / (reconRange[1] || 1)) : profile.b, color: 'c1', label: filter === 'none' ? 'reconstruction (scaled)' : 'reconstruction' },
              ]}
            />
          )}
        </Panel>
        <Panel title="Error">
          {stats && (
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Correlation" value={stats.r.toFixed(3)} />
              <Stat label="RMSE" value={filter === 'none' ? 'n/a (unscaled)' : stats.rmse.toFixed(3)} />
              <Stat label="Angles" value={sino?.nAng ?? '…'} />
              <Stat label="Detector bins" value={sino?.nDet ?? '…'} />
            </dl>
          )}
          <p className="mt-3 text-[13px] text-muted">Rule of thumb: you need roughly π/2 × (detector bins) angles for a streak-free image.</p>
        </Panel>
      </div>
    </ToolPage>
  );
}
