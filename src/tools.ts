export type Group = 'Imaging' | 'Signals' | 'Bio';

export interface ToolMeta {
  id: string;
  title: string;
  group: Group;
  blurb: string;
  repo: string;
  repoLabel: string;
}

const IPT = 'https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch';
const DSP = 'https://github.com/mohamed-halemo/Digital-Signal-Processing-Projects';

export const TOOLS: ToolMeta[] = [
  { id: 'inspector', title: 'Image & DICOM inspector', group: 'Imaging', blurb: 'Open an image or DICOM file and read its size, bit depth and header tags.', repo: `${IPT}/tree/main/Task1-IMG-INFO`, repoLabel: 'Image-processing-Tools-from-scratch / Task1' },
  { id: 'zoom', title: 'Zoom & interpolation', group: 'Imaging', blurb: 'Nearest-neighbour and bilinear zoom side by side.', repo: `${IPT}/tree/main/Task2-ZOOM`, repoLabel: 'Image-processing-Tools-from-scratch / Task2' },
  { id: 'equalization', title: 'Histogram equalization', group: 'Imaging', blurb: 'Spread intensities with the CDF and compare the histograms.', repo: `${IPT}/tree/main/Task3-Equalization`, repoLabel: 'Image-processing-Tools-from-scratch / Task3' },
  { id: 'filters', title: 'Filters, noise & denoising', group: 'Imaging', blurb: 'Unsharp masking, synthetic noise, ROI statistics, mean and median filters.', repo: `${IPT}/tree/main/Task7-Noise`, repoLabel: 'Image-processing-Tools-from-scratch / Task4 + Task7' },
  { id: 'fourier', title: 'Fourier explorer', group: 'Imaging', blurb: 'Magnitude and phase of an image, low-pass and high-pass filtering in the frequency domain.', repo: `${IPT}/tree/main/Task%206-Fourier`, repoLabel: 'Image-processing-Tools-from-scratch / Task5 + Task6' },
  { id: 'mixer', title: 'Image mixer', group: 'Imaging', blurb: 'Rebuild an image from the magnitude of one picture and the phase of another.', repo: `${DSP}/tree/master/Images%20mixer`, repoLabel: 'Digital-Signal-Processing-Projects / Images mixer' },
  { id: 'ct', title: 'CT reconstruction', group: 'Imaging', blurb: 'Phantom to sinogram to (filtered) back-projection, one angle at a time.', repo: `${IPT}/tree/main/Task8-BackProjection`, repoLabel: 'Image-processing-Tools-from-scratch / Task8' },
  { id: 'colormap', title: 'Colour maps', group: 'Imaging', blurb: 'Pseudo-colour an ultrasound region by its local variance.', repo: `${IPT}/tree/main/Task9-Color%20map`, repoLabel: 'Image-processing-Tools-from-scratch / Task9' },
  { id: 'mri', title: 'MRI 3-plane viewer + 3D', group: 'Imaging', blurb: 'Axial, sagittal and coronal slices with linked crosshairs, cine and a 3D surface.', repo: 'https://github.com/mohamed-halemo/MRI-planes-viewer', repoLabel: 'MRI-planes-viewer + Medical-images-rendering-VTK' },
  { id: 'exudates', title: 'Exudate detection', group: 'Imaging', blurb: 'Classic exudate candidate segmentation on retinal fundus photos.', repo: 'https://github.com/mohamed-halemo/Exudate-based-detection-in-fundus-images', repoLabel: 'Exudate-based-detection-in-fundus-images' },
  { id: 'ecg', title: 'ECG signal viewer', group: 'Signals', blurb: 'Scroll an ECG, equalize bands, and resample it to see aliasing and reconstruction.', repo: `${DSP}/tree/master/Signal%20Viewer%20app`, repoLabel: 'Digital-Signal-Processing-Projects / Signal Viewer app' },
  { id: 'fft', title: 'FFT explorer', group: 'Signals', blurb: 'Recursive radix-2 FFT against the O(N²) DFT on a signal you build.', repo: `${DSP}/tree/master/Fourier%20transform%20and%20fft`, repoLabel: 'Digital-Signal-Processing-Projects / Fourier transform and fft' },
  { id: 'ztransform', title: 'Z-transform filter designer', group: 'Signals', blurb: 'Place poles and zeros, see the frequency response and filter a signal.', repo: `${DSP}/tree/master/Z-transform%20and%20plotting%20website`, repoLabel: 'Digital-Signal-Processing-Projects / Z-transform' },
  { id: 'fingerprint', title: 'Audio fingerprinting', group: 'Signals', blurb: 'Spectrogram features, perceptual hashes and a ranked match against a small library.', repo: `${DSP}/tree/master/Shazam%20Like%20app`, repoLabel: 'Digital-Signal-Processing-Projects / Shazam Like app' },
  { id: 'alignment', title: 'Sequence alignment', group: 'Bio', blurb: 'Needleman-Wunsch and Smith-Waterman with an animated DP matrix, plus multiple alignment.', repo: 'https://github.com/mohamed-halemo/Alignment_app', repoLabel: 'Alignment_app' },
];

export const GROUPS: Group[] = ['Imaging', 'Signals', 'Bio'];

export function tool(id: string): ToolMeta {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tool ${id}`);
  return t;
}

export const PORTFOLIO = 'https://mohamed-halemo-portfolio.vercel.app';
export const GITHUB = 'https://github.com/mohamed-halemo';
export const REPO = 'https://github.com/mohamed-halemo/biomed-lab';

export const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;
