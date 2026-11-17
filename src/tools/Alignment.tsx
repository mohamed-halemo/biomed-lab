import { useEffect, useMemo, useRef, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { FileButton, NumberField, Panel, Segmented, Slider, Stat, Status } from '../components/Controls';
import { Plot } from '../components/Plot';
import { usePrefersReducedMotion, useWorker } from '../components/hooks';
import { PauseIcon, PlayIcon } from '../components/Icons';
import { DIR_D, DIR_H, DIR_V, identity, parseFasta, type AlignMode, type Scoring } from '../lib/align';

interface PairResult {
  a: string;
  b: string;
  score: number;
  path: number[];
  rows: number;
  cols: number;
  matrix: Float64Array;
  dir: Uint8Array;
  order: Int32Array;
  best: { i: number; j: number; value: number };
}

interface MsaResult {
  aligned: string[];
  center: number;
  entropy: number[];
  meanEntropy: number;
  sumOfPairs: number;
  percentNoGaps: number;
}

const MSA_SAMPLE = `>seq_A (synthetic)
ATGGCTAGCTTGACCGTAAGGCTTACGATCGGATCCTAG
>seq_B (synthetic)
ATGGCTAGCTAGACCGTAAGGCTTACGTTCGGATCCTAG
>seq_C (synthetic)
ATGGCAGCTTGACCGTAAGGCTTTACGATCGGATCTAG
>seq_D (synthetic)
ATGCCTAGCTTGACGTAAGGCATTACGATCGGGATCCTAG
>seq_E (synthetic)
ATGGCTAGCTTGACCGTTAGGCTTACGATCAGATCCTTAG`;

const BASE_COL: Record<string, string> = { A: 'var(--c1)', C: 'var(--c3)', G: 'var(--c4)', T: 'var(--c2)', U: 'var(--c2)' };
const ARROW: Record<number, string> = { [DIR_D]: '↖', [DIR_H]: '↑', [DIR_V]: '←' };
const MAX_GRID = 24;

function clean(s: string) {
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

function Pairwise() {
  const w = useWorker(() => new Worker(new URL('../workers/align.worker.ts', import.meta.url), { type: 'module' }));
  const reduced = usePrefersReducedMotion();
  const [s1, setS1] = useState('TGTTACGG');
  const [s2, setS2] = useState('GGTTGACTA');
  const [mode, setMode] = useState<AlignMode>('local');
  const [sc, setSc] = useState<Scoring>({ match: 3, mismatch: -3, gap: -2 });
  const [res, setRes] = useState<PairResult | null>(null);
  const [step, setStep] = useState(Infinity);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [err, setErr] = useState<string | null>(null);
  const A = clean(s1);
  const B = clean(s2);

  useEffect(() => {
    if (!A || !B) return;
    if (A.length * B.length > 4e6) {
      setErr('Sequences too long for the in-browser matrix (limit 4 million cells).');
      return;
    }
    let alive = true;
    w.call<PairResult>('pairwise', { a: A, b: B, mode, scoring: sc }).then(
      (r) => {
        if (!alive) return;
        setRes(r);
        setErr(null);
        setStep(Infinity);
        setPlaying(false);
      },
      (e) => setErr(String(e.message)),
    );
    return () => {
      alive = false;
    };
  }, [A, B, mode, sc, w]);

  const total = res ? res.order.length : 0;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setStep((s) => {
        const n = (Number.isFinite(s) ? s : 0) + 1;
        if (n >= total) {
          setPlaying(false);
          return Infinity;
        }
        return n;
      });
    }, 1000 / speed);
    return () => clearInterval(t);
  }, [playing, speed, total]);

  const small = res && res.rows <= MAX_GRID + 1 && res.cols <= MAX_GRID + 1;
  const filled = useMemo(() => {
    if (!res) return null;
    const f = new Uint8Array(res.rows * res.cols);
    const n = Number.isFinite(step) ? step : res.order.length;
    for (let k = 0; k < n; k++) f[res.order[k]] = 1;
    return f;
  }, [res, step]);
  const onPath = useMemo(() => new Set(res && !Number.isFinite(step) ? res.path : []), [res, step]);
  const current = res && Number.isFinite(step) ? res.order[Math.max(0, step - 1)] : -1;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Panel title="Input">
          <div className="grid gap-3">
            <div>
              <label className="label mb-1 block" htmlFor="seq1">
                Sequence 1 (rows)
              </label>
              <textarea id="seq1" className="field h-16 font-mono" value={s1} onChange={(e) => setS1(e.target.value)} spellCheck={false} />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="seq2">
                Sequence 2 (columns)
              </label>
              <textarea id="seq2" className="field h-16 font-mono" value={s2} onChange={(e) => setS2(e.target.value)} spellCheck={false} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Segmented
                label="Alignment"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'global', label: 'Global (NW)' },
                  { value: 'local', label: 'Local (SW)' },
                ]}
              />
              <FileButton
                accept=".fasta,.fa,.fna,.txt"
                label="Upload FASTA"
                onFiles={async (f) => {
                  const r = parseFasta(await f[0].text());
                  if (r.length < 2) setErr('The FASTA file needs at least two sequences.');
                  else {
                    setS1(r[0].seq);
                    setS2(r[1].seq);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Match" value={sc.match} onChange={(v) => setSc({ ...sc, match: v })} />
              <NumberField label="Mismatch" value={sc.mismatch} onChange={(v) => setSc({ ...sc, mismatch: v })} />
              <NumberField label="Gap" value={sc.gap} onChange={(v) => setSc({ ...sc, gap: v })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => { setS1('GATTACA'); setS2('GCATGCU'); setMode('global'); setSc({ match: 1, mismatch: -1, gap: -1 }); }}>
                NW example
              </button>
              <button type="button" className="btn" onClick={() => { setS1('TGTTACGG'); setS2('GGTTGACTA'); setMode('local'); setSc({ match: 3, mismatch: -3, gap: -2 }); }}>
                SW example
              </button>
              <button type="button" className="btn" onClick={() => setSc({ match: 2, mismatch: -1, gap: -2 })}>
                App defaults (2/−1/−2)
              </button>
            </div>
          </div>
          <Status error={err} />
          {res && (
            <div className="mt-2">
              <pre className="overflow-x-auto rounded-md bg-surface p-3 font-mono text-sm leading-6" aria-label="Alignment result">
                {res.a}
                {'\n'}
                {Array.from(res.a, (c, i) => (c === res.b[i] ? '|' : c === '-' || res.b[i] === '-' ? ' ' : '.')).join('')}
                {'\n'}
                {res.b}
              </pre>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <Stat label="Score" value={res.score} />
                <Stat label="Identity" value={`${(identity(res.a, res.b) * 100).toFixed(0)}%`} />
                <Stat label="Length" value={res.a.length} />
              </dl>
            </div>
          )}
        </Panel>
        <Panel
          title="Dynamic programming matrix"
          actions={
            small ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (playing) setPlaying(false);
                    else {
                      if (!Number.isFinite(step)) setStep(0);
                      setPlaying(true);
                    }
                  }}
                >
                  {playing ? <PauseIcon /> : <PlayIcon />}
                  {playing ? 'Pause' : 'Animate fill'}
                </button>
                <button type="button" className="btn" onClick={() => { setPlaying(false); setStep((s) => (Number.isFinite(s) ? Math.min(total, s + 1) : 1)); }}>
                  Step
                </button>
                <button type="button" className="btn" onClick={() => { setPlaying(false); setStep(Infinity); }}>
                  Show all + traceback
                </button>
              </div>
            ) : null
          }
        >
          {small && res && filled && (
            <>
              <div className="w-48">
                <Slider label="Speed" value={speed} min={2} max={60} onChange={setSpeed} format={(v) => `${v} cells/s`} />
              </div>
              {reduced && <p className="text-xs text-subtle">Reduced motion is on: use Step to fill the matrix cell by cell.</p>}
              <div className="mt-2 overflow-x-auto">
                <table className="border-collapse font-mono text-[11px]" aria-label="Scoring matrix">
                  <thead>
                    <tr>
                      <th className="h-7 w-7" />
                      <th className="h-7 w-9 text-subtle">−</th>
                      {Array.from(B).map((c, j) => (
                        <th key={j} className="h-7 w-9 font-semibold" style={{ color: BASE_COL[c] }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: res.rows }, (_, i) => (
                      <tr key={i}>
                        <th className="w-7 font-semibold" style={{ color: i ? BASE_COL[A[i - 1]] : 'var(--subtle)' }}>
                          {i ? A[i - 1] : '−'}
                        </th>
                        {Array.from({ length: res.cols }, (_, j) => {
                          const idx = i * res.cols + j;
                          const border = i === 0 || j === 0;
                          const shown = border || filled[idx];
                          const path = onPath.has(idx);
                          const cur = idx === current;
                          const isBest = mode === 'local' && !Number.isFinite(step) && i === res.best.i && j === res.best.j;
                          return (
                            <td
                              key={j}
                              className={`relative h-9 w-9 border border-line text-center align-middle tabular-nums ${path ? 'bg-accent-soft font-semibold text-accent' : 'text-fg'} ${cur ? 'outline-2 -outline-offset-2 outline-[var(--c2)]' : ''} ${isBest ? 'ring-2 ring-inset ring-[var(--c2)]' : ''}`}
                            >
                              {shown && (
                                <>
                                  <span className="absolute left-0.5 top-0 text-[9px] text-subtle">{!border ? ARROW[res.dir[idx]] ?? '' : ''}</span>
                                  {res.matrix[idx]}
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-subtle">
                Each cell takes the best of ↖ diagonal (match/mismatch), ↑ gap in sequence 2, ← gap in sequence 1{mode === 'local' ? ', or 0' : ''}. Ties go diagonal first, as np.argmax did. Highlighted: traceback from {mode === 'local' ? 'the highest cell until a 0' : 'the bottom-right corner'}.
              </p>
            </>
          )}
          {res && !small && <Heatmap res={res} />}
        </Panel>
      </div>
    </>
  );
}

function Heatmap({ res }: { res: PairResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const { rows, cols, matrix, path } = res;
    c.width = cols;
    c.height = rows;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(cols, rows);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of matrix) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    for (let i = 0; i < rows * cols; i++) {
      const t = (matrix[i] - lo) / (hi - lo || 1);
      img.data[i * 4] = 20 + 200 * t;
      img.data[i * 4 + 1] = 30 + 150 * t;
      img.data[i * 4 + 2] = 60 + 60 * (1 - t);
      img.data[i * 4 + 3] = 255;
    }
    for (const p of path) {
      img.data[p * 4] = 255;
      img.data[p * 4 + 1] = 120;
      img.data[p * 4 + 2] = 40;
    }
    ctx.putImageData(img, 0, 0);
  }, [res]);
  return (
    <div>
      <canvas ref={ref} role="img" aria-label="Heat map of the scoring matrix with the traceback path in orange" className="pixelated w-full rounded-md border border-line" style={{ aspectRatio: `${res.cols} / ${res.rows}` }} />
      <p className="mt-2 text-xs text-subtle">
        {res.rows - 1}×{res.cols - 1} matrix shown as a heat map (cells too many to print); orange is the traceback path. Use sequences of up to {MAX_GRID} letters to see the animated table.
      </p>
    </div>
  );
}

function Multiple() {
  const w = useWorker(() => new Worker(new URL('../workers/align.worker.ts', import.meta.url), { type: 'module' }));
  const [text, setText] = useState(MSA_SAMPLE);
  const [res, setRes] = useState<MsaResult | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (t: string) => {
    const recs = parseFasta(t);
    if (recs.length < 2) {
      setErr('Paste at least two FASTA records.');
      return;
    }
    if (recs.some((r) => r.seq.length > 3000)) {
      setErr('Sequences longer than 3000 letters are too slow for this demo.');
      return;
    }
    setBusy(true);
    try {
      const r = await w.call<MsaResult>('multiple', { seqs: recs.map((x) => x.seq), scoring: { match: 2, mismatch: -1, gap: -2 } });
      setRes(r);
      setNames(recs.map((x) => x.name));
      setErr(null);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  };
  useEffect(() => {
    run(MSA_SAMPLE);
    // run once with the sample
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const L = res?.aligned[0]?.length ?? 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <Panel title="Sequences (FASTA)">
        <label className="sr-only" htmlFor="msa">
          FASTA input
        </label>
        <textarea id="msa" className="field h-64 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => run(text)} disabled={busy}>
            Align
          </button>
          <FileButton
            accept=".fasta,.fa,.fna,.txt"
            label="Upload FASTA"
            onFiles={async (f) => {
              const t = await f[0].text();
              setText(t);
              run(t);
            }}
          />
        </div>
        <Status busy={busy} error={err} />
        <p className="mt-2 text-[13px] text-muted">
          The original app called MUSCLE. In the browser this uses a centre-star progressive alignment: the sequence with the best total Needleman-Wunsch score is the centre, every other sequence is aligned to it, and gaps are merged (scoring 2 / −1 / −2).
        </p>
      </Panel>
      <Panel title="Multiple alignment">
        {res && (
          <>
            <div className="overflow-x-auto rounded-md bg-surface p-3">
              <table className="border-collapse font-mono text-xs leading-5" aria-label="Aligned sequences">
                <tbody>
                  {res.aligned.map((s, k) => (
                    <tr key={k}>
                      <th className="whitespace-nowrap pr-3 text-left font-sans font-normal text-muted">
                        {names[k]}
                        {k === res.center && <span className="ml-1 text-[10px] text-accent">centre</span>}
                      </th>
                      <td className="whitespace-pre">
                        {Array.from(s).map((c, i) => (
                          <span key={i} style={{ color: c === '-' ? 'var(--subtle)' : BASE_COL[c] ?? 'var(--fg)' }}>
                            {c}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th className="pr-3 text-left font-sans font-normal text-subtle">conserved</th>
                    <td className="whitespace-pre text-subtle">{Array.from({ length: L }, (_, i) => (res.entropy[i] === 0 && res.aligned[0][i] !== '-' ? '*' : ' ')).join('')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <Plot label="Shannon entropy per alignment column" height={130} xLabel="column" yLabel="bits" series={[{ y: res.entropy, mode: 'bar', color: 'c3' }]} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Mean column entropy" value={`${res.meanEntropy.toFixed(3)} bits`} />
              <Stat label="Sum of pairs" value={res.sumOfPairs} />
              <Stat label="No-gap positions" value={`${res.percentNoGaps.toFixed(1)}%`} />
              <Stat label="Columns" value={L} />
            </dl>
            <p className="mt-2 text-xs text-subtle">Metrics follow metrics.py: entropy per column, sum of pairs (+1 match, −1 mismatch, −2 residue/gap, 0 gap/gap) and percentage of non-gap characters.</p>
          </>
        )}
      </Panel>
    </div>
  );
}

export default function Alignment() {
  const [tab, setTab] = useState<'pair' | 'multi'>('pair');
  return (
    <ToolPage
      id="alignment"
      intro={
        <p>
          Needleman-Wunsch (global) and Smith-Waterman (local) fill a table where each cell is the best score for aligning two prefixes, then trace back the choices to read off the alignment. The filling order, tie-breaking and scoring follow pairwise_alignment.py from the Alignment app; the multiple alignment reports the same metrics as the app.
        </p>
      }
      toolbar={
        <Segmented
          label="Section"
          hideLabel
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pair', label: 'Pairwise' },
            { value: 'multi', label: 'Multiple' },
          ]}
        />
      }
    >
      {tab === 'pair' ? <Pairwise /> : <Multiple />}
    </ToolPage>
  );
}
