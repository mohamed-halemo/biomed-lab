import { useEffect } from 'react';
import { ArrowUpRight } from '../components/Icons';

const A = (p: { href: string; children: React.ReactNode }) => (
  <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
    {p.children}
  </a>
);

const DATA = [
  {
    what: 'Brain MRI volume and surface mesh (MRI viewer, mixer, zoom, equalization samples)',
    source: <>IXI dataset, subject IXI002 T1 (Guy's Hospital), from <A href="https://brain-development.org/ixi-dataset/">brain-development.org</A>. Registered to MNI space, rescaled to 8-bit and meshed with marching cubes for the BrainAware demo.</>,
    license: <A href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</A>,
    note: 'The derived files in samples/mri and samples/mri-axial.png are shared under the same licence.',
  },
  {
    what: 'CT_small.dcm, MR_small.dcm (DICOM inspector, MRI viewer)',
    source: <>Test files shipped with <A href="https://github.com/pydicom/pydicom">pydicom</A> (downsized from the NEMA WG04 sample images).</>,
    license: <A href="https://github.com/pydicom/pydicom/blob/main/LICENSE">MIT (pydicom licence)</A>,
  },
  {
    what: 'Chest X-ray (inspector, zoom, equalization, filters, Fourier, mixer)',
    source: <>&ldquo;Normal posteroanterior (PA) chest radiograph (X-ray)&rdquo; by Mikael Häggström, <A href="https://commons.wikimedia.org/wiki/File:Normal_posteroanterior_(PA)_chest_radiograph_(X-ray).jpg">Wikimedia Commons</A>. Resized and converted to grayscale.</>,
    license: <A href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</A>,
  },
  {
    what: 'Fetal ultrasound (colour maps)',
    source: <>&ldquo;CRL Crown rump length 12 weeks ecografia&rdquo; by Wolfgang Moroder, <A href="https://commons.wikimedia.org/wiki/File:CRL_Crown_rump_length_12_weeks_ecografia_Dr._Wolfgang_Moroder.jpg">Wikimedia Commons</A>. Cropped to the scan sector and converted to grayscale.</>,
    license: <A href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</A>,
    note: 'The cropped samples/ultrasound.jpg is shared under the same licence.',
  },
  {
    what: 'Fundus photo with hard exudates (exudate detection, default)',
    source: <>Hao S, Liu C, Li N, et al. &ldquo;Clinical evaluation of AI-assisted screening for diabetic retinopathy in rural areas of midwest China&rdquo;, PLoS ONE 2022, via <A href="https://commons.wikimedia.org/wiki/File:Fundus_-_diabetic_retinopathy.png">Wikimedia Commons</A>. Panel letter masked and resized.</>,
    license: <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>,
  },
  {
    what: 'Fundus photo with diabetic macular edema (exudate detection, second sample)',
    source: <>National Eye Institute, National Institutes of Health (ref. EDA10), via <A href="https://commons.wikimedia.org/wiki/File:Diabetic_macular_edema-NEI.jpg">Wikimedia Commons</A>.</>,
    license: <A href="https://commons.wikimedia.org/wiki/File:Diabetic_macular_edema-NEI.jpg">Public domain (US Government work)</A>,
  },
  {
    what: 'ECG (signal viewer, Z-transform filter input)',
    source: <>MIT-BIH Arrhythmia Database, record 100, first 10 s of leads MLII and V5. Moody GB, Mark RG. IEEE Eng Med Biol 2001;20(3):45-50. Goldberger AL et al., PhysioBank, PhysioToolkit and PhysioNet, Circulation 2000;101(23):e215-e220. <A href="https://physionet.org/content/mitdb/1.0.0/">physionet.org/content/mitdb/1.0.0</A></>,
    license: <A href="https://physionet.org/content/mitdb/view-license/1.0.0/">Open Data Commons Attribution v1.0</A>,
  },
  {
    what: 'Song library (audio fingerprinting)',
    source: 'Eight short tunes synthesized in the browser from code (melody, bass and drum patterns). No recordings are used.',
    license: 'Synthetic (MIT, part of this project)',
  },
  {
    what: 'Shepp-Logan phantom, noise phantom, sequences for alignment',
    source: 'Generated in code. The alignment examples are textbook toy sequences and a synthetic family of related sequences.',
    license: 'Synthetic (MIT, part of this project)',
  },
];

const LIBS = [
  ['React, React Router', 'MIT', 'https://react.dev'],
  ['three.js (3D surfaces) and its marching cubes tables', 'MIT', 'https://threejs.org'],
  ['dicom-parser', 'MIT', 'https://github.com/cornerstonejs/dicomParser'],
  ['Tailwind CSS, Vite', 'MIT', 'https://tailwindcss.com'],
  ['Geist, Geist Mono (Vercel) and Newsreader fonts', 'SIL Open Font License 1.1', 'https://fontsource.org'],
];

export default function Credits() {
  useEffect(() => {
    document.title = 'Credits · BioMed Lab';
  }, []);
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl tracking-tight text-fg sm:text-4xl">Credits</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Every sample file is openly licensed or generated in code. Thanks to the people and projects below. Uploaded files never leave your browser.
      </p>
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Sample data</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {DATA.map((d) => (
          <li key={d.what} className="py-4">
            <p className="text-[15px] font-medium text-fg">{d.what}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{d.source}</p>
            <p className="mt-1 text-sm text-muted">
              Licence: <span className="text-fg">{d.license}</span>
            </p>
            {d.note && <p className="mt-1 text-xs text-subtle">{d.note}</p>}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Libraries</h2>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        {LIBS.map(([n, l, h]) => (
          <li key={n}>
            <a href={h} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg hover:text-accent">
              {n} <ArrowUpRight />
            </a>{' '}
            · {l}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">Code</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Site code is MIT licensed. The exudate detector follows the method of L. Giancardo et al. (exudate-based diabetic macular edema detection, Medical Image Analysis 2012), as in the original Python port.
      </p>
    </div>
  );
}
