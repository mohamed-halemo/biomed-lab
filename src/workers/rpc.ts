// Tiny request/response protocol between the UI and Web Workers.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (args: any, progress: (p: unknown, transfer?: Transferable[]) => void) => any;

interface Req {
  id: number;
  fn: string;
  args: unknown;
}

/** Collect transferable buffers from a result so big arrays move instead of copying. */
export function transferables(v: unknown, out: Transferable[] = [], seen = new Set<unknown>()): Transferable[] {
  if (!v || typeof v !== 'object' || seen.has(v)) return out;
  seen.add(v);
  if (ArrayBuffer.isView(v)) {
    const b = (v as ArrayBufferView).buffer;
    if (b instanceof ArrayBuffer && !out.includes(b)) out.push(b);
    return out;
  }
  if (v instanceof ArrayBuffer) {
    if (!out.includes(v)) out.push(v);
    return out;
  }
  for (const k of Object.keys(v as object)) transferables((v as any)[k], out, seen);
  return out;
}

export function expose(handlers: Record<string, Handler>): void {
  self.onmessage = async (e: MessageEvent<Req>) => {
    const { id, fn, args } = e.data;
    try {
      const progress = (p: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage({ id, progress: p }, transfer);
      const result = await handlers[fn](args, progress);
      (self as unknown as Worker).postMessage({ id, result }, transferables(result));
    } catch (err) {
      (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
  };
}

export interface Client {
  call<T = any>(fn: string, args?: unknown, onProgress?: (p: any) => void, transfer?: Transferable[]): Promise<T>;
  terminate(): void;
}

export function client(factory: () => Worker): Client {
  let w: Worker | null = null;
  let next = 1;
  const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void; prog?: (p: any) => void }>();
  const get = () => {
    if (!w) {
      w = factory();
      w.onmessage = (e: MessageEvent) => {
        const { id, result, error, progress } = e.data;
        const p = pending.get(id);
        if (!p) return;
        if (progress !== undefined) {
          p.prog?.(progress);
          return;
        }
        pending.delete(id);
        if (error) p.rej(new Error(error));
        else p.res(result);
      };
      w.onerror = (e) => {
        for (const p of pending.values()) p.rej(new Error(e.message || 'Worker error'));
        pending.clear();
      };
    }
    return w;
  };
  return {
    call(fn, args, onProgress, transfer = []) {
      const id = next++;
      return new Promise((res, rej) => {
        pending.set(id, { res, rej, prog: onProgress });
        get().postMessage({ id, fn, args }, transfer);
      });
    },
    terminate() {
      w?.terminate();
      w = null;
      for (const p of pending.values()) p.rej(new Error('cancelled'));
      pending.clear();
    },
  };
}
