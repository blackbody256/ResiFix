// OWNER: Andrew (PB-012..PB-018). Building blocks for the custodian console: target badge,
// priority badge, attention flags and the ticket card used on the dashboard, the phone work
// queue and the visits page. Built from the shared primitives so it matches the Group J design.
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { NEXT_STEP, type QueueItem, TARGET_TONE, type Target, timeLeft } from '../lib/custodian';
import { priorityLabel, ticketRef, type Priority } from '../lib/tickets';
import { AlertIcon, CalendarIcon, ChevronRightIcon, ClockIcon } from './icons';
import { CategoryTile, StatusPill } from './tickets';

/** PB-012: time left against the response target, coloured by state. */
export function TargetBadge({
  target,
  className = '',
}: {
  target: Target | null;
  className?: string;
}) {
  if (!target) return null;
  const tone = TARGET_TONE[target.state];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap',
        tone.soft,
        className,
      )}
      title={`${tone.label}: ${target.clock === 'RESPOND' ? 'respond' : 'repair'} by ${new Date(target.dueAt).toLocaleString()}`}
    >
      {target.state === 'OVERDUE' ? <AlertIcon size={13} /> : <ClockIcon size={13} />}
      {timeLeft(target)}
    </span>
  );
}

const PRIORITY_TONE: Record<Priority, string> = {
  URGENT: 'bg-tertiary text-on-tertiary',
  HIGH: 'bg-tertiary-container text-on-tertiary-container',
  MEDIUM: 'bg-surface-variant text-on-surface-variant',
  LOW: 'bg-surface-variant text-on-surface-variant',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        PRIORITY_TONE[priority],
      )}
    >
      {priorityLabel(priority)}
    </span>
  );
}

/** Things that need the custodian's attention beyond the status: at most two, kept short. */
function attentionFlags(item: QueueItem): { key: string; text: string; icon: ReactNode }[] {
  const flags = [];
  if (item.nextVisit?.changeRequest) {
    flags.push({ key: 'ask', text: 'Asked for another time', icon: <CalendarIcon size={13} /> });
  }
  if (item.next === 'RESCHEDULE' && item.lastMissedVisit) {
    flags.push({ key: 'missed', text: 'Last visit missed', icon: <AlertIcon size={13} /> });
  }
  if (item.reopenCount > 0) {
    flags.push({ key: 'reopened', text: 'Reopened', icon: <AlertIcon size={13} /> });
  }
  return flags.slice(0, 2);
}

export function Flags({ item }: { item: QueueItem }) {
  const flags = attentionFlags(item);
  if (!flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 rounded-full bg-error-container px-2 py-0.5 text-xs font-semibold text-on-error-container"
        >
          {f.icon}
          {f.text}
        </span>
      ))}
    </span>
  );
}

/**
 * A ticket in a list: what, where, how urgent, and one action. The whole card opens the ticket
 * panel; the action label tells the custodian what that panel will ask for.
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
  const overdue = item.target?.state === 'OVERDUE';
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cx(
        'block w-full rounded-3xl border border-l-4 bg-surface p-4 text-left shadow-sm transition hover:shadow-md',
        overdue
          ? 'border-outline-variant/60 border-l-tertiary'
          : 'border-outline-variant/60 border-l-primary',
      )}
    >
      <div className="flex items-start gap-3">
        <CategoryTile name={item.faultItem.category.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 leading-snug font-bold">{item.faultItem.name}</p>
            <TargetBadge target={item.target} />
          </div>
          <p className="mt-0.5 truncate text-sm text-on-surface-variant">
            {item.room.block.name}, Room {item.room.number}
            <span aria-hidden> · </span>
            <span className="font-mono text-xs">{ticketRef(item)}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={item.status} />
            {item.priority !== 'MEDIUM' && <PriorityBadge priority={item.priority} />}
            <Flags item={item} />
          </div>
        </div>
      </div>
      {(footer || showAction) && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-variant/60 px-3 py-2 text-xs text-on-surface-variant">
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
    <div className="rounded-3xl border border-dashed border-outline-variant bg-surface/70 px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary-container text-primary">
        {icon}
      </span>
      <p className="mt-3 font-bold">{title}</p>
      <p className="text-sm text-on-surface-variant">{hint}</p>
    </div>
  );
}
