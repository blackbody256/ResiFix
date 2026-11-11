// OWNER: Andrew: PB-012 (breaches), PB-013 (what to do next), PB-015 (today's visits).
// The staff home page, laid out like the Group J warden dashboard: breach banner, four KPI
// cards, urgent work queue, today's visits, immediate operations and the per-block pulse.
// Every number comes from the work queue (GET /custodian/queue); nothing is placeholder data.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  CalendarCheckIcon,
  ClipboardIcon,
  InboxIcon,
  RotateIcon,
  ShieldIcon,
  SlidersIcon,
  TrendIcon,
} from '../components/console-icons';
import {
  IconTile,
  Panel,
  PanelHeader,
  Pill,
  TargetBadge,
  UrgencyTile,
} from '../components/custodian';
import {
  AlertIcon,
  ArrowRightIcon,
  BoltIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  PencilIcon,
  UserIcon,
  WrenchIcon,
} from '../components/icons';
import { TicketPanel } from '../components/TicketPanel';
import { ErrorText, Spinner } from '../components/ui';
import { cx } from '../lib/cx';
import { type NextStep, type QueueItem, type QueueResponse, sameDay, span } from '../lib/custodian';
import { ago, ticketRef } from '../lib/tickets';
import { useApi } from '../lib/useApi';
import { useNow } from '../lib/useNow';
import { useTicketParam } from '../lib/useTicketParam';
import { useAuth } from '../auth/useAuth';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Button wording on the dashboard, as in the design ("Assign", "Schedule", "Triage"). */
const ACTION: Record<NextStep, { label: string; icon: typeof CalendarIcon }> = {
  REVIEW: { label: 'Triage', icon: SlidersIcon },
  SCHEDULE: { label: 'Schedule', icon: CalendarIcon },
  RESCHEDULE: { label: 'Reschedule', icon: CalendarIcon },
  VISIT: { label: 'Start', icon: WrenchIcon },
  COMPLETE: { label: 'Open', icon: ArrowRightIcon },
  AWAIT_RESIDENT: { label: 'Open', icon: ArrowRightIcon },
};

interface Property {
  property: { name: string; blocks: { id: string; name: string }[] };
}

