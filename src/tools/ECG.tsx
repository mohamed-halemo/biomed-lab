import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { Check, FileButton, Panel, Segmented, Select, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { Plot } from '../components/Plot';
import { PauseIcon, PlayIcon } from '../components/Icons';
import { asset } from '../tools';
import { equalize10, holdReconstruct, magnitudeSpectrum, parseSignalText, sampleAt, sincReconstruct, spectrogram } from '../lib/signal';
import { fftInPlace, nextPow2 } from '../lib/fft';

interface Sig {
  name: string;
  fs: number;
  leads: Record<string, number[]>;
}

function lowpass(x: ArrayLike<number>, fs: number, fc: number): Float64Array {
  const N = nextPow2(x.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < x.length; i++) re[i] = x[i];
  fftInPlace(re, im);
  for (let k = 0; k < N; k++) {
    const f = ((k <= N / 2 ? k : N - k) * fs) / N;
    if (f > fc) re[k] = im[k] = 0;
  }
  fftInPlace(re, im, true);
  return re.slice(0, x.length);
}

export default function ECG() {
  const [sig, setSig] = useState<Sig | null>(null);
  const [lead, setLead] = useState('MLII');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(asset('samples/ecg-mitdb-100.json'))
      .then((r) => r.json())
      .then((j) => setSig({ name: 'MIT-BIH record 100 (first 10 s)', fs: j.fs, leads: j.leads }))
      .catch((e) => setErr(String(e)));
  }, []);

  const x = useMemo(() => (sig ? sig.leads[lead] ?? Object.values(sig.leads)[0] : null), [sig, lead]);
  const fs = sig?.fs ?? 360;
  const dur = x ? x.length / fs : 10;

  // ---- viewer + equalizer ----
  const [gains, setGains] = useState<number[]>(Array(10).fill(1));
  const [winSec, setWinSec] = useState(3);
  const [t0, setT0] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const eq = useMemo(() => (x ? equalize10(x, gains) : null), [x, gains]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT0((t) => {
        const n = t + dt;
        return n > dur - winSec ? 0 : n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, dur, winSec]);

  const view = useMemo(() => {
    if (!x || !eq) return null;
    const a = Math.floor(t0 * fs);
    const b = Math.min(x.length, Math.floor((t0 + winSec) * fs));
    const t = Float64Array.from({ length: b - a }, (_, i) => (a + i) / fs);
    return { t, orig: x.slice(a, b), eq: eq.slice(a, b) };
  }, [x, eq, t0, winSec, fs]);

  const spec = useMemo(() => {
    if (!eq) return null;
    const s = spectrogram(eq, 256, 32);
    // image rows: top = high frequency
    const img = new Float32Array(s.rows * s.cols);
    for (let r = 0; r < s.rows; r++) img.set(s.data.subarray(r * s.cols, (r + 1) * s.cols), (s.rows - 1 - r) * s.cols);
    let mx = -Infinity;
    for (const v of img) mx = Math.max(mx, v);
    return { w: s.cols, h: s.rows, data: img, mx };
  }, [eq]);

  // ---- sampling ----
  const [fsS, setFsS] = useState(60);
  const [recon, setRecon] = useState<'sinc' | 'hold'>('sinc');
  const [aa, setAa] = useState(false);
  const [sw0, setSw0] = useState(1);
  const samp = useMemo(() => {
    if (!x) return null;
    const src = aa ? lowpass(x, fs, fsS / 2) : Float64Array.from(x);
    const s = sampleAt(src, fs, fsS);
    const a = Math.floor(sw0 * fs);
    const b = Math.min(x.length, a + 2 * fs);
    const at = Float64Array.from({ length: b - a }, (_, i) => (a + i) / fs);
    const y = recon === 'sinc' ? sincReconstruct(s, fsS, at) : holdReconstruct(s, fsS, at);
    const inWin: number[] = [];
    for (let i = 0; i < s.t.length; i++) if (s.t[i] >= at[0] && s.t[i] <= at[at.length - 1]) inWin.push(i);
    // whole-signal reconstruction error
    const allT = Float64Array.from({ length: x.length }, (_, i) => i / fs);
    const yAll = recon === 'sinc' ? sincReconstruct(s, fsS, allT) : holdReconstruct(s, fsS, allT);
    let e = 0;
    let p = 0;
    const m0 = Math.floor(0.3 * fs);
    for (let i = m0; i < x.length - m0; i++) {
      e += (yAll[i] - x[i]) ** 2;
      p += x[i] ** 2;
    }
    const specO = magnitudeSpectrum(x, fs);
    const specR = magnitudeSpectrum(yAll, fs);
    return {
      at,
      orig: x.slice(a, b),
      y,
      st: Float64Array.from(inWin, (i) => s.t[i]),
      sv: Float64Array.from(inWin, (i) => s.v[i]),
      nrmse: Math.sqrt(e / p),
      specO,
      specR,
    };
  }, [x, fs, fsS, recon, aa, sw0]);

  const upload = async (files: File[]) => {
    try {
      const txt = await files[0].text();
      const r = parseSignalText(txt);
      setSig({ name: files[0].name, fs: r.fs, leads: { signal: r.y } });
      setLead('signal');
      setT0(0);
      setSw0(0);
      setErr(null);
    } catch (e) {
      setErr(`Could not read ${files[0].name}: ${e instanceof Error ? e.message : e}`);
    }
  };

  const bandHz = fs / 2 / 10;

  return (
    <ToolPage
      id="ecg"
      intro={
        <p>
          The Signal Viewer app scrolled an ECG in real time with a 10-band equalizer (each slider scales one tenth of the spectrum before the inverse FFT) and a spectrogram. The sampling section resamples the same ECG at a lower rate: below twice the highest frequency in the signal, high frequencies fold back as aliases and the reconstruction (sinc interpolation or sample-and-hold) no longer matches.
        </p>
      }
      toolbar={
        <>
          {sig && Object.keys(sig.leads).length > 1 && (
            <div className="w-36">
              <Select label="Lead" value={lead} onChange={setLead} options={Object.keys(sig.leads).map((k) => ({ value: k, label: k }))} />
            </div>
          )}
          <FileButton accept=".txt,.csv,.tsv,.dat,text/plain,text/csv" onFiles={upload} label="Upload CSV / TXT" />
        </>
      }
    >
      <Status error={err}>{sig && `${sig.name} · ${fs} Hz · ${dur.toFixed(1)} s`}</Status>
      <Panel
        title="Viewer"
        actions={
          <button type="button" className="btn" onClick={() => setPlaying(!playing)} aria-pressed={playing}>
            {playing ? <PauseIcon /> : <PlayIcon />}
            {playing ? 'Pause' : 'Play'}
          </button>
        }
      >
        {view && (
          <Plot
            label="ECG window: original and equalized signal"
            height={200}
            xLabel="time (s)"
            yLabel="mV"
            xDomain={[view.t[0] ?? 0, (view.t[0] ?? 0) + winSec]}
            series={[
              { x: view.t, y: view.orig, color: 'muted', width: 1, label: 'original' },
              { x: view.t, y: view.eq, color: 'c1', width: 1.5, label: 'equalized' },
            ]}
          />
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Slider label="Position" value={Math.round(t0 * 100) / 100} min={0} max={Math.max(0, dur - winSec)} step={0.01} onChange={setT0} format={(v) => `${v.toFixed(2)} s`} />
          <Slider label="Window (zoom)" value={winSec} min={0.5} max={Math.min(10, dur)} step={0.5} onChange={(v) => { setWinSec(v); setT0((t) => Math.min(t, Math.max(0, dur - v))); }} format={(v) => `${v} s`} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <fieldset>
            <legend className="label mb-2">Equalizer (band gains)</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {gains.map((g, i) => (
                <Slider
                  key={i}
                  label={`${Math.round(i * bandHz)}–${Math.round((i + 1) * bandHz)} Hz`}
                  value={g}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(v) => setGains(gains.map((q, k) => (k === i ? v : q)))}
                  format={(v) => `×${v.toFixed(2)}`}
                />
              ))}
            </div>
            <button type="button" className="btn mt-2" onClick={() => setGains(Array(10).fill(1))}>
              Reset
            </button>
          </fieldset>
          <div>
            <ImageView image={spec} range={spec ? [spec.mx - 70, spec.mx] : 'auto'} colormap="viridis" aspect={2.2} label="Spectrogram of the equalized signal" caption={`Spectrogram of the equalized signal (0–${fs / 2} Hz bottom to top, 0–${dur.toFixed(0)} s)`} />
          </div>
        </div>
      </Panel>

      <Panel title="Sampling and reconstruction" className="mt-4">
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <div className="w-64">
            <Slider label="Sampling rate" value={fsS} min={5} max={fs} onChange={setFsS} format={(v) => `${v} Hz (Nyquist ${v / 2} Hz)`} />
          </div>
          <Segmented
            label="Reconstruction"
            value={recon}
            onChange={setRecon}
            options={[
              { value: 'sinc', label: 'Sinc (ideal)' },
              { value: 'hold', label: 'Sample & hold' },
            ]}
          />
          <Check label="Anti-alias low-pass before sampling" checked={aa} onChange={setAa} />
          <div className="w-48">
            <Slider label="Window start" value={sw0} min={0} max={Math.max(0, dur - 2)} step={0.1} onChange={setSw0} format={(v) => `${v.toFixed(1)} s`} />
          </div>
        </div>
        {samp && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Plot
              label="Original ECG, samples and reconstruction"
              height={230}
              xLabel="time (s)"
              yLabel="mV"
              series={[
                { x: samp.at, y: samp.orig, color: 'muted', width: 1.2, label: 'original (360 Hz)' },
                { x: samp.at, y: samp.y, color: 'c1', width: 1.6, label: 'reconstruction' },
                { x: samp.st, y: samp.sv, color: 'c2', mode: 'points', label: `samples at ${fsS} Hz` },
              ]}
            />
            <div>
              <Plot
                label="Magnitude spectra of the original and reconstructed signal"
                height={190}
                xLabel="frequency (Hz)"
                xDomain={[0, Math.min(fs / 2, 100)]}
                vlines={[{ x: fsS / 2, color: 'c2' }]}
                series={[
                  { x: samp.specO.f, y: samp.specO.mag, color: 'muted', width: 1, label: 'original' },
                  { x: samp.specR.f, y: samp.specR.mag, color: 'c1', width: 1.2, label: 'reconstructed' },
                ]}
              />
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <Stat label="Normalized RMS error" value={`${(samp.nrmse * 100).toFixed(1)}%`} />
                <Stat label="Samples kept" value={`${Math.floor(dur * fsS)} of ${x?.length ?? 0}`} />
              </dl>
            </div>
          </div>
        )}
        <p className="mt-2 text-[13px] text-muted">
          Most ECG energy sits below about 40 Hz, so around 80 Hz the reconstruction is already close; below that the QRS spikes get distorted and energy above the dashed Nyquist line folds back. The anti-alias filter trades aliasing for a smoother (band-limited) result.
        </p>
      </Panel>
    </ToolPage>
  );
}
