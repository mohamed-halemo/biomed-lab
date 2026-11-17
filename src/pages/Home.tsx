import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { asset, GROUPS, TOOLS } from '../tools';

export default function Home() {
  useEffect(() => {
    document.title = 'BioMed Lab';
  }, []);
  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl tracking-tight text-fg sm:text-5xl">BioMed Lab</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted">Interactive biomedical imaging, signal and bioinformatics tools that run in your browser.</p>
        <p className="mt-2 text-sm leading-relaxed text-subtle">
          These started as desktop apps (PyQt, C++, Bokeh) I wrote during my biomedical engineering degree. Each one is ported here with the same algorithms, loads open sample data, and processes your own files locally. Nothing is uploaded anywhere.
        </p>
      </header>
      {GROUPS.map((g) => (
        <section key={g} aria-labelledby={`g-${g}`} className="mt-10">
          <h2 id={`g-${g}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">
            {g}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <li key={t.id}>
                <Link to={`/${t.id}`} className="group flex h-full gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent">
                  <span className="relative block aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md border border-line bg-surface sm:w-28">
                    <img src={asset(`thumbs/${t.id}.webp`)} alt="" width={224} height={168} loading="lazy" className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium leading-snug text-fg group-hover:text-accent">{t.title}</span>
                    <span className="mt-1 block text-[13px] leading-snug text-muted">{t.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
