import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from './Icons';
import { tool } from '../tools';

export default function ToolPage(props: { id: string; children: ReactNode; intro: ReactNode; toolbar?: ReactNode }) {
  const t = tool(props.id);
  useEffect(() => {
    document.title = `${t.title} · BioMed Lab`;
    return () => {
      document.title = 'BioMed Lab';
    };
  }, [t.title]);
  return (
    <article>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft /> All tools
      </Link>
      <header className="mt-4 mb-6 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{t.group}</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-fg sm:text-4xl">{t.title}</h1>
        <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted">{props.intro}</div>
        <a href={t.repo} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          Original project <ArrowUpRight />
          <span className="sr-only">({t.repoLabel}, opens GitHub)</span>
        </a>
      </header>
      {props.toolbar && <div className="mb-4 flex flex-wrap items-end gap-3">{props.toolbar}</div>}
      {props.children}
    </article>
  );
}
