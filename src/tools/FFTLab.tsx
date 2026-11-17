import { useEffect, useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { FileButton, Panel, Select, Slider, Stat, Status } from '../components/Controls';
import { Plot } from '../components/Plot';
import { useDebounced, useWorker } from '../components/hooks';
import { mulberry32, gaussian } from '../lib/rng';
import { parseSignalText } from '../lib/signal';

interface Tone {
  f: number;
  a: number;
}

export default function FFTLab() {
  const w = useWorker(() => new Worker(new URL('../workers/dsp.worker.ts', import.meta.url), { type: 'module' }));
  const [N, setN] = useState('512');
  const fs = 256;
  const [tones, setTones] = useState<Tone[]>([
    { f: 12, a: 1 },
    { f: 40, a: 0.5 },
    { f: 90, a: 0.25 },
  ]);
  const [noise, setNoise] = useState(0.1);
  const [custom, setCustom] = useState<{ name: string; y: number[] } | null>(null);
  const [res, setRes] = useState<{ re: Float64Array; im: Float64Array; fftMs: number; dftMs: number; maxErr: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = Number(N);

  const x = useMemo(() => {
    const out = new Float64Array(n);
    if (custom) {
      for (let i = 0; i < n; i++) out[i] = custom.y[i] ?? 0;
      return out;
    }
    const r = mulberry32(5);
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      let v = 0;
      for (const tn of tones) v += tn.a * Math.sin(2 * Math.PI * tn.f * t);
      out[i] = v + noise * gaussian(r);
    }
    return out;
  }, [n, tones, noise, custom]);
  const dx = useDebounced(x, 150);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    w.call('compare', { x: dx }).then(
      (r) => {
        if (!alive) return;
        setRes(r);
        setBusy(false);
      },
      (e) => {
        setErr(String(e.message));
        setBusy(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [dx, w]);

  const spec = useMemo(() => {
    if (!res || res.re.length !== n) return null;
    const half = n / 2 + 1;
    const f = Float64Array.from({ length: half }, (_, k) => (k * fs) / n);
    const mag = Float64Array.from({ length: half }, (_, k) => (Math.hypot(res.re[k], res.im[k]) * (k === 0 || k === n / 2 ? 1 : 2)) / n);
    const ph = Float64Array.from({ length: half }, (_, k) => (mag[k] > 0.02 ? Math.atan2(res.im[k], res.re[k]) : 0));
    return { f, mag, ph };
  }, [res, n]);

  const t = useMemo(() => Float64Array.from({ length: n }, (_, i) => i / fs), [n]);
  const ops = { dft: n * n, fft: (n / 2) * Math.log2(n) };

  return (
    <ToolPage
      id="fft"
      intro={
        <p>
          The C++ project implemented the discrete Fourier transform twice: the direct O(N²) sum and the recursive radix-2 FFT (split into even and odd samples, transform each half, combine with twiddle factors), exposed to Python through pybind11. Here both run on a signal you build, in a Web Worker, and are timed against each other. They give the same spectrum up to rounding error.
        </p>
      }
      toolbar={
        <>
          <div className="w-32">
            <Select label="N (samples)" value={N} onChange={setN} options={['64', '128', '256', '512', '1024', '2048', '4096'].map((v) => ({ value: v, label: v }))} />
          </div>
          <FileButton accept=".txt,.csv,text/plain,text/csv" label="Upload CSV / TXT" onFiles={async (f) => {
            try {
              const r = parseSignalText(await f[0].text());
              setCustom({ name: f[0].name, y: r.y });
            } catch (e) {
              setErr(String(e instanceof Error ? e.message : e));
            }
          }} />
          {custom && (
            <button type="button" className="btn" onClick={() => setCustom(null)}>
              Back to built signal
            </button>
          )}
        </>
      }
    >
      <Status busy={busy} error={err}>
        {custom ? `${custom.name}: first ${n} samples (zero padded if shorter), treated as ${fs} Hz` : `Sampling rate ${fs} Hz, ${(n / fs).toFixed(2)} s`}
      </Status>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title="Signal builder">
          <div className="grid gap-4">
            {tones.map((tn, i) => (
              <fieldset key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-line p-3" disabled={!!custom}>
                <legend className="label px-1">Sinusoid {i + 1}</legend>
                <Slider label="Frequency" value={tn.f} min={0} max={fs / 2} step={1} onChange={(v) => setTones(tones.map((q, k) => (k === i ? { ...q, f: v } : q)))} format={(v) => `${v} Hz`} />
                <Slider label="Amplitude" value={tn.a} min={0} max={2} step={0.05} onChange={(v) => setTones(tones.map((q, k) => (k === i ? { ...q, a: v } : q)))} format={(v) => v.toFixed(2)} />
              </fieldset>
            ))}
            <Slider label="Noise (std. dev.)" value={noise} min={0} max={1} step={0.01} onChange={setNoise} format={(v) => v.toFixed(2)} />
          </div>
        </Panel>
        <div className="grid min-w-0 gap-4">
          <Panel title="Time domain">
            <Plot label="Signal in the time domain" height={160} xLabel="time (s)" series={[{ x: t, y: x, color: 'c3', width: 1.2 }]} />
          </Panel>
          <Panel title="Magnitude spectrum (FFT)">
            {spec && <Plot label="Single-sided amplitude spectrum" height={180} xLabel="frequency (Hz)" yLabel="amplitude" series={[{ x: spec.f, y: spec.mag, color: 'c1', mode: n <= 256 ? 'stem' : 'line' }]} />}
          </Panel>
          <Panel title="Phase (where amplitude > 0.02)">
            {spec && <Plot label="Phase spectrum" height={140} xLabel="frequency (Hz)" yLabel="rad" yDomain={[-3.3, 3.3]} series={[{ x: spec.f, y: spec.ph, color: 'c2', mode: 'points' }]} />}
          </Panel>
        </div>
      </div>
      <Panel title="DFT versus FFT" className="mt-4">
        {res && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Naive DFT time" value={`${res.dftMs.toFixed(2)} ms`} />
            <Stat label="Recursive FFT time" value={`${res.fftMs.toFixed(3)} ms`} />
            <Stat label="Speed-up" value={`${(res.dftMs / Math.max(1e-6, res.fftMs)).toFixed(0)}×`} />
            <Stat label="Complex multiplies" value={`${ops.dft.toLocaleString()} vs ${ops.fft.toLocaleString()}`} />
            <Stat label="Max |FFT − DFT|" value={res.maxErr.toExponential(2)} />
          </dl>
        )}
        <p className="mt-3 text-[13px] text-muted">Double N and the DFT gets about 4× slower while the FFT only a little over 2×. At N = 4096 that is 16.7 million multiplies against about 25 thousand.</p>
      </Panel>
    </ToolPage>
  );
}
