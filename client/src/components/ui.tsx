// Shared UI primitives in the Group J design language: lime page, cream rounded cards,
// deep-green primary actions, pill chips. Every screen should build from these.
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from '../lib/cx';

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag
      className={cx(
        'rounded-3xl border border-outline-variant/60 bg-surface p-5 shadow-sm',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-brand-600 shadow-sm',
  outline: 'border border-outline-variant bg-surface text-on-surface hover:bg-surface-variant',
  ghost: 'text-primary hover:bg-primary-container/60',
  danger: 'border border-error/40 bg-surface text-error hover:bg-error-container',
};

export function Button({
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cx(
        'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-semibold transition-colors disabled:opacity-60',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

const FIELD =
  'w-full rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface placeholder:text-outline outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD, className)} {...props} />;
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD, 'resize-y', className)} {...props} />;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return (
    <p role="alert" className="min-h-6 text-sm font-medium text-error">
      {children}
    </p>
  );
}

/** Neutral pill. Use StatusPill (components/tickets) for ticket statuses. */
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full bg-surface-variant px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small uppercase label above a section ("STEP 1 OF 3", "INCIDENT LOCATION *"). */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cx('text-xs font-bold tracking-wide text-on-surface-variant uppercase', className)}
    >
      {children}
    </p>
  );
}

/** Tinted callout: tips, warnings and notices. */
export function Notice({
  tone = 'info',
  icon,
  children,
  className = '',
}: {
  tone?: 'info' | 'tip' | 'warning' | 'success';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'bg-surface-variant/70 text-on-surface-variant',
    tip: 'bg-primary text-on-primary',
    warning: 'bg-error-container text-on-error-container',
    success: 'bg-success-container text-on-success-container',
  };
  return (
    <div className={cx('flex gap-3 rounded-2xl px-4 py-3 text-sm', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Thin segmented progress bar for multi-step flows. */
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div
      className="flex gap-1.5"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-label={`Step ${step} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx('h-1.5 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-surface')}
        />
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-4 text-sm text-on-surface-variant" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}
    </p>
  );
}

/** KPI tile from the desktop design's top row: label, big number, optional icon and hint. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'default',
  active = false,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'alert' | 'good';
  active?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    default: 'text-primary',
    alert: 'text-tertiary',
    good: 'text-on-success-container',
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">{label}</p>
        {icon && (
          <span
            className={cx(
              'grid h-8 w-8 place-items-center rounded-xl bg-surface-variant',
              tones[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={cx('mt-1 text-3xl font-extrabold', tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
    </>
  );
  const classes = cx(
    'block w-full rounded-3xl border-2 bg-surface p-4 text-left shadow-sm transition',
    active ? 'border-primary' : 'border-transparent',
    onClick && 'hover:border-outline-variant',
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={classes}>
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  );
}
