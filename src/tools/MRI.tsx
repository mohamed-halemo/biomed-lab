import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { FileButton, Panel, Segmented, Select, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { useDebounced, useWorker } from '../components/hooks';
import { PauseIcon, PlayIcon } from '../components/Icons';
import type { MeshData } from '../components/Viewer3D';
import { asset } from '../tools';
import { type Gray, makeGray } from '../lib/image';
import { fetchArrayBuffer } from '../lib/load';
import { downsample2, gunzipIfNeeded, parseNifti, stackDicom, type Volume } from '../lib/volume';
import type { Mesh } from '../lib/mc';

const Viewer3D = lazy(() => import('../components/Viewer3D'));

type Plane = 'axial' | 'coronal' | 'sagittal';
const PLANES: Plane[] = ['axial', 'sagittal', 'coronal'];

function planeImage(v: Volume, plane: Plane, cur: { x: number; y: number; z: number }): Gray {
  const { nx: X, ny: Y, nz: Z, data } = v;
  const [w, h] = plane === 'axial' ? [X, Y] : plane === 'coronal' ? [X, Z] : [Y, Z];
  const g = makeGray(w, h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let x: number;
      let y: number;
      let z: number;
      if (plane === 'axial') {
        x = X - 1 - c;
        y = Y - 1 - r;
        z = cur.z;
      } else if (plane === 'coronal') {
        x = X - 1 - c;
        y = cur.y;
        z = Z - 1 - r;
      } else {
        x = cur.x;
        y = Y - 1 - c;
        z = Z - 1 - r;
      }
      g.data[r * w + c] = data[(z * Y + y) * X + x];
    }
  return g;
}

async function loadBrainMesh(): Promise<MeshData> {
  const buf = new Uint8Array(await gunzipIfNeeded(await fetchArrayBuffer(asset('samples/mri/brain.mesh.gz'))));
  const hdr = new Uint32Array(buf.buffer.slice(0, 8));
  const nv = hdr[0];
  const nf = hdr[1];
  let off = 8;
  const pos16 = new Uint16Array(buf.buffer.slice(off, off + nv * 6));
  off += nv * 6;
  const C = [91, 109, 80];
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const x = pos16[i * 3] / 10;
    const y = pos16[i * 3 + 1] / 10;
    const z = pos16[i * 3 + 2] / 10;
    positions[i * 3] = x - C[0];
    positions[i * 3 + 1] = z - C[2];
    positions[i * 3 + 2] = -(y - C[1]);
  }
  const colors = new Uint8Array(buf.buffer.slice(off, off + nv * 3));
  off += nv * 3;
  const index = new Uint32Array(buf.buffer.slice(off, off + nf * 12));
  return { positions, colors, index };
}

