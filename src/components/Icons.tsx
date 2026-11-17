type P = { className?: string };
const base = (className?: string) => ({ className: className ?? 'h-4 w-4', 'aria-hidden': true as const, focusable: 'false' as const });

export function GitHubIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(className)}>
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.85 10.96.57.11.78-.25.78-.56v-2.1c-3.2.7-3.88-1.54-3.88-1.54-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.97.1-.75.4-1.27.73-1.56-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.3 1.2-3.11-.12-.3-.52-1.52.12-3.16 0 0 .98-.31 3.2 1.19a11.1 11.1 0 0 1 2.92-.4c.99 0 2 .13 2.92.4 2.22-1.5 3.2-1.19 3.2-1.19.64 1.64.24 2.86.12 3.16.75.81 1.2 1.85 1.2 3.11 0 4.42-2.7 5.39-5.26 5.67.42.36.8 1.08.8 2.17v3.22c0 .31.21.67.79.56A10.52 10.52 0 0 0 23.5 12C23.5 5.74 18.27.5 12 .5z" />
    </svg>
  );
}

export function ArrowUpRight({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...base(className ?? 'h-3.5 w-3.5')}>
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

export function ArrowLeft({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...base(className ?? 'h-3.5 w-3.5')}>
      <path d="M13 8H3M7 4 3 8l4 4" />
    </svg>
  );
}

export function SunIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" {...base(className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function MoonIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...base(className)}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
    </svg>
  );
}

export function UploadIcon({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...base(className ?? 'h-3.5 w-3.5')}>
      <path d="M8 10V2M5 5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function PlayIcon({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...base(className ?? 'h-3.5 w-3.5')}>
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  );
}

export function PauseIcon({ className }: P) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...base(className ?? 'h-3.5 w-3.5')}>
      <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" />
    </svg>
  );
}
