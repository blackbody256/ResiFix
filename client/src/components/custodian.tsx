// OWNER: Andrew (PB-012..PB-018). Building blocks for the custodian console in the Group J
// warden style: flat white cards with small (8px) corners and no coloured side lines, icon
// tiles, pills in the design's colours, and the ticket card used in lists.
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import {
  NEXT_STEP,
  type PillTone,
  type QueueItem,
  type Target,
  targetPill,
} from '../lib/custodian';
import { priorityLabel, ticketRef, type Priority } from '../lib/tickets';
import { AlertIcon, CalendarIcon, ChevronRightIcon } from './icons';
import { CategoryTile, StatusPill } from './tickets';

/** White card with the console's 8px corners. */
export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
}) {
  return <Tag className={cx('rounded-console bg-console-card p-5', className)}>{children}</Tag>;
}

export type TileTone =
  'green' | 'dark' | 'mint' | 'lime' | 'cream' | 'pink' | 'red' | 'peach' | 'beige';
const TILE: Record<TileTone, string> = {
  green: 'bg-console-green-tile text-on-primary',
  dark: 'bg-primary text-on-primary',
  mint: 'bg-console-mint text-console-green-ink',
  lime: 'bg-primary-container text-on-primary-container',
  cream: 'bg-surface text-console-slate',
  pink: 'bg-tertiary-container text-console-red',
  red: 'bg-tertiary-container text-tertiary',
  peach: 'bg-console-peach text-console-peach-ink',
  beige: 'bg-surface-variant text-console-nav',
};

/** Rounded square holding an icon. */
export function IconTile({
  tone,
  size = 'md',
  children,
  className = '',
}: {
  tone: TileTone;
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center rounded-console',
        size === 'sm' ? 'h-8 w-8 [&_svg]:h-4 [&_svg]:w-4' : 'h-10 w-10',
        TILE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Card heading: tile, title, one-line subtitle, and something on the right. */
export function PanelHeader({
  icon,
  tone,
  title,
  subtitle,
  right,
}: {
  icon: ReactNode;
  tone: TileTone;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <IconTile tone={tone}>{icon}</IconTile>
      <div className="min-w-0 flex-1">
        <h2 className="text-base leading-tight font-bold text-console-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-console-faint">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

const PILL: Record<PillTone, string> = {
  red: 'bg-tertiary text-on-tertiary',
  darkred: 'bg-console-red text-on-tertiary',
  orange: 'bg-console-orange text-console-orange-ink',
  beige: 'bg-surface-variant text-on-surface-variant',
  green: 'bg-primary-container text-on-primary-container',
  cream: 'bg-surface text-console-nav',
  pink: 'bg-tertiary-container text-console-red',
};

export function Pill({
  tone,
  children,
  className = '',
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** PB-012: the response target as the design's status pill. */
export function TargetBadge({
  target,
  className = '',
}: {
  target: Target | null;
  className?: string;
}) {
  if (!target) return null;
  const { tone, text } = targetPill(target);
  return (
    <Pill tone={tone} className={className}>
      {text}
    </Pill>
  );
}

const PRIORITY_TONE: Record<Priority, PillTone> = {
  URGENT: 'red',
  HIGH: 'orange',
  MEDIUM: 'beige',
  LOW: 'beige',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Pill tone={PRIORITY_TONE[priority]}>{priorityLabel(priority)}</Pill>;
}

/** Things that need the custodian's attention beyond the status: at most two, kept short. */
function attentionFlags(item: QueueItem): { key: string; text: string; icon: ReactNode }[] {
  const flags = [];
  if (item.nextVisit?.changeRequest) {
    flags.push({ key: 'ask', text: 'Asked for another time', icon: <CalendarIcon size={12} /> });
  }
  if (item.next === 'RESCHEDULE' && item.lastMissedVisit) {
    flags.push({ key: 'missed', text: 'Last visit missed', icon: <AlertIcon size={12} /> });
  }
  if (item.reopenCount > 0) {
    flags.push({ key: 'reopened', text: 'Reopened', icon: <AlertIcon size={12} /> });
  }
  return flags.slice(0, 2);
}

export function Flags({ item }: { item: QueueItem }) {
  const flags = attentionFlags(item);
  if (!flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <Pill key={f.key} tone="pink">
          {f.icon}
          {f.text}
        </Pill>
      ))}
    </span>
  );
}

/** Category icon tile tinted by urgency, as on the design's ticket rows. */
export function UrgencyTile({ item }: { item: QueueItem }) {
  const tone: TileTone =
    item.target?.state === 'OVERDUE'
      ? 'red'
      : item.target?.state === 'DUE_SOON'
        ? 'peach'
        : 'beige';
  return (
    <CategoryTile
      name={item.faultItem.category.name}
      plain
      className={cx('rounded-console!', TILE[tone])}
    />
  );
}

/**
 * A ticket in a list (phone work queue, visits): what, where, how urgent, and the next step.
 * The whole card opens the ticket panel.
 */
export function QueueCard({
  item,
  onOpen,
  showAction = true,
  footer,
}: {
  item: QueueItem;
  onOpen: (item: QueueItem) => void;
  showAction?: boolean;
  footer?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="block w-full rounded-console bg-console-card p-4 text-left transition hover:bg-surface"
    >
      <div className="flex items-start gap-3">
        <UrgencyTile item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-console-ink">{ticketRef(item)}</span>
            <TargetBadge target={item.target} />
          </div>
          <p className="mt-1 leading-snug font-semibold text-console-body">{item.faultItem.name}</p>
          <p className="mt-0.5 truncate text-xs text-console-faint">
            {item.room.block.name} · Room {item.room.number}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={item.status} />
            {item.priority !== 'MEDIUM' && <PriorityBadge priority={item.priority} />}
            <Flags item={item} />
          </div>
        </div>
      </div>
      {(footer || showAction) && (
        <div className="mt-3 flex items-center gap-2 rounded-console bg-surface px-3 py-2 text-xs text-console-faint">
          <span className="min-w-0 flex-1 truncate">{footer ?? NEXT_STEP[item.next].hint}</span>
          {showAction && (
            <span className="inline-flex items-center gap-1 font-bold text-primary">
              {NEXT_STEP[item.next].action}
              <ChevronRightIcon size={16} />
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/** Friendly empty state for lists. */
export function EmptyList({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="rounded-console bg-console-card px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-console bg-primary-container text-primary">
        {icon}
      </span>
      <p className="mt-3 font-bold text-console-ink">{title}</p>
      <p className="text-sm text-console-faint">{hint}</p>
    </div>
  );
}
