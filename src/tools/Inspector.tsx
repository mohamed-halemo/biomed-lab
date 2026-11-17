import { useEffect, useMemo, useState } from 'react';
import ToolPage from '../components/ToolPage';
import { FileButton, Panel, Select, Slider, Stat, Status } from '../components/Controls';
import { ImageView } from '../components/ImageView';
import { asset } from '../tools';
import { type DicomImage, looksLikeDicom, parseDicom } from '../lib/dicom';
import { fetchArrayBuffer, formatBytes, loadImageFromBlob } from '../lib/load';
import { type Gray, minMax } from '../lib/image';

const SAMPLES = [
  { value: 'samples/CT_small.dcm', label: 'CT_small.dcm (pydicom, MIT)' },
  { value: 'samples/MR_small.dcm', label: 'MR_small.dcm (pydicom, MIT)' },
  { value: 'samples/chest-xray.jpg', label: 'Chest X-ray JPEG (CC0)' },
  { value: 'samples/mri-axial.png', label: 'Brain MRI PNG (IXI, CC BY-SA)' },
];

interface Info {
  name: string;
  bytes: number;
  kind: 'dicom' | 'image';
  gray: Gray | null;
  rgba: ImageData | null;
  dicom: DicomImage | null;
  width: number;
  height: number;
  depth: string;
  channels: string;
  format: string;
}

function pngBitDepth(b: Uint8Array): number | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return b[24];
  return null;
}

async function inspect(buf: ArrayBuffer, name: string): Promise<Info> {
  if (looksLikeDicom(buf) || /\.dcm$/i.test(name)) {
    const d = parseDicom(buf);
    const gray: Gray | null = d.samplesPerPixel === 1 ? { w: d.cols, h: d.rows, data: d.pixels } : null;
    let rgba: ImageData | null = null;
    if (!gray) {
      rgba = new ImageData(d.cols, d.rows);
      const [lo, hi] = minMax(d.pixels);
      for (let i = 0; i < d.rows * d.cols; i++) {
        for (let c = 0; c < 3; c++) rgba.data[i * 4 + c] = ((d.pixels[i * 3 + c] - lo) / (hi - lo || 1)) * 255;
        rgba.data[i * 4 + 3] = 255;
      }
    }
    return {
      name,
      bytes: buf.byteLength,
      kind: 'dicom',
      gray,
      rgba,
      dicom: d,
      width: d.cols,
      height: d.rows,
      depth: `${d.bitsStored} bits stored (${d.bitsAllocated} allocated)`,
      channels: d.samplesPerPixel === 1 ? `Gray (${d.photometric})` : `${d.samplesPerPixel} (${d.photometric})`,
      format: 'DICOM',
    };
  }
  const bytes = new Uint8Array(buf);
  const l = await loadImageFromBlob(new Blob([buf]));
  let gray = true;
  const px = l.rgba.data;
  let alpha = false;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] !== px[i + 1] || px[i] !== px[i + 2]) gray = false;
    if (px[i + 3] !== 255) alpha = true;
    if (!gray && alpha) break;
  }
  const bd = pngBitDepth(bytes) ?? 8;
  const fmt = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'JPEG' : pngBitDepth(bytes) !== null ? 'PNG' : bytes[0] === 0x42 && bytes[1] === 0x4d ? 'BMP' : 'Image';
  const ch = gray ? 1 : 3;
  return {
    name,
    bytes: buf.byteLength,
    kind: 'image',
    gray: null,
    rgba: l.rgba,
    dicom: null,
    width: l.rgba.width,
    height: l.rgba.height,
    depth: `${bd * (ch + (alpha ? 1 : 0))} bits per pixel (${bd} per channel)`,
    channels: gray ? (alpha ? 'Gray + alpha' : 'Gray') : alpha ? 'RGBA' : 'RGB',
    format: fmt,
  };
}

