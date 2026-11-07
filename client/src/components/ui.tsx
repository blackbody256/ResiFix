// Tiny shared UI primitives. Grow this into a component library as screens need it.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </section>
  );
}

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950"
      {...props}
    />
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return (
    <p role="alert" className="min-h-6 text-sm text-red-700 dark:text-red-400">
      {children}
    </p>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700">
      {children}
    </span>
  );
}
