import { useEffect, useRef, useState } from 'react';
import { client, type Client } from '../workers/rpc';

/** Bumps whenever the colour theme changes (toggle or system), so canvases can redraw with new colours. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', bump);
      mo.disconnect();
    };
  }, []);
  return v;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A worker client that lives as long as the component. */
export function useWorker(factory: () => Worker): Client {
  const ref = useRef<Client | null>(null);
  if (!ref.current) ref.current = client(factory);
  useEffect(() => {
    const c = ref.current!;
    return () => c.terminate();
  }, []);
  return ref.current;
}

export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setR(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return r;
}

/** Debounce a fast-changing value (sliders) before heavy work. */
export function useDebounced<T>(value: T, ms = 120): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
