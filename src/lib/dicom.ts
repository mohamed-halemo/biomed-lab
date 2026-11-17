// DICOM reading (uncompressed transfer syntaxes) on top of dicom-parser.
import * as dicomParser from 'dicom-parser';

export interface DicomImage {
  rows: number;
  cols: number;
  /** stored values after rescale slope/intercept, row-major (gray) or interleaved RGB */
  pixels: Float32Array;
  samplesPerPixel: number;
  bitsAllocated: number;
  bitsStored: number;
  signed: boolean;
  photometric: string;
  windowCenter?: number;
  windowWidth?: number;
  position?: number[];
  pixelSpacing?: number[];
  sliceThickness?: number;
  instanceNumber?: number;
  transferSyntax: string;
  tags: { tag: string; name: string; vr: string; value: string }[];
  info: Record<string, string>;
}

const NAMES: Record<string, string> = {
  x00020010: 'Transfer Syntax UID',
  x00080016: 'SOP Class UID',
  x00080018: 'SOP Instance UID',
  x00080020: 'Study Date',
  x00080021: 'Series Date',
  x00080030: 'Study Time',
  x00080060: 'Modality',
  x00080070: 'Manufacturer',
  x00080080: 'Institution Name',
  x00081030: 'Study Description',
  x0008103e: 'Series Description',
  x00081090: "Manufacturer's Model Name",
  x00100010: "Patient's Name",
  x00100020: 'Patient ID',
  x00100030: "Patient's Birth Date",
  x00100040: "Patient's Sex",
  x00101010: "Patient's Age",
  x00180015: 'Body Part Examined',
  x00180050: 'Slice Thickness',
  x00180060: 'KVP',
  x00180080: 'Repetition Time',
  x00180081: 'Echo Time',
  x00180087: 'Magnetic Field Strength',
  x00181020: 'Software Versions',
  x00181150: 'Exposure Time',
  x00181151: 'X-Ray Tube Current',
  x00185100: 'Patient Position',
  x0020000d: 'Study Instance UID',
  x0020000e: 'Series Instance UID',
  x00200011: 'Series Number',
  x00200013: 'Instance Number',
  x00200032: 'Image Position (Patient)',
  x00200037: 'Image Orientation (Patient)',
  x00201041: 'Slice Location',
  x00280002: 'Samples per Pixel',
  x00280004: 'Photometric Interpretation',
  x00280010: 'Rows',
  x00280011: 'Columns',
  x00280030: 'Pixel Spacing',
  x00280100: 'Bits Allocated',
  x00280101: 'Bits Stored',
  x00280102: 'High Bit',
  x00280103: 'Pixel Representation',
  x00281050: 'Window Center',
  x00281051: 'Window Width',
  x00281052: 'Rescale Intercept',
  x00281053: 'Rescale Slope',
  x7fe00010: 'Pixel Data',
};

const TEXT_VR = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UI', 'UT']);

function num(ds: dicomParser.DataSet, tag: string, i = 0): number | undefined {
  const s = ds.string(tag);
  if (s === undefined) return undefined;
  const v = parseFloat(s.split('\\')[i]);
  return Number.isFinite(v) ? v : undefined;
}

function nums(ds: dicomParser.DataSet, tag: string): number[] | undefined {
  const s = ds.string(tag);
  if (!s) return undefined;
  const v = s.split('\\').map(Number);
  return v.every(Number.isFinite) ? v : undefined;
}

export function looksLikeDicom(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 132) return false;
  const b = new Uint8Array(buf, 128, 4);
  return String.fromCharCode(...b) === 'DICM';
}

