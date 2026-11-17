# BioMed Lab

Interactive biomedical imaging, signal and bioinformatics tools that run in your browser.

**Live:** https://mohamed-halemo.github.io/biomed-lab/

These are my old desktop apps (PyQt, C++, Bokeh) from my biomedical engineering degree, ported to the web with the same algorithms. Every tool opens with open sample data and also takes your own files. Everything runs client-side (heavy work in Web Workers); nothing is uploaded and there is no tracking.

## Tools

**Imaging**

- Image & DICOM inspector: size, bit depth, channels and DICOM header tags, with window/level. ([Task1](https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch))
- Zoom & interpolation: nearest neighbour vs bilinear, side by side. ([Task2](https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch))
- Histogram equalization: CDF mapping with before/after histograms. ([Task3](https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch))
- Filters, noise & denoising: unsharp mask, Gaussian/uniform/salt & pepper noise, ROI noise stats, mean and median filters. ([Task4, Task7](https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch))
- Fourier explorer: magnitude/phase, low-pass and high-pass in the frequency domain, spatial vs frequency blur. ([Task5, Task6](https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch))
- Image mixer: magnitude of one image with the phase of another, with weights. ([Images mixer](https://github.com/mohamed-halemo/Digital-Signal-Processing-Projects))
- CT reconstruction: Shepp-Logan phantom, sinogram, (filtered) back-projection, angle slider and animation. ([Task8](https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch))
- Colour maps: local-variance pseudo-colouring of an ultrasound region. ([Task9](https://github.com/mohamed-halemo/Image-processing-Tools-from-scratch))
- MRI 3-plane viewer + 3D: linked axial/sagittal/coronal views, cine, NIfTI/DICOM series upload, marching-cubes surface. ([MRI-planes-viewer](https://github.com/mohamed-halemo/MRI-planes-viewer), [Medical-images-rendering-VTK](https://github.com/mohamed-halemo/Medical-images-rendering-VTK))
- Exudate detection: classic exudate candidate segmentation on fundus photos. ([Exudate-based-detection-in-fundus-images](https://github.com/mohamed-halemo/Exudate-based-detection-in-fundus-images))

**Signals**

- ECG signal viewer: scrolling viewer, 10-band equalizer, spectrogram, resampling with aliasing and reconstruction. ([Signal Viewer app](https://github.com/mohamed-halemo/Digital-Signal-Processing-Projects))
- FFT explorer: recursive radix-2 FFT vs O(N²) DFT, timed. ([Fourier transform and fft](https://github.com/mohamed-halemo/Digital-Signal-Processing-Projects))
- Z-transform filter designer: drag poles and zeros, magnitude/phase response, all-pass sections, filter a signal. ([Z-transform](https://github.com/mohamed-halemo/Digital-Signal-Processing-Projects))
- Audio fingerprinting: mel/MFCC/chroma features, perceptual hashes, ranked matches for a noisy clip or a mix of two songs. ([Shazam Like app](https://github.com/mohamed-halemo/Digital-Signal-Processing-Projects))

**Bio**

- Sequence alignment: Needleman-Wunsch and Smith-Waterman with an animated DP matrix and traceback, plus multiple alignment with the app's metrics. ([Alignment_app](https://github.com/mohamed-halemo/Alignment_app))

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/biomed-lab/
npm test           # algorithm unit tests (vitest)
npm run lint
npm run build      # static site in dist/
```

Vite + React + TypeScript + Tailwind. Routes use hash URLs so deep links work on GitHub Pages.

## Data credits

- MRI: [IXI dataset](https://brain-development.org/ixi-dataset/), subject IXI002 T1, CC BY-SA 3.0 (derived volume and mesh shared under the same licence).
- DICOM: CT_small.dcm and MR_small.dcm from [pydicom](https://github.com/pydicom/pydicom) test files, MIT.
- Chest X-ray: Mikael Häggström, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Normal_posteroanterior_(PA)_chest_radiograph_(X-ray).jpg), CC0.
- Ultrasound: Wolfgang Moroder, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:CRL_Crown_rump_length_12_weeks_ecografia_Dr._Wolfgang_Moroder.jpg), CC BY-SA 3.0 (cropped, grayscale).
- Fundus: Hao et al., PLoS ONE 2022, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fundus_-_diabetic_retinopathy.png), CC BY 4.0; and National Eye Institute, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Diabetic_macular_edema-NEI.jpg), public domain.
- ECG: [MIT-BIH Arrhythmia Database](https://physionet.org/content/mitdb/1.0.0/) record 100 (Moody & Mark 2001; Goldberger et al. 2000, PhysioNet), ODC Attribution 1.0.
- Song library, phantoms and alignment sequences are generated in code.

Full list on the site's Credits page.

## License

Code: MIT, see [LICENSE](LICENSE). Sample data keeps the licences above.
