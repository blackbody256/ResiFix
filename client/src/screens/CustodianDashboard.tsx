// OWNER: Andrew: PB-012 (breaches), PB-013 (what to do next), PB-015 (today's visits).
// The staff home page. Lighter than the first design (feedback: too congested): one alert at
// most, four numbers, the next five tickets and today's visits. Analytics (PB-026..PB-028) and
// anything about artisans or other halls is left out.
import { Link } from 'react-router';
import { PriorityBadge, QueueCard, TargetBadge } from '../components/custodian';
import {
  AlertIcon,
  ArrowRightIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  PencilIcon,
  WrenchIcon,
} from '../components/icons';
import { TicketPanel } from '../components/TicketPanel';
import { Card, ErrorText, Spinner, StatCard } from '../components/ui';
import { cx } from '../lib/cx';
import { type QueueItem, type QueueResponse, sameDay, timeLeft } from '../lib/custodian';
import { ticketRef } from '../lib/tickets';
import { useApi } from '../lib/useApi';
import { useTicketParam } from '../lib/useTicketParam';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function CustodianDashboard({ first }: { first: string }) {
  const queue = useApi<QueueResponse>('/custodian/queue?limit=200');
  const awaiting = useApi<QueueResponse>('/custodian/queue?status=COMPLETED&limit=1');
  const property = useApi<{ property: { name: string } }>('/properties/mine');
  const { ticketId, open, close } = useTicketParam();
  const reload = () => {
    queue.reload();
    awaiting.reload();
  };

  const items = queue.data?.tickets ?? [];
  const summary = queue.data?.summary;
  const worst = items.find((i) => i.target?.state === 'OVERDUE');
  const toReview = items.filter((i) => i.next === 'REVIEW').length;
  const nextUp = items.slice(0, 5);

  const today = new Date();
  const visits = items
    .filter((i) => i.nextVisit && sameDay(new Date(i.nextVisit.scheduledAt), today))
    .sort((a, b) => a.nextVisit!.scheduledAt.localeCompare(b.nextVisit!.scheduledAt));
  const onSite = items.filter((i) => i.status === 'IN_PROGRESS' && !i.nextVisit);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl leading-tight font-extrabold">
          {greeting()}, {first}
        </h1>
        {property.data && (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-on-secondary-container">
            <BuildingIcon size={16} /> {property.data.property.name}
          </p>
        )}
      </div>

      {queue.loading && !queue.data && <Spinner />}
      <ErrorText>{queue.error?.message}</ErrorText>

      {worst && (
        <button
          type="button"
          onClick={() => open(worst.id)}
          className="flex w-full items-center gap-3 rounded-3xl bg-tertiary-container p-4 text-left text-on-tertiary-container shadow-sm"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tertiary text-on-tertiary">
            <AlertIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold tracking-wide uppercase">
              Response target missed
              {summary && summary.overdue > 1 && ` · ${summary.overdue} tickets`}
            </span>
            <span className="block font-bold">
              {worst.faultItem.name}, {worst.room.block.name} {worst.room.number}
            </span>
            <span className="text-sm">
              {timeLeft(worst.target!)} · {ticketRef(worst)}
            </span>
          </span>
          <span className="hidden rounded-full bg-tertiary px-4 py-2 text-sm font-bold text-on-tertiary sm:block">
            Deal with it
          </span>
          <ArrowRightIcon size={20} className="sm:hidden" />
        </button>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Link to="/custodian?view=review">
            <StatCard
              label="To review"
              value={toReview}
              icon={<PencilIcon size={18} />}
              hint="New and reopened"
            />
          </Link>
          <Link to="/custodian?view=soon">
            <StatCard
              label="Due soon"
              value={summary.dueSoon}
              icon={<ClockIcon size={18} />}
              hint="Last quarter of target"
            />
          </Link>
          <Link to="/custodian?view=overdue">
            <StatCard
              label="Overdue"
              value={summary.overdue}
              tone={summary.overdue ? 'alert' : 'default'}
              icon={<AlertIcon size={18} />}
              hint={summary.overdue ? 'Needs action now' : 'All on target'}
            />
          </Link>
          <Link to="/custodian?view=resident">
            <StatCard
              label="Awaiting resident"
              value={awaiting.data?.summary.total ?? '–'}
              tone="good"
              icon={<CheckCircleIcon size={18} />}
              hint="Repaired, to confirm"
            />
          </Link>
        </div>
      )}

      {queue.data && (
        <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
          <section className="space-y-3 lg:col-span-3">
            <div className="flex items-end justify-between">
              <h2 className="text-xl font-bold">Next up</h2>
              <Link to="/custodian" className="text-sm font-semibold text-primary">
                Work queue ({summary?.total ?? 0})
              </Link>
            </div>
            {nextUp.length === 0 ? (
              <Card className="text-center">
                <CheckCircleIcon size={28} className="mx-auto text-primary" />
                <p className="mt-2 font-semibold">Nothing open</p>
                <p className="text-sm text-on-surface-variant">New reports will show up here.</p>
              </Card>
            ) : (
              nextUp.map((item) => (
                <QueueCard key={item.id} item={item} onOpen={(i) => open(i.id)} />
              ))
            )}
          </section>

          <section className="space-y-3 lg:col-span-2">
            <div className="flex items-end justify-between">
              <h2 className="text-xl font-bold">Today’s visits</h2>
              <Link to="/visits" className="text-sm font-semibold text-primary">
                All visits
              </Link>
            </div>
            <Card className="p-4">
              {visits.length === 0 && onSite.length === 0 ? (
                <p className="py-4 text-center text-sm text-on-surface-variant">
                  No visits booked for today.
                </p>
              ) : (
                <ol className="relative space-y-1 border-l-2 border-outline-variant/70 pl-5">
                  {onSite.map((item) => (
                    <VisitRow key={item.id} item={item} label="On site" onOpen={open} />
                  ))}
                  {visits.map((item) => (
                    <VisitRow
                      key={item.id}
                      item={item}
                      label={time(item.nextVisit!.scheduledAt)}
                      onOpen={open}
                    />
                  ))}
                </ol>
              )}
            </Card>
          </section>
        </div>
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

function VisitRow({
  item,
  label,
  onOpen,
}: {
  item: QueueItem;
  label: string;
  onOpen: (id: string) => void;
}) {
  const late =
    item.nextVisit && new Date(item.nextVisit.scheduledAt).getTime() < new Date().getTime();
  const asked = Boolean(item.nextVisit?.changeRequest);
  return (
    <li className="relative">
      <span
        className={cx(
          'absolute top-4 -left-[1.6rem] grid h-4 w-4 place-items-center rounded-full ring-4 ring-surface',
          item.status === 'IN_PROGRESS'
            ? 'bg-primary'
            : asked || late
              ? 'bg-tertiary'
              : 'bg-secondary',
        )}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="w-full rounded-2xl px-2 py-2 text-left hover:bg-surface-variant/60"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
          {item.status === 'IN_PROGRESS' ? <WrenchIcon size={13} /> : <CalendarIcon size={13} />}
          {label}
          {asked && (
            <span className="rounded-full bg-error-container px-2 text-on-error-container">
              Asked to move
            </span>
          )}
          <span className="ml-auto">
            {item.priority === 'URGENT' || item.priority === 'HIGH' ? (
              <PriorityBadge priority={item.priority} />
            ) : (
              <TargetBadge target={item.target} />
            )}
          </span>
        </span>
        <span className="mt-0.5 block font-semibold">{item.faultItem.name}</span>
        <span className="block text-sm text-on-surface-variant">
          {item.room.block.name}, Room {item.room.number}
          {item.nextVisit && ` · ${item.nextVisit.custodian.name}`}
        </span>
      </button>
    </li>
  );
}
