import { useEffect, useRef, useState } from 'react';
import { cssVar, useThemeVersion } from './hooks';

export type SeriesColor = 'c1' | 'c2' | 'c3' | 'c4' | 'muted';

export interface Series {
  x?: ArrayLike<number>;
  y: ArrayLike<number>;
  color?: SeriesColor;
  width?: number;
  dash?: number[];
  mode?: 'line' | 'stem' | 'points' | 'bar' | 'step';
  label?: string;
  alpha?: number;
}

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 10000 || a < 0.01) return v.toExponential(0);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return String(Math.round(v * 100) / 100);
  return String(Math.round(v * 1000) / 1000);
}

export function Plot(props: {
  series: Series[];
  label: string;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  vlines?: { x: number; color?: SeriesColor; dash?: number[] }[];
  legend?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const theme = useThemeVersion();
  const height = props.height ?? 180;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const col = (k: SeriesColor) => cssVar(k === 'muted' ? '--subtle' : `--${k}`);
    const grid = cssVar('--grid');
    const text = cssVar('--subtle');
    const ml = props.yLabel ? 46 : 38;
    const mr = 8;
    const mt = 8;
    const mb = props.xLabel ? 34 : 22;
    const pw = Math.max(10, width - ml - mr);
    const ph = Math.max(10, height - mt - mb);
    let [x0, x1] = props.xDomain ?? [Infinity, -Infinity];
    let [y0, y1] = props.yDomain ?? [Infinity, -Infinity];
    if (!props.xDomain || !props.yDomain) {
      for (const s of props.series) {
        const n = s.y.length;
        for (let i = 0; i < n; i++) {
          const xv = s.x ? s.x[i] : i;
          const yv = s.y[i];
          if (!Number.isFinite(yv)) continue;
          if (!props.xDomain) {
            if (xv < x0) x0 = xv;
            if (xv > x1) x1 = xv;
          }
          if (!props.yDomain) {
            if (yv < y0) y0 = yv;
            if (yv > y1) y1 = yv;
          }
        }
      }
      if (!props.yDomain) {
        if (props.series.some((s) => s.mode === 'bar' || s.mode === 'stem')) y0 = Math.min(0, y0);
        const pad = (y1 - y0) * 0.06 || 1;
        y0 -= pad;
        y1 += pad;
      }
    }
    if (!(x1 > x0)) x1 = x0 + 1;
    if (!(y1 > y0)) y1 = y0 + 1;
    const X = (v: number) => ml + ((v - x0) / (x1 - x0)) * pw;
    const Y = (v: number) => mt + ph - ((v - y0) / (y1 - y0)) * ph;
    ctx.font = '10px "Geist Mono Variable", ui-monospace, monospace';
    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of niceTicks(x0, x1, Math.max(2, Math.floor(pw / 70)))) {
      const px = Math.round(X(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, mt);
      ctx.lineTo(px, mt + ph);
      ctx.stroke();
      ctx.fillText(fmt(t), px, mt + ph + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of niceTicks(y0, y1, Math.max(2, Math.floor(ph / 40)))) {
      const py = Math.round(Y(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(ml, py);
      ctx.lineTo(ml + pw, py);
      ctx.stroke();
      ctx.fillText(fmt(t), ml - 4, py);
    }
    ctx.font = '11px "Geist Variable", ui-sans-serif, system-ui, sans-serif';
    if (props.xLabel) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(props.xLabel, ml + pw / 2, height - 1);
    }
    if (props.yLabel) {
      ctx.save();
      ctx.translate(10, mt + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.yLabel, 0, 0);
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(ml, mt, pw, ph);
    ctx.clip();
    for (const v of props.vlines ?? []) {
      ctx.strokeStyle = col(v.color ?? 'muted');
      ctx.setLineDash(v.dash ?? [4, 3]);
      ctx.beginPath();
      ctx.moveTo(X(v.x), mt);
      ctx.lineTo(X(v.x), mt + ph);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const s of props.series) {
      const c0 = col(s.color ?? 'c1');
      ctx.strokeStyle = c0;
      ctx.fillStyle = c0;
      ctx.globalAlpha = s.alpha ?? 1;
      ctx.lineWidth = s.width ?? 1.5;
      ctx.setLineDash(s.dash ?? []);
      const n = s.y.length;
      const mode = s.mode ?? 'line';
      const xs = (i: number) => (s.x ? s.x[i] : i);
      if (mode === 'line' || mode === 'step') {
        ctx.beginPath();
        // decimate very long series to ~2 points per pixel (min/max per column)
        if (mode === 'line' && n > pw * 3) {
          let col0 = -1;
          let mn = 0;
          let mx = 0;
          let started = false;
          for (let i = 0; i < n; i++) {
            const px = Math.floor(X(xs(i)));
            const yv = s.y[i];
            if (px !== col0) {
              if (col0 >= 0) {
                if (!started) {
                  ctx.moveTo(col0, Y(mn));
                  started = true;
                } else ctx.lineTo(col0, Y(mn));
                ctx.lineTo(col0, Y(mx));
              }
              col0 = px;
              mn = mx = yv;
            } else {
              if (yv < mn) mn = yv;
              if (yv > mx) mx = yv;
            }
          }
          if (col0 >= 0) {
            ctx.lineTo(col0, Y(mn));
            ctx.lineTo(col0, Y(mx));
          }
        } else {
          for (let i = 0; i < n; i++) {
            const px = X(xs(i));
            const py = Y(s.y[i]);
            if (i === 0) ctx.moveTo(px, py);
            else if (mode === 'step') {
              ctx.lineTo(px, Y(s.y[i - 1]));
              ctx.lineTo(px, py);
            } else ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      } else if (mode === 'stem' || mode === 'points') {
        const r = n > 200 ? 1.5 : 2.5;
        for (let i = 0; i < n; i++) {
          const px = X(xs(i));
          const py = Y(s.y[i]);
          if (mode === 'stem') {
            ctx.beginPath();
            ctx.moveTo(px, Y(Math.max(y0, Math.min(y1, 0))));
            ctx.lineTo(px, py);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (mode === 'bar') {
        const bw = Math.max(1, pw / Math.max(1, n) - 0.5);
        const base = Y(Math.max(y0, 0));
        for (let i = 0; i < n; i++) {
          const px = X(xs(i));
          const py = Y(s.y[i]);
          ctx.fillRect(px - bw / 2, Math.min(py, base), bw, Math.abs(base - py));
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.strokeStyle = cssVar('--line');
    ctx.setLineDash([]);
    ctx.strokeRect(ml + 0.5, mt + 0.5, pw - 1, ph - 1);
  }, [props.series, props.xDomain, props.yDomain, props.xLabel, props.yLabel, props.vlines, width, height, theme]);

  const legend = props.legend !== false ? props.series.filter((s) => s.label) : [];
  return (
    <div className="min-w-0">
      {legend.length > 0 && (
        <ul className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted" aria-hidden="true">
          {legend.map((s) => (
            <li key={s.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: `var(--${s.color === 'muted' ? 'subtle' : (s.color ?? 'c1')})` }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={wrap} className="w-full">
        <canvas ref={ref} role="img" aria-label={props.label} style={{ width: '100%', height }} />
      </div>
    </div>
  );
}