export function CustodianDashboard() {
  const { user } = useAuth();
  const queue = useApi<QueueResponse>('/custodian/queue?limit=200');
  const awaiting = useApi<QueueResponse>('/custodian/queue?status=COMPLETED&limit=1');
  const property = useApi<Property>('/properties/mine');
  const { ticketId, open, close } = useTicketParam();
  const reload = () => {
    queue.reload();
    awaiting.reload();
  };

  const items = queue.data?.tickets ?? [];
  const summary = queue.data?.summary;
  const now = useNow();
  const overdue = items.filter((i) => i.target?.state === 'OVERDUE');
  const worst = overdue[0];
  const toReview = items.filter((i) => i.next === 'REVIEW');
  const newLast2h = toReview.filter(
    (i) => now.getTime() - new Date(i.createdAt).getTime() <= 2 * 3_600_000,
  ).length;
  const dueToday = items.filter((i) => i.target && sameDay(new Date(i.target.dueAt), now));
  const onTrackToday = dueToday.filter((i) => i.target!.state !== 'OVERDUE').length;
  const overdueBlocks = [...new Set(overdue.map((i) => i.room.block.name))];
  const toBook = items.filter((i) => i.next === 'SCHEDULE');
  const newTime = items.filter((i) => i.next === 'RESCHEDULE');
  const visitsToday = items
    .filter((i) => i.nextVisit && sameDay(new Date(i.nextVisit.scheduledAt), now))
    .sort((a, b) => a.nextVisit!.scheduledAt.localeCompare(b.nextVisit!.scheduledAt));
  const onSite = items.filter((i) => i.status === 'IN_PROGRESS' && !i.nextVisit);
  const timeline = [...onSite, ...visitsToday];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Phone: the design's "live operations console" header card. */}
      <div className="rounded-console bg-console-card p-4 lg:hidden">
        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-console-green-ink uppercase">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden /> Live operations console
        </p>
        <p className="mt-1 text-xl leading-tight font-extrabold text-console-ink">
          {property.data?.property.name ?? ' '}
        </p>
        <p className="text-sm text-console-faint">
          {user?.role === 'ADMIN' ? 'Administrator' : 'Custodian'}: {user?.name} · On duty
        </p>
      </div>

      {queue.loading && !queue.data && <Spinner />}
      <ErrorText>{queue.error?.message}</ErrorText>

      {worst && (
        <BreachBanner item={worst} more={overdue.length - 1} onView={() => open(worst.id)} />
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Stat
            to="/custodian?status=REPORTED,REOPENED"
            label="New complaints"
            icon={<InboxIcon size={16} />}
            tile="mint"
            value={toReview.length}
            pill={
              <Pill tone="green">
                <TrendIcon size={12} />+{newLast2h} in last 2h
              </Pill>
            }
            foot={<span>Awaiting review by the custodian desk</span>}
          />
          <Stat
            to="/custodian"
            label="Due today"
            icon={<ClockIcon size={16} />}
            tile="cream"
            value={dueToday.length}
            pill={<Pill tone="cream">{onTrackToday} on track</Pill>}
            foot={<Progress value={onTrackToday} total={dueToday.length} />}
          />
          <Stat
            to="/custodian?state=OVERDUE"
            label="Breached SLA"
            labelClass="text-console-red"
            icon={<RotateIcon size={16} />}
            tile="pink"
            value={summary.overdue}
            valueClass={summary.overdue ? 'text-console-red' : undefined}
            pill={
              summary.overdue ? (
                <Pill tone="darkred">Action required</Pill>
              ) : (
                <Pill tone="green">All on target</Pill>
              )
            }
            foot={
              overdueBlocks.length ? (
                <span className="flex items-center gap-1.5 text-console-red">
                  <span className="h-1.5 w-1.5 rounded-full bg-console-red" aria-hidden />
                  {overdueBlocks.join(' & ')}
                </span>
              ) : (
                <span>No ticket past its target</span>
              )
            }
          />
          <Stat
            to="/custodian?status=COMPLETED"
            label="Awaiting confirmation"
            labelClass="text-primary"
            icon={<CheckCircleIcon size={16} />}
            tile="peach"
            value={awaiting.data?.summary.total ?? '–'}
            pill={<Pill tone="beige">Resident sign-off</Pill>}
            foot={<span>Resident asked to confirm the repair</span>}
          />
        </div>
      )}

      {queue.data && (
        <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
          <UrgentQueue
            className="lg:col-span-7"
            items={items.slice(0, 3)}
            total={summary?.total ?? 0}
            onOpen={open}
          />
          <div className="space-y-4 lg:col-span-5">
            <TodayVisits items={timeline} now={now} onOpen={open} />
            <Panel>
              <p className="text-[11px] font-bold tracking-wider text-console-muted uppercase">
                Immediate operations
              </p>
              <div className="mt-3 space-y-2">
                <OpRow
                  tile="dark"
                  icon={<PencilIcon size={18} />}
                  title="Triage new reports"
                  hint={
                    toReview.length
                      ? `${toReview.length} report${toReview.length === 1 ? '' : 's'} waiting for review`
                      : 'Nothing waiting for review'
                  }
                  to="/custodian?status=REPORTED,REOPENED"
                />
                <OpRow
                  tile="beige"
                  icon={<CalendarIcon size={18} />}
                  title="Book repair visits"
                  hint={
                    toBook.length
                      ? `${toBook.length} reviewed ticket${toBook.length === 1 ? '' : 's'} without a visit`
                      : 'Every reviewed ticket has a visit'
                  }
                  onClick={toBook[0] ? () => open(toBook[0].id) : undefined}
                />
                <OpRow
                  tile="beige"
                  icon={<RotateIcon size={18} />}
                  title="Visits needing a new time"
                  hint={
                    newTime.length
                      ? `${newTime.length} missed or asked to move`
                      : 'No missed or moved visits'
                  }
                  to="/visits"
                />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {queue.data && property.data && (
        <BlockPulse blocks={property.data.property.blocks} items={items} />
      )}

      {ticketId && (
        <TicketPanel
          key={ticketId}
          ticketId={ticketId}
          initial={items.find((i) => i.id === ticketId)}
          onClose={close}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function BreachBanner({
  item,
  more,
  onView,
}: {
  item: QueueItem;
  more: number;
  onView: () => void;
}) {
  const target = item.target!;
  const Act = ACTION[item.next];
  return (
    <div className="flex flex-col gap-3 rounded-console bg-tertiary-container p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-console bg-tertiary text-on-tertiary">
          <AlertIcon size={20} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone="red" className="uppercase">
              Critical SLA breach
            </Pill>
            <span className="font-bold text-console-red">
              Ticket {ticketRef(item)} · {item.room.block.name} · Room {item.room.number}
            </span>
            {more > 0 && (
              <span className="text-xs font-semibold text-console-red">+{more} more overdue</span>
            )}
          </p>
          <p className="mt-1 text-sm leading-snug text-console-red-text">
            {item.faultItem.name}
            {item.description ? ` (“${item.description}”)` : ''}: exceeded the{' '}
            {target.clock === 'RESPOND' ? 'response' : 'repair'} target by{' '}
            <span className="font-semibold underline">{span(target.minutesLeft)}</span>.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onView}
          className="flex-1 rounded-console bg-console-card px-4 py-2.5 text-sm font-bold text-console-ink hover:bg-surface sm:flex-none"
        >
          View details
        </button>
        <button
          type="button"
          onClick={onView}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-console bg-tertiary px-4 py-2.5 text-sm font-bold text-on-tertiary hover:opacity-90 sm:flex-none"
        >
          <BoltIcon size={16} />
          {Act.label} now
        </button>
      </div>
    </div>
  );
}

function Stat({
  to,
  label,
  labelClass = 'text-console-muted',
  icon,
  tile,
  value,
  valueClass = 'text-console-ink',
  pill,
  foot,
}: {
  to: string;
  label: string;
  labelClass?: string;
  icon: ReactNode;
  tile: 'mint' | 'cream' | 'pink' | 'peach';
  value: ReactNode;
  valueClass?: string;
  pill: ReactNode;
  foot: ReactNode;
}) {
  return (
    <Link to={to} className="block rounded-console bg-console-card p-4 transition hover:bg-surface">
      <div className="flex items-start justify-between gap-2">
        <p className={cx('text-[11px] font-bold tracking-wider uppercase', labelClass)}>{label}</p>
        <IconTile tone={tile} size="sm">
          {icon}
        </IconTile>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={cx('text-4xl leading-none font-extrabold', valueClass)}>{value}</p>
        {pill}
      </div>
      <div className="mt-3 text-xs text-console-faint">{foot}</div>
    </Link>
  );
}

function Progress({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 100;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-variant">
        <span className="block h-full rounded-full bg-console-green" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}

function UrgentQueue({
  items,
  total,
  onOpen,
  className,
}: {
  items: QueueItem[];
  total: number;
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <PanelHeader
        tone="green"
        icon={<ClipboardIcon size={20} />}
        title="Urgent Complaints & Work Queue"
        subtitle="The most pressing open tickets"
        right={<Pill tone="cream">Sorted by time left</Pill>}
      />
      {items.length === 0 ? (
        <p className="mt-4 rounded-console bg-surface px-4 py-6 text-center text-sm text-console-faint">
          Nothing open. New reports will appear here.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <UrgentRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-console-faint">
          Showing {items.length} of {total} open ticket{total === 1 ? '' : 's'}
        </p>
        <Link
          to="/custodian"
          className="flex items-center gap-1.5 rounded-console bg-primary-container px-4 py-2 text-sm font-bold text-on-primary-container hover:opacity-90"
        >
          View all complaints <ArrowRightIcon size={16} />
        </Link>
      </div>
    </Panel>
  );
}

function UrgentRow({ item, onOpen }: { item: QueueItem; onOpen: (id: string) => void }) {
  const overdue = item.target?.state === 'OVERDUE';
  const Act = ACTION[item.next];
  const meta = item.nextVisit ? (
    <span className="flex items-center gap-1 font-semibold text-console-green-ink">
      <WrenchIcon size={13} /> {item.nextVisit.custodian.name} · visit{' '}
      {time(item.nextVisit.scheduledAt)}
    </span>
  ) : overdue ? (
    <span className="font-semibold text-console-amber">
      ! {item.faultItem.category.name} category
    </span>
  ) : (
    <span className="flex items-center gap-1">
      <ClockIcon size={13} /> Reported {ago(item.createdAt)}
    </span>
  );
  return (
    <div className="flex items-start gap-3 rounded-console bg-surface p-3">
      <UrgencyTile item={item} />
      <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-sm font-bold text-console-ink">{ticketRef(item)}</span>
          <TargetBadge target={item.target} />
          <span className="text-xs text-console-faint">
            {item.room.block.name} · Room {item.room.number}
          </span>
        </span>
        <span className="mt-1 block leading-snug font-medium text-console-body">
          {item.faultItem.name}
          {item.description && (
            <span className="block truncate text-sm font-normal text-console-faint">
              {item.description}
            </span>
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-console-faint">
          {meta}
          <span className="flex items-center gap-1">
            <UserIcon size={13} /> Assigned: {item.assignee?.name ?? 'Unassigned'}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className={cx(
          'flex shrink-0 items-center gap-1.5 self-center rounded-console px-3 py-2 text-sm font-bold',
          overdue
            ? 'bg-primary text-on-primary hover:bg-brand-600'
            : 'bg-surface-variant text-console-ink hover:opacity-90',
        )}
      >
        {Act.label}
        {overdue ? <ArrowRightIcon size={15} /> : <Act.icon size={15} />}
      </button>
    </div>
  );
}

function TodayVisits({
  items,
  now,
  onOpen,
}: {
  items: QueueItem[];
  now: Date;
  onOpen: (id: string) => void;
}) {
  return (
    <Panel>
      <PanelHeader
        tone="lime"
        icon={<CalendarCheckIcon size={20} />}
        title="Today’s Scheduled Visits"
        subtitle="Custodian visits booked for today"
        right={<Pill tone="green">{items.length} active</Pill>}
      />
      {items.length === 0 ? (
        <p className="mt-4 rounded-console bg-surface px-4 py-6 text-center text-sm text-console-faint">
          No visits booked for today.
        </p>
      ) : (
        <ol className="relative mt-4 ml-3 space-y-4 border-l-2 border-console-line pl-6">
          {items.map((item) => (
            <TimelineRow key={item.id} item={item} now={now} onOpen={onOpen} />
          ))}
        </ol>
      )}
      <Link
        to="/visits"
        className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary"
      >
        All visits <ChevronRightIcon size={16} />
      </Link>
    </Panel>
  );
}

function TimelineRow({
  item,
  now,
  onOpen,
}: {
  item: QueueItem;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const visit = item.nextVisit;
  const onSite = item.status === 'IN_PROGRESS' && !visit;
  const late = visit && new Date(visit.scheduledAt).getTime() < now.getTime();
  const asked = Boolean(visit?.changeRequest);
  const node = onSite
    ? { cls: 'bg-primary text-on-primary', icon: <WrenchIcon size={12} /> }
    : asked || late
      ? { cls: 'bg-console-peach text-console-peach-ink', icon: <AlertIcon size={12} /> }
      : { cls: 'bg-surface-variant text-console-nav', icon: <ClockIcon size={12} /> };
  const badge = onSite ? (
    <Pill tone="green">On site</Pill>
  ) : asked ? (
    <Pill tone="pink">Asked to move</Pill>
  ) : late ? (
    <Pill tone="orange">Late</Pill>
  ) : (
    <Pill tone="beige">Booked</Pill>
  );
  return (
    <li className="relative">
      <span
        className={cx(
          'absolute top-0.5 -left-[2.15rem] grid h-6 w-6 place-items-center rounded-full ring-4 ring-console-card',
          node.cls,
        )}
        aria-hidden
      >
        {node.icon}
      </span>
      <button type="button" onClick={() => onOpen(item.id)} className="block w-full text-left">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-console-ink">
            {onSite ? 'Work under way' : time(visit!.scheduledAt)} · {ticketRef(item)}
          </span>
          <span className="ml-auto">{badge}</span>
        </span>
        <span className="mt-0.5 block text-sm font-semibold text-console-body">
          {item.faultItem.name}
        </span>
        <span className="mt-0.5 block text-xs text-console-faint">
          {item.room.block.name} · Room {item.room.number}
          <span className="font-semibold text-console-green-ink">
            {' · '}
            {onSite ? (item.assignee?.name ?? 'Custodian') : visit!.custodian.name}
          </span>
        </span>
      </button>
    </li>
  );
}

function OpRow({
  tile,
  icon,
  title,
  hint,
  to,
  onClick,
}: {
  tile: 'dark' | 'beige';
  icon: ReactNode;
  title: string;
  hint: string;
  to?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <IconTile tone={tile}>{icon}</IconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-console-ink">{title}</span>
        <span className="block truncate text-xs text-console-faint">{hint}</span>
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-console-faint" />
    </>
  );
  const cls =
    'flex w-full items-center gap-3 rounded-console bg-surface p-2.5 text-left hover:bg-surface-variant/60';
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cx(cls, !onClick && 'opacity-60')}
    >
      {body}
    </button>
  );
}

/** Open work by block: share on track vs overdue, and what is next in each block. */
function BlockPulse({
  blocks,
  items,
}: {
  blocks: { id: string; name: string }[];
  items: QueueItem[];
}) {
  return (
    <Panel>
      <PanelHeader
        tone="dark"
        icon={<ShieldIcon size={20} />}
        title="Hall Infrastructure Pulse"
        subtitle="Open work tickets by block, live"
        right={
          <span className="hidden items-center gap-4 text-xs font-semibold text-console-nav sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden /> On track
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-console-red" aria-hidden /> Overdue
            </span>
          </span>
        }
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {blocks.map((b) => {
          const mine = items.filter((i) => i.room.block.id === b.id);
          const late = mine.filter((i) => i.target?.state === 'OVERDUE').length;
          const fine = mine.length - late;
          const pct = mine.length ? Math.round((fine / mine.length) * 100) : 100;
          const next = mine
            .filter((i) => i.nextVisit)
            .sort((a, c) => a.nextVisit!.scheduledAt.localeCompare(c.nextVisit!.scheduledAt))[0];
          const reviews = mine.filter((i) => i.next === 'REVIEW').length;
          return (
            <div key={b.id} className="rounded-console bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 font-bold text-console-ink">
                  <BuildingIcon size={15} className="text-primary" /> {b.name}
                </span>
                <Pill tone={late ? 'pink' : 'green'}>{pct}% on track</Pill>
                <span className="ml-auto text-xs text-console-faint">
                  {late ? `${late} overdue · ` : ''}
                  {mine.length} open
                </span>
              </div>
              <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-secondary-container">
                {mine.length > 0 && (
                  <>
                    <span
                      className="h-full bg-primary"
                      style={{ width: `${(fine / mine.length) * 100}%` }}
                    />
                    <span
                      className="h-full bg-console-red"
                      style={{ width: `${(late / mine.length) * 100}%` }}
                    />
                  </>
                )}
              </div>
              <div className="mt-2 flex justify-between gap-2 text-xs text-console-faint">
                <span>
                  {mine.length === 0
                    ? 'No open tickets'
                    : next
                      ? `Next visit ${time(next.nextVisit!.scheduledAt)}`
                      : 'No visit booked'}
                </span>
                <span>{reviews ? `${reviews} to review` : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
