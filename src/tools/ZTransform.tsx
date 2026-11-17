import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import ToolPage from '../components/ToolPage';
import { Check, Panel, Segmented, Select, Stat, Status } from '../components/Controls';
import { Plot } from '../components/Plot';
import { asset } from '../tools';
import { allPassZero, freqResponse, lfilter, polyFromRoots, unwrap, withConjugates, type C } from '../lib/zplane';

interface Pt {
  id: number;
  kind: 'pole' | 'zero';
  re: number;
  im: number;
}

const AP_LIBRARY: { id: string; a: C }[] = [
  { id: '0.5', a: { re: 0.5, im: 0 } },
  { id: '-0.5', a: { re: -0.5, im: 0 } },
  { id: '0.9', a: { re: 0.9, im: 0 } },
  { id: '0.5+0.5j', a: { re: 0.5, im: 0.5 } },
  { id: '-0.3+0.7j', a: { re: -0.3, im: 0.7 } },
];

const FS = 360;
const notch = (2 * Math.PI * 60) / FS;
const DEFAULT: Pt[] = [
  { id: 1, kind: 'zero', re: round(Math.cos(notch)), im: round(Math.sin(notch)) },
  { id: 2, kind: 'pole', re: round(0.9 * Math.cos(notch)), im: round(0.9 * Math.sin(notch)) },
];

const R = 1.6; // view half-size in z units