export function parseDicom(buf: ArrayBuffer): DicomImage {
  const bytes = new Uint8Array(buf);
  const ds = dicomParser.parseDicom(bytes);
  const ts = ds.string('x00020010') ?? '1.2.840.10008.1.2';
  const rows = ds.uint16('x00280010') ?? 0;
  const cols = ds.uint16('x00280011') ?? 0;
  const spp = ds.uint16('x00280002') ?? 1;
  const ba = ds.uint16('x00280100') ?? 16;
  const bs = ds.uint16('x00280101') ?? ba;
  const signed = (ds.uint16('x00280103') ?? 0) === 1;
  const photometric = (ds.string('x00280004') ?? 'MONOCHROME2').trim();
  const slope = num(ds, 'x00281053') ?? 1;
  const intercept = num(ds, 'x00281052') ?? 0;
  const el = ds.elements['x7fe00010'];
  if (!el || !rows || !cols) throw new Error('No image data in this DICOM file');
  if (el.encapsulatedPixelData || /^1\.2\.840\.10008\.1\.2\.4|^1\.2\.840\.10008\.1\.2\.5/.test(ts)) {
    throw new Error('Compressed DICOM (JPEG/RLE) is not supported here; please use an uncompressed file');
  }
  const n = rows * cols * spp;
  const pixels = new Float32Array(n);
  const off = el.dataOffset;
  const bigEndian = ts === '1.2.840.10008.1.2.2';
  const dv = new DataView(buf, off, Math.min(el.length, buf.byteLength - off));
  for (let i = 0; i < n; i++) {
    let v: number;
    if (ba === 8) v = signed ? dv.getInt8(i) : dv.getUint8(i);
    else if (ba === 16) {
      v = signed ? dv.getInt16(i * 2, !bigEndian) : dv.getUint16(i * 2, !bigEndian);
      if (bs < 16 && !signed) v &= (1 << bs) - 1;
      else if (bs < 16 && signed) {
        // sign-extend from bitsStored
        const m = 1 << (bs - 1);
        const raw = v & ((1 << bs) - 1);
        v = (raw ^ m) - m;
      }
    } else if (ba === 32) v = signed ? dv.getInt32(i * 4, !bigEndian) : dv.getUint32(i * 4, !bigEndian);
    else throw new Error(`Unsupported Bits Allocated: ${ba}`);
    pixels[i] = v * slope + intercept;
  }
  if (photometric === 'MONOCHROME1') {
    let mx = -Infinity;
    let mn = Infinity;
    for (const v of pixels) {
      if (v > mx) mx = v;
      if (v < mn) mn = v;
    }
    for (let i = 0; i < n; i++) pixels[i] = mx + mn - pixels[i];
  }
  const tags: DicomImage['tags'] = [];
  for (const key of Object.keys(ds.elements).sort()) {
    const e = ds.elements[key];
    const vr = e.vr ?? '';
    let value = '';
    if (key === 'x7fe00010') value = `${e.length} bytes`;
    else if (e.items) value = `sequence (${e.items.length} items)`;
    else if (TEXT_VR.has(vr) || (!vr && e.length < 128)) value = ds.string(key) ?? '';
    else if (vr === 'US') value = String(ds.uint16(key));
    else if (vr === 'UL') value = String(ds.uint32(key));
    else if (vr === 'SS') value = String(ds.int16(key));
    else if (vr === 'FD') value = String(ds.double(key));
    else if (vr === 'FL') value = String(ds.float(key));
    else value = `${e.length} bytes`;
    if (value.length > 120) value = value.slice(0, 117) + '...';
    const t = key.slice(1).toUpperCase();
    tags.push({ tag: `(${t.slice(0, 4)},${t.slice(4)})`, name: NAMES[key] ?? '', vr, value });
  }
  const na = 'not available';
  const info: Record<string, string> = {
    Name: ds.string('x00100010') || na,
    Age: ds.string('x00101010') || na,
    Modality: ds.string('x00080060') || na,
    'Body part': ds.string('x00180015') || na,
  };
  return {
    rows,
    cols,
    pixels,
    samplesPerPixel: spp,
    bitsAllocated: ba,
    bitsStored: bs,
    signed,
    photometric,
    windowCenter: num(ds, 'x00281050'),
    windowWidth: num(ds, 'x00281051'),
    position: nums(ds, 'x00200032'),
    pixelSpacing: nums(ds, 'x00280030'),
    sliceThickness: num(ds, 'x00180050'),
    instanceNumber: num(ds, 'x00200013'),
    transferSyntax: ts,
    tags,
    info,
  };
}
