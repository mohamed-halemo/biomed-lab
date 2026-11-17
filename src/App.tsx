import { lazy, Suspense, type ComponentType } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';

const Credits = lazy(() => import('./pages/Credits'));

const pages: Record<string, ComponentType> = {
  inspector: lazy(() => import('./tools/Inspector')),
  zoom: lazy(() => import('./tools/Zoom')),
  equalization: lazy(() => import('./tools/Equalization')),
  filters: lazy(() => import('./tools/Filters')),
  fourier: lazy(() => import('./tools/Fourier')),
  mixer: lazy(() => import('./tools/Mixer')),
  ct: lazy(() => import('./tools/CT')),
  colormap: lazy(() => import('./tools/Colormap')),
  mri: lazy(() => import('./tools/MRI')),
  exudates: lazy(() => import('./tools/Exudates')),
  ecg: lazy(() => import('./tools/ECG')),
  fft: lazy(() => import('./tools/FFTLab')),
  ztransform: lazy(() => import('./tools/ZTransform')),
  fingerprint: lazy(() => import('./tools/Fingerprint')),
  alignment: lazy(() => import('./tools/Alignment')),
};

function NotFound() {
  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-3xl text-fg">Not found</h1>
      <p className="mt-3 text-muted">
        That page does not exist.{' '}
        <Link to="/" className="text-accent hover:underline">
          Back to all tools
        </Link>
      </p>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<p className="text-sm text-subtle">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/credits" element={<Credits />} />
            {Object.entries(pages).map(([id, C]) => (
              <Route key={id} path={`/${id}`} element={<C />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}