export default function ZTransform() {
  const [pts, setPts] = useState<Pt[]>(DEFAULT);
  const [mode, setMode] = useState<'zero' | 'pole' | 'move'>('move');
  const [conj, setConj] = useState(true);
  const [sel, setSel] = useState<number | null>(null);
  const [ap, setAp] = useState<string[]>([]);
  const [db, setDb] = useState(true);
  const [input, setInput] = useState<'ecg+hum' | 'ecg' | 'chirp'>('ecg+hum');
  const [ecg, setEcg] = useState<number[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const nextId = useRef(10);

  useEffect(() => {
    fetch(asset('samples/ecg-mitdb-100.json'))
      .then((r) => r.json())
      .then((j) => setEcg(j.leads.MLII))
      .catch((e) => setErr(String(e)));
  }, []);

  const zeros = useMemo(() => {
    const z = pts.filter((p) => p.kind === 'zero').map((p) => ({ re: p.re, im: p.im }));
    return conj ? withConjugates(z) : z;
  }, [pts, conj]);
  const poles = useMemo(() => {
    const p = pts.filter((q) => q.kind === 'pole').map((q) => ({ re: q.re, im: q.im }));
    return conj ? withConjugates(p) : p;
  }, [pts, conj]);
  const apPoles = useMemo(() => {
    const a = AP_LIBRARY.filter((x) => ap.includes(x.id)).map((x) => x.a);
    return conj ? withConjugates(a) : a;
  }, [ap, conj]);

  const resp = useMemo(() => freqResponse(zeros, poles, 512), [zeros, poles]);
  const respAP = useMemo(() => freqResponse([...zeros, ...apPoles.map(allPassZero)], [...poles, ...apPoles], 512), [zeros, poles, apPoles]);
  const peak = useMemo(() => Math.max(1e-12, ...resp.mag), [resp]);
  const stable = poles.every((p) => Math.hypot(p.re, p.im) < 1);

  const magY = useMemo(() => Float64Array.from(resp.mag, (m) => (db ? 20 * Math.log10(Math.max(1e-6, m / peak)) : m / peak)), [resp, peak, db]);
  const fHz = useMemo(() => Float64Array.from(resp.w, (w) => (w / Math.PI) * (FS / 2)), [resp]);
  const ph = useMemo(() => unwrap(resp.phase), [resp]);
  const phAP = useMemo(() => unwrap(respAP.phase), [respAP]);

  const sig = useMemo(() => {
    const n = 4 * FS;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      if (input === 'chirp') x[i] = Math.sin(2 * Math.PI * (2 * t + ((FS / 2 - 2) / (2 * 4)) * t * t));
      else {
        x[i] = ecg ? ecg[i] ?? 0 : 0;
        if (input === 'ecg+hum') x[i] += 0.4 * Math.sin(2 * Math.PI * 60 * t);
      }
    }
    const b = polyFromRoots([...zeros, ...apPoles.map(allPassZero)]);
    const a = polyFromRoots([...poles, ...apPoles]);
    let y = lfilter(b, a, x);
    // normalise so the passband peak has unit gain
    const g = 1 / peak;
    y = y.map((v) => v * g);
    const t = Float64Array.from({ length: n }, (_, i) => i / FS);
    return { t, x, y };
  }, [input, ecg, zeros, poles, apPoles, peak]);

  // ---- z-plane interaction ----
  const toZ = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    return { re: ((e.clientX - r.left) / r.width) * 2 * R - R, im: R - ((e.clientY - r.top) / r.height) * 2 * R };
  };
  const hit = (z: C) => {
    let best: Pt | null = null;
    let bd = 0.08;
    for (const p of pts) {
      for (const s of conj ? [1, -1] : [1]) {
        const d = Math.hypot(p.re - z.re, p.im * s - z.im);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
    }
    return best;
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    const z = toZ(e);
    const h = hit(z);
    if (h) {
      setSel(h.id);
      dragging.current = h.id;
      svg.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (mode === 'move') {
      setSel(null);
      return;
    }
    const id = nextId.current++;
    setPts([...pts, { id, kind: mode, re: round(z.re), im: round(z.im) }]);
    setSel(id);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current === null) return;
    const z = toZ(e);
    const id = dragging.current;
    setPts((ps) => ps.map((p) => (p.id === id ? { ...p, re: round(clamp(z.re)), im: round(clamp(z.im)) } : p)));
  };
  const onUp = () => {
    dragging.current = null;
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (sel === null) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (d[e.key]) {
      e.preventDefault();
      setPts(pts.map((p) => (p.id === sel ? { ...p, re: round(clamp(p.re + d[e.key][0])), im: round(clamp(p.im + d[e.key][1])) } : p)));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setPts(pts.filter((p) => p.id !== sel));
      setSel(null);
    }
  };

  const S = (v: number) => v; // svg uses z units directly (viewBox in z coordinates, y flipped below)
  const marks = (p: Pt, mirror: boolean) => {
    const x = S(p.re);
    const y = S(mirror ? p.im : -p.im);
    const on = p.id === sel;
    const col = p.kind === 'pole' ? 'var(--c2)' : 'var(--c1)';
    return p.kind === 'pole' ? (
      <g key={`${p.id}${mirror}`} stroke={col} strokeWidth={on ? 0.035 : 0.025} opacity={mirror ? 0.55 : 1}>
        <line x1={x - 0.06} y1={y - 0.06} x2={x + 0.06} y2={y + 0.06} />
        <line x1={x - 0.06} y1={y + 0.06} x2={x + 0.06} y2={y - 0.06} />
        {on && <circle cx={x} cy={y} r={0.11} fill="none" strokeWidth={0.012} />}
      </g>
    ) : (
      <g key={`${p.id}${mirror}`} opacity={mirror ? 0.55 : 1}>
        <circle cx={x} cy={y} r={0.055} fill="none" stroke={col} strokeWidth={on ? 0.035 : 0.025} />
        {on && <circle cx={x} cy={y} r={0.11} fill="none" stroke={col} strokeWidth={0.012} />}
      </g>
    );
  };

  return (
    <ToolPage
      id="ztransform"
      intro={
        <p>
          A digital filter is set by where its zeros and poles sit in the z-plane. Points on the unit circle are frequencies (angle 0 = DC, π = Nyquist): a zero near the circle pulls the response down at that frequency, a pole near it pushes it up. The default is a 60 Hz notch for an ECG sampled at 360 Hz. All-pass sections (pole a, zero 1/a*) leave the magnitude alone and only change the phase, as in the original Bokeh site.
        </p>
      }
      toolbar={
        <>
          <Segmented
            label="Click to"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'move', label: 'Select / drag' },
              { value: 'zero', label: 'Add zero' },
              { value: 'pole', label: 'Add pole' },
            ]}
          />
          <Check label="Conjugate pairs" checked={conj} onChange={setConj} />
          <button type="button" className="btn" onClick={() => { setPts([]); setSel(null); setAp([]); }}>
            Clear all
          </button>
          <button type="button" className="btn" onClick={() => { setPts(DEFAULT); setSel(null); }}>
            60 Hz notch
          </button>
        </>
      }
    >
      <Status error={err}>{stable ? 'Stable: all poles inside the unit circle.' : 'Unstable: a pole is on or outside the unit circle.'}</Status>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Z-plane">
          <svg
            ref={svg}
            viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}
            className="aspect-square w-full touch-none cursor-crosshair rounded-md border border-line bg-panel"
            role="application"
            aria-label="Z-plane. Click to add a pole or zero, drag to move. With a point selected, arrow keys move it and Delete removes it."
            tabIndex={0}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onKeyDown={onKey}
          >
            <line x1={-R} x2={R} y1={0} y2={0} stroke="var(--grid)" strokeWidth={0.01} />
            <line y1={-R} y2={R} x1={0} x2={0} stroke="var(--grid)" strokeWidth={0.01} />
            <circle cx={0} cy={0} r={1} fill="none" stroke="var(--subtle)" strokeWidth={0.012} strokeDasharray="0.04 0.03" />
            {apPoles.map((a, i) => (
              <g key={`ap${i}`} stroke="var(--c3)" strokeWidth={0.02} opacity={0.8}>
                <line x1={a.re - 0.045} y1={-a.im - 0.045} x2={a.re + 0.045} y2={-a.im + 0.045} />
                <line x1={a.re - 0.045} y1={-a.im + 0.045} x2={a.re + 0.045} y2={-a.im - 0.045} />
                <circle cx={allPassZero(a).re} cy={-allPassZero(a).im} r={0.04} fill="none" />
              </g>
            ))}
            {pts.map((p) => marks(p, false))}
            {conj && pts.filter((p) => Math.abs(p.im) > 1e-9).map((p) => marks(p, true))}
          </svg>
          <p className="mt-1.5 text-xs text-subtle">○ zero · × pole · faded = conjugate · purple = all-pass. Tab to the plane, select a point, then use arrow keys (Shift for bigger steps) or Delete.</p>
          <div className="mt-3 max-h-56 overflow-auto rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 font-medium">Real</th>
                  <th className="px-2 py-1.5 font-medium">Imag</th>
                  <th className="px-2 py-1.5 font-medium">|z|</th>
                  <th className="px-2 py-1.5"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p) => (
                  <tr key={p.id} className={`border-t border-line ${p.id === sel ? 'bg-accent-soft' : ''}`}>
                    <td className="px-2 py-1">{p.kind}</td>
                    {(['re', 'im'] as const).map((k) => (
                      <td key={k} className="px-1 py-1">
                        <input
                          type="number"
                          step={0.01}
                          aria-label={`${p.kind} ${k === 're' ? 'real' : 'imaginary'} part`}
                          className="field w-20 px-1 py-0.5 font-mono text-xs"
                          value={p[k]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) setPts(pts.map((q) => (q.id === p.id ? { ...q, [k]: v } : q)));
                          }}
                          onFocus={() => setSel(p.id)}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 font-mono">{Math.hypot(p.re, p.im).toFixed(2)}</td>
                    <td className="px-1 py-1">
                      <button type="button" className="text-subtle hover:text-fg" aria-label={`Remove ${p.kind}`} onClick={() => setPts(pts.filter((q) => q.id !== p.id))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {!pts.length && (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-subtle">
                      No poles or zeros yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <fieldset className="mt-3">
            <legend className="label mb-1">All-pass sections</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {AP_LIBRARY.map((x) => (
                <Check key={x.id} label={`a = ${x.id}`} checked={ap.includes(x.id)} onChange={(v) => setAp(v ? [...ap, x.id] : ap.filter((q) => q !== x.id))} />
              ))}
            </div>
          </fieldset>
        </Panel>
        <div className="grid min-w-0 content-start gap-4">
          <Panel title="Magnitude response" actions={<Check label="dB" checked={db} onChange={setDb} />}>
            <Plot label="Magnitude response" height={190} xLabel="frequency (Hz, fs = 360)" yLabel={db ? 'dB' : '|H|'} yDomain={db ? [-60, 5] : undefined} xDomain={[0, FS / 2]} series={[{ x: fHz, y: magY, color: 'c1' }]} />
          </Panel>
          <Panel title="Phase response">
            <Plot
              label="Unwrapped phase response"
              height={170}
              xLabel="frequency (Hz)"
              yLabel="rad"
              xDomain={[0, FS / 2]}
              series={[
                { x: fHz, y: ph, color: 'c1', label: 'designed filter' },
                ...(apPoles.length ? [{ x: fHz, y: phAP, color: 'c3' as const, label: 'with all-pass' }] : []),
              ]}
            />
          </Panel>
          <Panel title="Apply to a signal" actions={<div className="w-40"><Select label="Input" value={input} onChange={setInput} options={[{ value: 'ecg+hum', label: 'ECG + 60 Hz hum' }, { value: 'ecg', label: 'ECG' }, { value: 'chirp', label: 'Chirp 2–180 Hz' }]} /></div>}>
            <Plot
              label="Input and filtered output signal"
              height={200}
              xLabel="time (s)"
              series={[
                { x: sig.t, y: sig.x, color: 'muted', width: 1, label: 'input' },
                { x: sig.t, y: sig.y, color: 'c1', width: 1.3, label: 'output' },
              ]}
            />
            <dl className="mt-2 grid grid-cols-3 gap-3">
              <Stat label="Zeros" value={zeros.length + apPoles.length} />
              <Stat label="Poles" value={poles.length + apPoles.length} />
              <Stat label="Peak gain" value={`${(20 * Math.log10(peak)).toFixed(1)} dB`} />
            </dl>
          </Panel>
        </div>
      </div>
    </ToolPage>
  );
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function clamp(v: number) {
  return Math.max(-R + 0.05, Math.min(R - 0.05, v));
}
