import { useId, useRef, type ReactNode } from 'react';
import { UploadIcon } from './Icons';

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const id = useId();
  const { label, value, min, max, step = 1, onChange, format, disabled } = props;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-xs tabular-nums text-fg">
          {format ? format(value) : value}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Select<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label mb-1 block">
        {props.label}
      </label>
      <select id={id} className="field" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NumberField(props: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label mb-1 block">
        {props.label}
      </label>
      <input
        id={id}
        type="number"
        className="field font-mono"
        value={Number.isFinite(props.value) ? props.value : ''}
        step={props.step ?? 1}
        min={props.min}
        max={props.max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) props.onChange(v);
        }}
      />
    </div>
  );
}

/** Segmented control built from radio buttons (keyboard: arrows move the selection). */
export function Segmented<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hideLabel?: boolean }) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={props.hideLabel ? 'sr-only' : 'label mb-1'}>{props.label}</legend>
      <div className="inline-flex flex-wrap rounded-lg border border-line bg-panel p-0.5">
        {props.options.map((o) => {
          const on = o.value === props.value;
          return (
            <label
              key={o.value}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                on ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'
              }`}
            >
              <input type="radio" className="sr-only" name={name} value={o.value} checked={on} onChange={() => props.onChange(o.value)} />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-fg">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

export function FileButton(props: { label?: string; accept: string; onFiles: (files: File[]) => void; multiple?: boolean; directory?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.click()}>
        <UploadIcon />
        {props.label ?? 'Upload your own'}
      </button>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={props.accept}
        multiple={props.multiple}
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          if (f.length) props.onFiles(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

export function Panel(props: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`panel min-w-0 p-3 sm:p-4 ${props.className ?? ''}`}>
      {(props.title || props.actions) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {props.title && <h2 className="text-[13px] font-semibold text-fg">{props.title}</h2>}
          {props.actions}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function Stat(props: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label">{props.label}</div>
      <div className="truncate font-mono text-sm tabular-nums text-fg">{props.value}</div>
    </div>
  );
}

export function Status(props: { busy?: boolean; error?: string | null; children?: ReactNode }) {
  if (props.error)
    return (
      <p role="alert" className="text-[13px] text-red-700 dark:text-red-400">
        {props.error}
      </p>
    );
  return (
    <p aria-live="polite" className="min-h-5 text-[13px] text-subtle">
      {props.busy ? 'Working…' : props.children}
    </p>
  );
}
