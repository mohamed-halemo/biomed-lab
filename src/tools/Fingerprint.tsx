import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { FileButton, Panel, Segmented, Select, Slider, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { useDebounced, useWorker } from '../components/hooks';
import { PlayIcon } from '../components/Icons';
import { decodeWav, phash, SR, type Features, type Matrix } from '../lib/audio';
import type { Gray } from '../lib/image';

interface Track {
  id: string;
  title: string;
  audio: Float32Array;
  seconds: number;
}

interface Result {
  id: string;
  title: string;
  mel: number;
  mfcc: number;
  chroma: number;
  total: number;
  at: number;
}

function matToGray(m: Matrix): Gray {
  // flip so low frequencies / coefficients are at the bottom
  const out = new Float32Array(m.rows * m.cols);
  for (let r = 0; r < m.rows; r++) out.set(m.data.subarray(r * m.cols, (r + 1) * m.cols), (m.rows - 1 - r) * m.cols);
  return { w: m.cols, h: m.rows, data: out };
}

function Bits({ bits, label }: { bits: Uint8Array; label: string }) {
  return (
    <div className="grid w-16 grid-cols-8 gap-px rounded border border-line bg-line p-px" role="img" aria-label={`${label} hash: ${Array.from(bits).join('')}`}>
      {Array.from(bits).map((b, i) => (
        <span key={i} className="aspect-square" style={{ background: b ? 'var(--fg)' : 'var(--panel)' }} />
      ))}
    </div>
  );
}

let audioCtx: AudioContext | null = null;
function play(x: Float32Array, rate = SR): () => void {
  audioCtx ??= new AudioContext();
  const buf = audioCtx.createBuffer(1, x.length, rate);
  buf.copyToChannel(new Float32Array(x), 0);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start();
  return () => src.stop();
}

export default function Fingerprint() {
  const w = useWorker(() => new Worker(new URL('../workers/audio.worker.ts', import.meta.url), { type: 'module' }));
  const [lib, setLib] = useState<Track[] | null>(null);
  const [mode, setMode] = useState<'clip' | 'mix' | 'upload'>('clip');
  const [song, setSong] = useState('e');
  const [start, setStart] = useState(3);
  const [len, setLen] = useState(4);
  const [snr, setSnr] = useState(10);
  const [a, setA] = useState('a');
  const [b, setB] = useState('c');
  const [mixW, setMixW] = useState(70);
  const [upload, setUpload] = useState<{ name: string; data: Float32Array; sampleRate: number } | null>(null);
  const [out, setOut] = useState<{ query: Float32Array; results: Result[]; features: Features } | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const params = useDebounced(JSON.stringify({ mode, song, start, len, snr, a, b, mixW }), 200);

  useEffect(() => {
    w.call<Track[]>('library').then(setLib, (e) => setErr(String(e.message)));
  }, [w]);

  useEffect(() => {
    if (!lib) return;
    const p = JSON.parse(params);
    let alive = true;
    setBusy(true);
    let call: Promise<{ query: Float32Array; results: Result[]; features: Features }>;
    if (p.mode === 'clip') call = w.call('clip', { id: p.song, start: p.start, seconds: p.len, snr: p.snr });
    else if (p.mode === 'mix') call = w.call('mix', { a: p.a, b: p.b, w: p.mixW / 100 });
    else if (upload) call = w.call('upload', { data: upload.data, sampleRate: upload.sampleRate });
    else {
      setBusy(false);
      return;
    }
    call.then(
      (r) => {
        if (!alive) return;
        setOut(r);
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
  }, [params, lib, upload, w]);

  useEffect(() => () => stopRef.current?.(), []);

  const imgs = useMemo(() => {
    if (!out) return null;
    const f = out.features;
    return { spec: matToGray(f.spec), mel: matToGray(f.mel), mfcc: matToGray(f.mfcc), chroma: matToGray(f.chroma), hashes: { mel: phash(f.mel), mfcc: phash(f.mfcc), chroma: phash(f.chroma) } };
  }, [out]);

  const songOpts = (lib ?? []).map((t) => ({ value: t.id, label: t.title }));
  const titleOf = (id: string) => lib?.find((t) => t.id === id)?.title ?? id;
  const doPlay = (x: Float32Array, rate?: number) => {
    stopRef.current?.();
    try {
      stopRef.current = play(x, rate);
    } catch {
      setErr('Audio playback is not available.');
    }
  };

  const correct = out && (mode === 'clip' ? out.results[0]?.id === song : mode === 'mix' ? [a, b].includes(out.results[0]?.id) : null);

  return (
    <ToolPage
      id="fingerprint"
      intro={
        <>
          <p>
            The Shazam-like app turned each song into feature images (mel spectrogram, MFCC, chroma), hashed every image with a perceptual hash (pHash: 32×32 resize, 2-D DCT, keep the 8×8 low-frequency block, threshold at the median) and ranked songs by the average hash similarity, 1 − Hamming distance / 64. You can mix two songs with a weight slider, as in the original, or query a short noisy clip; clips are compared against every window of the same length in each song.
          </p>
          <p className="text-sm">The library is eight short tunes synthesized in code, so there are no copyrighted recordings involved.</p>
        </>
      }
      toolbar={
        <>
          <Segmented
            label="Query"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'clip', label: 'Noisy clip' },
              { value: 'mix', label: 'Mix two songs' },
              { value: 'upload', label: 'Your WAV' },
            ]}
          />
          {mode === 'upload' && (
            <FileButton
              accept=".wav,audio/wav,audio/x-wav"
              label={upload ? 'Choose another WAV' : 'Upload WAV'}
              onFiles={async (f) => {
                try {
                  const d = decodeWav(await f[0].arrayBuffer());
                  setUpload({ name: f[0].name, ...d });
                } catch (e) {
                  setErr(`Could not read ${f[0].name}: ${e instanceof Error ? e.message : e}`);
                }
              }}
            />
          )}
        </>
      }
    >
      <Status busy={busy} error={err}>
        {mode === 'upload' && !upload ? 'Upload a WAV file (PCM or float). The first 12 s are used.' : out && correct !== null ? (correct ? 'Top match is correct.' : 'Top match is wrong; try less noise or a longer clip.') : ''}
      </Status>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Query">
          {mode === 'clip' && (
            <div className="grid gap-3">
              <Select label="Song" value={song} onChange={setSong} options={songOpts} />
              <Slider label="Start" value={start} min={0} max={12 - len} step={0.5} onChange={setStart} format={(v) => `${v} s`} />
              <Slider label="Length" value={len} min={1} max={12} step={0.5} onChange={(v) => { setLen(v); setStart((s) => Math.min(s, 12 - v)); }} format={(v) => `${v} s`} />
              <Slider label="Signal-to-noise ratio" value={snr} min={-10} max={60} onChange={setSnr} format={(v) => (v >= 60 ? 'no noise' : `${v} dB`)} />
            </div>
          )}
          {mode === 'mix' && (
            <div className="grid gap-3">
              <Select label="Song 1" value={a} onChange={setA} options={songOpts} />
              <Select label="Song 2" value={b} onChange={setB} options={songOpts} />
              <Slider label="Mix weight" value={mixW} min={0} max={100} onChange={setMixW} format={(v) => `${v}% song 1 / ${100 - v}% song 2`} />
            </div>
          )}
          {mode === 'upload' && <p className="text-sm text-muted">{upload ? upload.name : 'No file yet.'}</p>}
          {out && (
            <button type="button" className="btn mt-3" onClick={() => doPlay(out.query)}>
              <PlayIcon /> Play query
            </button>
          )}
          {imgs && (
            <div className="mt-4 grid gap-3">
              <ImageView image={imgs.spec} range="auto" colormap="viridis" aspect={2.6} label="Spectrogram of the query" caption="Spectrogram (0–5.5 kHz)" />
              {(['mel', 'mfcc', 'chroma'] as const).map((k) => (
                <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <ImageView image={imgs[k]} range="auto" colormap="viridis" aspect={3.2} label={`${k} feature image`} caption={k === 'mel' ? 'Mel spectrogram (64 bands)' : k === 'mfcc' ? 'MFCC (20 coefficients)' : 'Chroma (12 pitch classes)'} />
                  <Bits bits={imgs.hashes[k]} label={k} />
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Ranking">
          {out && (
            <ol className="grid gap-2">
              {out.results.map((r, i) => {
                const hit = mode === 'clip' ? r.id === song : mode === 'mix' ? r.id === a || r.id === b : false;
                return (
                  <li key={r.id} className={`rounded-lg border p-2.5 ${i === 0 ? 'border-accent' : 'border-line'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-fg">
                        <span className="mr-2 font-mono text-subtle">{i + 1}</span>
                        {r.title}
                        {hit && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">{mode === 'mix' ? 'in mix' : 'source'}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-sm tabular-nums text-fg">{r.total.toFixed(1)}%</span>
                        <button type="button" className="btn px-2 py-1" aria-label={`Play ${r.title}`} onClick={() => { const t = lib?.find((x) => x.id === r.id); if (t) doPlay(t.audio); }}>
                          <PlayIcon />
                        </button>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-surface">
                      <div className="h-full rounded bg-accent" style={{ width: `${Math.max(0, (r.total - 40) / 60) * 100}%` }} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-subtle">
                      mel {(r.mel * 100).toFixed(0)} · mfcc {(r.mfcc * 100).toFixed(0)} · chroma {(r.chroma * 100).toFixed(0)}
                      {mode !== 'mix' && ` · best window at ${r.at.toFixed(1)} s`}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {mode === 'mix' && out && <p className="mt-3 text-[13px] text-muted">Mixing {titleOf(a)} and {titleOf(b)}: as the weight moves, the ranking of the two songs swaps.</p>}
        </Panel>
      </div>
    </ToolPage>
  );
}