export default function MRI() {
  const [vol, setVol] = useState<Volume | null>(null);
  const [isSample, setIsSample] = useState(true);
  const [cur, setCur] = useState({ x: 91, y: 109, z: 90 });
  const [win, setWin] = useState<[number, number]>([0, 255]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cine, setCine] = useState<Plane | null>(null);
  const [fps, setFps] = useState(12);
  const [view, setView] = useState<'planes' | '3d'>('planes');

  const loadSample = async () => {
    setBusy(true);
    try {
      const raw = await gunzipIfNeeded(await fetchArrayBuffer(asset('samples/mri/t1.u8.gz')));
      const v: Volume = { nx: 182, ny: 218, nz: 182, sx: 1, sy: 1, sz: 1, data: new Uint8Array(raw), label: 'IXI002 T1 (MNI space, 1 mm)' };
      setVol(v);
      setIsSample(true);
      setCur({ x: 91, y: 109, z: 90 });
      setWin([0, 255]);
      setErr(null);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  };
  useEffect(() => {
    loadSample();
  }, []);

  const upload = async (files: File[]) => {
    setBusy(true);
    try {
      let v: Volume;
      if (files.length === 1 && /\.nii(\.gz)?$/i.test(files[0].name)) v = parseNifti(await gunzipIfNeeded(await files[0].arrayBuffer()), files[0].name);
      else v = stackDicom(await Promise.all(files.map((f) => f.arrayBuffer())), `${files.length} DICOM file${files.length > 1 ? 's' : ''}`);
      setVol(v);
      setIsSample(false);
      setCur({ x: v.nx >> 1, y: v.ny >> 1, z: v.nz >> 1 });
      setWin([0, 255]);
      setErr(null);
    } catch (e) {
      setErr(`Could not open the file(s): ${e instanceof Error ? e.message : e}`);
    }
    setBusy(false);
  };

  // cine loop through slices of one plane (the "video of slices" from MRI-planes-viewer)
  const curRef = useRef(cur);
  curRef.current = cur;
  useEffect(() => {
    if (!cine || !vol) return;
    const key = cine === 'axial' ? 'z' : cine === 'coronal' ? 'y' : 'x';
    const n = cine === 'axial' ? vol.nz : cine === 'coronal' ? vol.ny : vol.nx;
    const t = setInterval(() => {
      const c = curRef.current;
      setCur({ ...c, [key]: (c[key] + 1) % n });
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [cine, fps, vol]);

  const imgs = useMemo(() => {
    if (!vol) return null;
    return {
      axial: planeImage(vol, 'axial', cur),
      coronal: planeImage(vol, 'coronal', cur),
      sagittal: planeImage(vol, 'sagittal', cur),
    };
  }, [vol, cur]);

  const range: [number, number] = [win[0], Math.max(win[0] + 1, win[1])];

  return (
    <ToolPage
      id="mri"
      intro={
        <>
          <p>
            A 3-D scan is a stack of slices; cutting it along the other two axes gives sagittal and coronal views. Click any view to move the shared crosshair, use the sliders to step through slices, or play a cine loop like the original viewer. Plane aspect ratios come from the voxel size (pixel spacing and slice thickness), as in the Image-Modalities script. The 3D tab extracts an iso-surface with marching cubes, the browser version of the VTK contour filter.
          </p>
          <p className="text-sm">Sample: IXI002 T1-weighted MRI from the IXI dataset (CC BY-SA 3.0), registered to MNI space. Upload a .nii/.nii.gz volume or a folder&apos;s worth of uncompressed .dcm slices.</p>
        </>
      }
      toolbar={
        <>
          <Segmented
            label="View"
            hideLabel
            value={view}
            onChange={setView}
            options={[
              { value: 'planes', label: '3 planes' },
              { value: '3d', label: '3D surface' },
            ]}
          />
          <FileButton accept=".nii,.gz,.dcm,application/dicom" multiple onFiles={upload} label="Upload NIfTI or DICOM series" />
          {!isSample && (
            <button type="button" className="btn" onClick={loadSample}>
              Back to sample
            </button>
          )}
        </>
      }
    >
      <Status busy={busy} error={err}>
        {vol && `${vol.label} · ${vol.nx}×${vol.ny}×${vol.nz} voxels · ${vol.sx.toFixed(2)}×${vol.sy.toFixed(2)}×${vol.sz.toFixed(2)} mm`}
      </Status>
      {view === 'planes' ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANES.map((p) => {
              if (!vol || !imgs) return <Panel key={p} title={p}>{null}</Panel>;
              const { nx: X, ny: Y, nz: Z } = vol;
              const [w, h] = p === 'axial' ? [X, Y] : p === 'coronal' ? [X, Z] : [Y, Z];
              const [sw, sh] = p === 'axial' ? [vol.sx, vol.sy] : p === 'coronal' ? [vol.sx, vol.sz] : [vol.sy, vol.sz];
              const col = p === 'sagittal' ? Y - 1 - cur.y : X - 1 - cur.x;
              const row = p === 'axial' ? Y - 1 - cur.y : Z - 1 - cur.z;
              const key = p === 'axial' ? 'z' : p === 'coronal' ? 'y' : 'x';
              const n = p === 'axial' ? Z : p === 'coronal' ? Y : X;
              return (
                <Panel
                  key={p}
                  title={<span className="capitalize">{p}</span>}
                  actions={
                    <button type="button" className="btn px-2 py-1" onClick={() => setCine(cine === p ? null : p)} aria-pressed={cine === p} aria-label={`${cine === p ? 'Stop' : 'Play'} ${p} cine`}>
                      {cine === p ? <PauseIcon /> : <PlayIcon />}
                      Cine
                    </button>
                  }
                >
                  <ImageView
                    image={imgs[p]}
                    range={range}
                    aspect={(w * sw) / (h * sh)}
                    label={`${p} slice ${cur[key]} of ${n}`}
                    onPointer={(e) => {
                      if (e.type === 'up' && !e.buttons) return;
                      const c = Math.max(0, Math.min(w - 1, Math.floor(e.x)));
                      const r = Math.max(0, Math.min(h - 1, Math.floor(e.y)));
                      if (p === 'axial') setCur({ ...cur, x: X - 1 - c, y: Y - 1 - r });
                      else if (p === 'coronal') setCur({ ...cur, x: X - 1 - c, z: Z - 1 - r });
                      else setCur({ ...cur, y: Y - 1 - c, z: Z - 1 - r });
                    }}
                  >
                    <line x1={col + 0.5} x2={col + 0.5} y1={0} y2={h} stroke="#4fa3ff" strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <line y1={row + 0.5} y2={row + 0.5} x1={0} x2={w} stroke="#4fa3ff" strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  </ImageView>
                  <div className="mt-2">
                    <Slider label={`${p} slice`} value={cur[key]} min={0} max={n - 1} onChange={(v) => setCur({ ...cur, [key]: v })} format={(v) => `${v} / ${n - 1}`} />
                  </div>
                </Panel>
              );
            })}
          </div>
          <Panel title="Display" className="mt-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Slider label="Window low" value={win[0]} min={0} max={254} onChange={(v) => setWin([v, Math.max(v + 1, win[1])])} />
              <Slider label="Window high" value={win[1]} min={1} max={255} onChange={(v) => setWin([Math.min(win[0], v - 1), v])} />
              <Slider label="Cine speed" value={fps} min={2} max={30} onChange={setFps} format={(v) => `${v} fps`} />
              {vol && <Stat label="Voxel at crosshair" value={`(${cur.x}, ${cur.y}, ${cur.z}) = ${vol.data[(cur.z * vol.ny + cur.y) * vol.nx + cur.x]}`} />}
            </div>
          </Panel>
        </>
      ) : (
        vol && <Surface vol={vol} isSample={isSample} />
      )}
    </ToolPage>
  );
}

function Surface(props: { vol: Volume; isSample: boolean }) {
  const { vol, isSample } = props;
  const w = useWorker(() => new Worker(new URL('../workers/mc.worker.ts', import.meta.url), { type: 'module' }));
  const [source, setSource] = useState<'iso' | 'brain'>('iso');
  const [iso, setIso] = useState(60);
  const dIso = useDebounced(iso, 250);
  const [mesh, setMesh] = useState<MeshData | null>(null);
  const [tri, setTri] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const small = useMemo(() => (vol.nx * vol.ny * vol.nz > 2.5e6 ? downsample2(vol) : vol), [vol]);
  const src = isSample ? source : 'iso';

  useEffect(() => {
    let alive = true;
    setBusy(true);
    if (src === 'brain') {
      loadBrainMesh().then(
        (m) => {
          if (!alive) return;
          setMesh(m);
          setTri(m.index!.length / 3);
          setBusy(false);
        },
        (e) => setErr(String(e.message)),
      );
    } else {
      const data = small.data.slice();
      w.call<Mesh>('surface', { data, nx: small.nx, ny: small.ny, nz: small.nz, iso: dIso, spacing: [small.sx, small.sy, small.sz] }, undefined, [data.buffer]).then(
        (m) => {
          if (!alive) return;
          const cx = (small.nx * small.sx) / 2;
          const cy = (small.ny * small.sy) / 2;
          const cz = (small.nz * small.sz) / 2;
          const n = m.positions.length / 3;
          const positions = new Float32Array(n * 3);
          const normals = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            positions[i * 3] = m.positions[i * 3] - cx;
            positions[i * 3 + 1] = m.positions[i * 3 + 2] - cz;
            positions[i * 3 + 2] = -(m.positions[i * 3 + 1] - cy);
            normals[i * 3] = m.normals[i * 3];
            normals[i * 3 + 1] = m.normals[i * 3 + 2];
            normals[i * 3 + 2] = -m.normals[i * 3 + 1];
          }
          setMesh({ positions, normals, color: 0xd9b8a6 });
          setTri(m.triangles);
          setBusy(false);
        },
        (e) => {
          setErr(String(e.message));
          setBusy(false);
        },
      );
    }
    return () => {
      alive = false;
    };
  }, [src, dIso, small, w]);

  const meshes = useMemo(() => (mesh ? [mesh] : []), [mesh]);
  const radius = Math.max(small.nx * small.sx, small.ny * small.sy, small.nz * small.sz) * 0.6;

  return (
    <Panel title="3D surface">
      <div className="mb-3 flex flex-wrap items-end gap-4">
        {isSample && (
          <div className="w-64">
            <Select
              label="Surface"
              value={source}
              onChange={setSource}
              options={[
                { value: 'iso', label: 'Iso-surface (marching cubes)' },
                { value: 'brain', label: 'Segmented brain (BrainAware mesh)' },
              ]}
            />
          </div>
        )}
        {src === 'iso' && (
          <div className="w-64">
            <Slider label="Iso value (0–255)" value={iso} min={5} max={250} onChange={setIso} />
          </div>
        )}
        <Stat label="Triangles" value={tri.toLocaleString()} />
        <Status busy={busy} error={err} />
      </div>
      <Suspense fallback={<div className="h-[380px] rounded-md border border-line bg-black" />}>
        <Viewer3D meshes={meshes} radius={radius} label="3D surface rendering of the volume; drag to rotate, scroll to zoom" />
      </Suspense>
      <p className="mt-2 text-[13px] text-muted">
        Drag to rotate, scroll or pinch to zoom. A low iso value gives the skin surface; around 100–140 the brain tissue appears.
        {small !== vol && ' The volume is averaged 2×2×2 before marching cubes to keep it fast.'}
      </p>
    </Panel>
  );
}
