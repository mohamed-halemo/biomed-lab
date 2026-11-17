import { useCallback, useEffect, useState } from 'react';
import { asset } from '../tools';
import { type Gray, normalize255 } from '../lib/image';
import { fetchArrayBuffer, fetchBlob, loadImageFromBlob } from '../lib/load';
import { looksLikeDicom, parseDicom } from '../lib/dicom';
import { FileButton, Select } from './Controls';

export interface SampleImage {
  id: string;
  label: string;
  file: string;
}

export const SAMPLES: Record<string, SampleImage> = {
  xray: { id: 'xray', label: 'Chest X-ray (CC0)', file: 'samples/chest-xray.jpg' },
  mri: { id: 'mri', label: 'Brain MRI slice (IXI, CC BY-SA)', file: 'samples/mri-axial.png' },
  ct: { id: 'ct', label: 'CT_small.dcm (pydicom, MIT)', file: 'samples/CT_small.dcm' },
  us: { id: 'us', label: 'Fetal ultrasound (CC BY-SA)', file: 'samples/ultrasound.jpg' },
};

export interface ImageState {
  name: string;
  gray: Gray;
  rgba: ImageData | null;
}

async function decode(buf: ArrayBuffer | Blob, name: string, maxSide: number): Promise<ImageState> {
  const ab = buf instanceof Blob ? await buf.arrayBuffer() : buf;
  if (looksLikeDicom(ab) || /\.dcm$/i.test(name)) {
    const d = parseDicom(ab);
    let px = d.pixels;
    if (d.samplesPerPixel === 3) {
      const g = new Float32Array(d.rows * d.cols);
      for (let i = 0; i < g.length; i++) g[i] = 0.299 * px[i * 3] + 0.587 * px[i * 3 + 1] + 0.114 * px[i * 3 + 2];
      px = g;
    }
    // DICOM -> 0..255 by min/max, as in the original apps
    const gray: Gray = { w: d.cols, h: d.rows, data: normalize255(px) };
    return { name, gray, rgba: null };
  }
  const l = await loadImageFromBlob(buf instanceof Blob ? buf : new Blob([ab]), maxSide);
  return { name, gray: l.gray, rgba: l.rgba };
}

/** Loads a default sample and lets the user swap samples or upload an image/DICOM. */
export function useImageInput(defaultSample: string, maxSide = 512) {
  const [sample, setSample] = useState(defaultSample);
  const [img, setImg] = useState<ImageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (sample === 'upload') return;
    let alive = true;
    const s = SAMPLES[sample];
    (s.file.endsWith('.dcm') ? fetchArrayBuffer(asset(s.file)) : fetchBlob(asset(s.file)))
      .then((b) => decode(b, s.label, maxSide))
      .then((r) => {
        if (alive) {
          setImg(r);
          setError(null);
        }
      })
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [sample, maxSide]);
  const upload = useCallback(
    async (files: File[]) => {
      try {
        const r = await decode(files[0], files[0].name, maxSide);
        setSample('upload');
        setImg(r);
        setError(null);
      } catch (e) {
        setError(`Could not open ${files[0].name}: ${e instanceof Error ? e.message : e}`);
      }
    },
    [maxSide],
  );
  return { img, sample, setSample, upload, error };
}

export function ImagePicker(props: { state: ReturnType<typeof useImageInput>; samples: string[]; accept?: string }) {
  const { state } = props;
  const options = props.samples.map((k) => ({ value: k, label: SAMPLES[k].label }));
  if (state.sample === 'upload') options.push({ value: 'upload', label: state.img?.name ?? 'Your file' });
  return (
    <>
      <div className="w-64 max-w-full">
        <Select label="Image" value={state.sample} options={options} onChange={state.setSample} />
      </div>
      <FileButton accept={props.accept ?? 'image/*,.dcm,application/dicom'} onFiles={state.upload} />
    </>
  );
}