export default function Inspector() {
  const [src, setSrc] = useState(SAMPLES[0].value);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wl, setWl] = useState<[number, number] | null>(null);
  const [filter, setFilter] = useState('');
  const [hover, setHover] = useState<{ x: number; y: number; v: string } | null>(null);

  const open = async (buf: ArrayBuffer, name: string) => {
    try {
      const r = await inspect(buf, name);
      setInfo(r);
      setError(null);
      setHover(null);
      if (r.gray) {
        const d = r.dicom!;
        if (d.windowCenter !== undefined && d.windowWidth) setWl([d.windowCenter, d.windowWidth]);
        else {
          const [lo, hi] = minMax(r.gray.data);
          setWl([(lo + hi) / 2, hi - lo || 1]);
        }
      } else setWl(null);
    } catch (e) {
      setError(`Could not open ${name}: ${e instanceof Error ? e.message : e}`);
    }
  };

  useEffect(() => {
    if (src === 'upload') return;
    let alive = true;
    fetchArrayBuffer(asset(src)).then(
      (b) => {
        if (alive) open(b, src.split('/').pop()!);
      },
      (e) => setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, [src]);

  const range = useMemo<[number, number] | undefined>(() => (wl ? [wl[0] - wl[1] / 2, wl[0] + wl[1] / 2] : undefined), [wl]);
  const [lo, hi] = useMemo(() => (info?.gray ? minMax(info.gray.data) : [0, 255]), [info]);
  const tags = useMemo(() => {
    const t = info?.dicom?.tags ?? [];
    const f = filter.trim().toLowerCase();
    return f ? t.filter((x) => (x.tag + x.name + x.value).toLowerCase().includes(f)) : t;
  }, [info, filter]);

  const options = [...SAMPLES];
  if (src === 'upload' && info) options.push({ value: 'upload', label: info.name });

  return (
    <ToolPage
      id="inspector"
      intro={
        <p>
          Opens an image or a DICOM file and reports what the original Task 1 app showed: patient name, age, modality and body part from the DICOM header, plus width, height, bit depth, colour channels and the file size in bits. DICOM pixels are shown after rescale slope/intercept with an adjustable window.
        </p>
      }
      toolbar={
        <>
          <div className="w-72 max-w-full">
            <Select label="File" value={src} options={options} onChange={setSrc} />
          </div>
          <FileButton
            accept="image/*,.dcm,application/dicom"
            onFiles={async (f) => {
              setSrc('upload');
              await open(await f[0].arrayBuffer(), f[0].name);
            }}
          />
        </>
      }
    >
      <Status error={error} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Image">
          <ImageView
            image={info ? (info.gray ?? info.rgba) : null}
            range={range}
            label={`Preview of ${info?.name ?? 'file'}`}
            pixelated={!!info && info.width < 300}
            maxHeight="70vh"
            onPointer={(p) => {
              if (!info) return;
              const x = Math.floor(p.x);
              const y = Math.floor(p.y);
              if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
              const i = y * info.width + x;
              const v = info.gray ? info.gray.data[i].toFixed(0) : info.rgba ? `${info.rgba.data[i * 4]}, ${info.rgba.data[i * 4 + 1]}, ${info.rgba.data[i * 4 + 2]}` : '';
              setHover({ x, y, v });
            }}
            caption={hover ? `Pixel (${hover.x}, ${hover.y}) = ${hover.v}` : 'Click or drag on the image to read pixel values.'}
          />
          {info?.gray && wl && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Slider label="Window centre" value={Math.round(wl[0])} min={Math.floor(lo)} max={Math.ceil(hi)} onChange={(v) => setWl([v, wl[1]])} />
              <Slider label="Window width" value={Math.round(wl[1])} min={1} max={Math.max(2, Math.ceil(hi - lo) * 2)} onChange={(v) => setWl([wl[0], v])} />
            </div>
          )}
        </Panel>
        <div className="grid min-w-0 content-start gap-4">
          <Panel title="Information">
            {info && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {info.dicom && Object.entries(info.dicom.info).map(([k, v]) => <Stat key={k} label={k} value={v} />)}
                <Stat label="Format" value={info.format} />
                <Stat label="Width" value={`${info.width} px`} />
                <Stat label="Height" value={`${info.height} px`} />
                <Stat label="Bit depth" value={info.depth} />
                <Stat label="Colours" value={info.channels} />
                <Stat label="File size" value={`${(info.bytes * 8).toLocaleString()} bits (${formatBytes(info.bytes)})`} />
                {info.dicom?.pixelSpacing && <Stat label="Pixel spacing" value={`${info.dicom.pixelSpacing.map((v) => v.toFixed(3)).join(' × ')} mm`} />}
                {info.gray && <Stat label="Value range" value={`${lo.toFixed(0)} … ${hi.toFixed(0)}`} />}
              </dl>
            )}
          </Panel>
          {info?.dicom && (
            <Panel title={`DICOM header (${info.dicom.tags.length} elements)`}>
              <label className="label mb-1 block" htmlFor="tagfilter">
                Filter
              </label>
              <input id="tagfilter" className="field mb-2" placeholder="e.g. 0028 or Modality" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="max-h-80 overflow-auto rounded-md border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Tag</th>
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">VR</th>
                      <th className="px-2 py-1.5 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {tags.map((t) => (
                      <tr key={t.tag} className="border-t border-line align-top">
                        <td className="whitespace-nowrap px-2 py-1 text-subtle">{t.tag}</td>
                        <td className="px-2 py-1 font-sans text-fg">{t.name}</td>
                        <td className="px-2 py-1 text-subtle">{t.vr}</td>
                        <td className="break-all px-2 py-1 text-fg">{t.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </ToolPage>
  );
}
