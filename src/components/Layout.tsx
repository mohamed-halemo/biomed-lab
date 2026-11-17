import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, GitHubIcon, MoonIcon, SunIcon } from './Icons';
import { GITHUB, PORTFOLIO, REPO } from '../tools';

function currentTheme(): 'light' | 'dark' {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle() {
  const toggle = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // storage may be blocked; the toggle still works for this visit
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg"
    >
      <MoonIcon className="icon-moon h-[18px] w-[18px]" />
      <SunIcon className="icon-sun h-[18px] w-[18px]" />
    </button>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [loc.pathname]);
  const nav = ({ isActive }: { isActive: boolean }) => `rounded-md px-2 py-1 text-sm transition-colors ${isActive ? 'text-fg' : 'text-muted hover:text-fg'}`;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="font-serif text-lg tracking-tight text-fg">
            BioMed Lab
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink to="/" end className={nav}>
              Tools
            </NavLink>
            <NavLink to="/credits" className={nav}>
              Credits
            </NavLink>
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg" aria-label="Source on GitHub" title="Source on GitHub">
              <GitHubIcon className="h-[18px] w-[18px]" />
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <p>
            By{' '}
            <a href={PORTFOLIO} target="_blank" rel="noopener noreferrer" className="text-fg underline decoration-line underline-offset-4 transition-colors hover:text-accent hover:decoration-accent">
              Mohamed Hafez
            </a>
          </p>
          <div className="flex items-center gap-4">
            <Link to="/credits" className="transition-colors hover:text-fg">
              Data credits
            </Link>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-fg">
              GitHub <ArrowUpRight />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
