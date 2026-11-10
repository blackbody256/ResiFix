// Ticket building blocks: status pill and category icon tile.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/cx';
import {
  ago,
  categoryKind,
  placeLabel,
  STATUS,
  ticketRef,
  when,
  type CategoryKind,
  type TicketStatus,
  type TicketSummary,
} from '../lib/tickets';
import {
  BoltIcon,
  BugIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  DropIcon,
  KeyIcon,
  SofaIcon,
  WifiIcon,
  WrenchIcon,
} from './icons';

export function StatusPill({
  status,
  className = '',
}: {
  status: TicketStatus;
  className?: string;
}) {
  const meta = STATUS[status];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        meta?.pill ?? 'bg-surface-variant text-on-surface-variant',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {meta?.label ?? status}
    </span>
  );
}

const CATEGORY_ICON: Record<CategoryKind, ReactNode> = {
  electrical: <BoltIcon size={20} />,
  plumbing: <DropIcon size={20} />,
  doors: <KeyIcon size={20} />,
  furniture: <SofaIcon size={20} />,
  sanitation: <BugIcon size={20} />,
  internet: <WifiIcon size={20} />,
  other: <WrenchIcon size={20} />,
};

/** Rounded square with the category's icon (the design's category grid and ticket cards). */
export function CategoryTile({
  name,
  active = false,
  size = 'md',
  plain = false,
  className = '',
}: {
  name: string;
  active?: boolean;
  size?: 'sm' | 'md';
  /** No background/text colour of its own: the caller's className sets them. */
  plain?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center',
        size === 'sm' ? 'h-6 w-6 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5' : 'h-10 w-10 rounded-xl',
        !plain &&
          (active ? 'bg-primary text-on-primary' : 'bg-surface-variant text-on-surface-variant'),
        className,
      )}
    >
      {CATEGORY_ICON[categoryKind(name)]}
    </span>
  );
}

/** Ticket card for lists (My Tickets, Home): status accent, category, the next step. */
export function TicketCard({ ticket: t }: { ticket: TicketSummary }) {
  const footer =
    t.status === 'COMPLETED' ? (
      <span className="font-semibold text-on-tertiary-container">
        Repair done: tap to confirm it is fixed
      </span>
    ) : t.nextVisit ? (
      <span className="flex items-center gap-1.5">
        <CalendarIcon size={14} /> Visit {when(t.nextVisit.scheduledAt)}
        {t.assignee && ` · ${t.assignee.name}`}
      </span>
    ) : (
      <span className="flex items-center gap-1.5">
        <ClockIcon size={14} /> Reported {ago(t.createdAt)}
      </span>
    );

  return (
    <Link
      to={`/tickets?focus=${t.id}`}
      className={cx(
        'block rounded-3xl border border-l-4 border-outline-variant/60 bg-surface p-4 shadow-sm transition hover:shadow-md',
        STATUS[t.status]?.accent,
      )}
    >
      <div className="flex items-center gap-2 text-xs text-on-surface-variant">
        <span className="font-mono font-semibold">{ticketRef(t)}</span>
        <span aria-hidden>·</span>
        <span className="truncate">{placeLabel(t)}</span>
        <StatusPill status={t.status} className="ml-auto" />
      </div>
      <div className="mt-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-bold">{t.faultItem.name}</h3>
          {t.description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-on-surface-variant">{t.description}</p>
          )}
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant">
          <CategoryTile name={t.faultItem.category.name} size="sm" />
          {t.faultItem.category.name}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-variant/60 px-3 py-2 text-xs text-on-surface-variant">
        {footer}
        <ChevronRightIcon size={16} className="ml-auto shrink-0" />
      </div>
    </Link>
  );
}
