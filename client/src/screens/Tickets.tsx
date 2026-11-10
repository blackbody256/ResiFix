// OWNER: Ayan: PB-010 (my tickets), PB-011 (timeline), PB-020 (verify UI), PB-022 (rating UI).
// List at /tickets; detail at /tickets?focus=<id> (the link Web Push notifications open).
// Residents confirm a completed repair from the detail (Group J design, page 10).
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import {
  AlertIcon,
  ArrowLeftIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusCircleIcon,
  SearchIcon,
  SendIcon,
  StarIcon,
  TicketIcon,
} from '../components/icons';
import { CategoryTile, StatusPill, TicketCard } from '../components/tickets';
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Eyebrow,
  Notice,
  Spinner,
  StatCard,
  Textarea,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { cx } from '../lib/cx';
import {
  ago,
  isOpen,
  placeLabel,
  priorityLabel,
  STATUS,
  ticketRef,
  when,
  type TicketStatus,
  type TicketSummary,
} from '../lib/tickets';
import { useApi } from '../lib/useApi';

interface Person {
  id: string;
  name: string;
  role?: string;
}
interface Photo {
  id: string;
  kind: 'REPORT' | 'PROOF';
  url: string;
  createdAt: string;
}
interface TicketDetail extends Omit<TicketSummary, 'nextVisit' | 'assignee'> {
  closedAt: string | null;
  reopenCount: number;
  reporter: Person & { phone: string };
  assignee: Person | null;
  photos: Photo[];
  visits: {
    id: string;
    scheduledAt: string;
    arrivedAt: string | null;
    missed: boolean;
    notes: string | null;
    custodian: Person;
  }[];
  repairProofs: {
    id: string;
    notes: string | null;
    createdAt: string;
    submittedBy: Person;
    photos: Photo[];
  }[];
  verifications: { id: string; confirmed: boolean; comment: string | null; createdAt: string }[];
  /** Only sent to the resident who reported the ticket; staff see rating totals only. */
  rating?: { score: number; comment: string | null } | null;
  timeline: {
    id: string;
    action: string;
    fromStatus: TicketStatus | null;
    toStatus: TicketStatus | null;
    actor: Person | null;
    createdAt: string;
  }[];
}

const AUTO_CLOSE_HOURS = 48; // PB-021: the worker's AUTO_CLOSE_HOURS

function friendly(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (err.code === 'NOT_IMPLEMENTED') return 'This is not switched on yet. Please try again later.';
  return err.message;
}

export function Tickets() {
  const [params] = useSearchParams();
  const focus = params.get('focus');
  return focus ? <TicketView key={focus} id={focus} /> : <TicketList />;
}

/* ------------------------------------------------------------------ list (PB-010) */

type Tab = 'all' | 'open' | 'closed';

function TicketList() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<{ tickets: TicketSummary[] }>('/tickets');
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<TicketStatus | 'ALL'>('ALL');

  const tickets = useMemo(() => data?.tickets ?? [], [data]);
  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => isOpen(t.status)).length,
    closed: tickets.filter((t) => !isOpen(t.status)).length,
  };
  const needAction = tickets.filter((t) => t.status === 'COMPLETED').length;
  const statuses = [...new Set(tickets.map((t) => t.status))];
  const countOf = (st: TicketStatus) => tickets.filter((t) => t.status === st).length;

  const q = query.trim().toLowerCase();
  const shown = tickets.filter((t) => {
    if (tab === 'open' && !isOpen(t.status)) return false;
    if (tab === 'closed' && isOpen(t.status)) return false;
    if (status !== 'ALL' && t.status !== status) return false;
    if (!q) return true;
    const text = [
      ticketRef(t),
      t.faultItem.name,
      t.faultItem.category.name,
      t.description ?? '',
      placeLabel(t),
    ];
    return text.join(' ').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">
          {user?.role === 'RESIDENT' ? 'My tickets' : 'Tickets'}
        </h1>
        {needAction > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-tertiary-container px-3 py-1 text-xs font-bold text-on-tertiary-container">
            <span className="h-1.5 w-1.5 rounded-full bg-tertiary" /> {needAction} action required
          </span>
        )}
        {user?.role === 'RESIDENT' && (
          <Link
            to="/report"
            className={cx(
              'hidden items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm lg:flex',
              needAction === 0 && 'ml-auto',
            )}
          >
            <PlusCircleIcon size={18} /> Report a fault
          </Link>
        )}
      </div>

      {/* Laptop: KPI cards double as filters (desktop design, page 23). */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-5">
        {(
          [
            ['All', counts.all, 'all', 'ALL', 'default'],
            ['Open', counts.open, 'open', 'ALL', 'default'],
            ['Visit scheduled', countOf('SCHEDULED'), 'all', 'SCHEDULED', 'default'],
            ['Confirm repair', needAction, 'all', 'COMPLETED', needAction ? 'alert' : 'default'],
            ['Closed', counts.closed, 'closed', 'ALL', 'good'],
          ] as const
        ).map(([label, value, t, st, tone]) => (
          <StatCard
            key={label}
            label={label}
            value={value}
            tone={tone}
            active={tab === t && status === st}
            onClick={() => {
              setTab(t);
              setStatus(st);
            }}
          />
        ))}
      </div>

      <div
        className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 shadow-sm lg:hidden"
        role="tablist"
      >
        {(['all', 'open', 'closed'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              'rounded-xl py-2 text-sm font-semibold capitalize',
              tab === key ? 'bg-primary text-on-primary' : 'text-on-surface-variant',
            )}
          >
            {key} <span className="opacity-70">({counts[key]})</span>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 shadow-sm">
        <SearchIcon size={18} className="text-outline" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticket ID, item or category…"
          className="w-full bg-transparent outline-none placeholder:text-outline"
          aria-label="Search tickets"
        />
      </label>

      {statuses.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {(['ALL', ...statuses] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={cx(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold',
                status === s ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface',
              )}
            >
              {s === 'ALL' ? 'All statuses' : STATUS[s].label}
            </button>
          ))}
        </div>
      )}

      {loading && <Spinner />}
      {error && <ErrorText>{friendly(error)}</ErrorText>}

      {data && shown.length === 0 && (
        <Card className="text-center">
          <TicketIcon size={28} className="mx-auto text-primary" />
          <p className="mt-2 font-semibold">
            {tickets.length === 0 ? 'No tickets yet' : 'No tickets match'}
          </p>
          <p className="text-sm text-on-surface-variant">
            {tickets.length === 0
              ? 'Faults you report will show up here with their progress.'
              : 'Try another search or filter.'}
          </p>
        </Card>
      )}

      <div className="space-y-3 lg:hidden">
        {shown.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}
      </div>
      {shown.length > 0 && <TicketTable tickets={shown} />}

      {user?.role === 'RESIDENT' && (
        <Link
          to="/report"
          className="fixed right-4 bottom-24 z-10 flex items-center gap-2 rounded-2xl bg-primary px-5 py-3.5 font-semibold text-on-primary shadow-lg sm:right-[max(1rem,calc(50%-20rem))] lg:hidden"
        >
          <PlusCircleIcon size={20} /> Report fault
        </Link>
      )}
    </div>
  );
}

/** Laptop table (desktop design, page 23): one row per ticket, the whole row opens it. */
function TicketTable({ tickets }: { tickets: TicketSummary[] }) {
  const navigate = useNavigate();
  return (
    <div className="hidden overflow-hidden rounded-3xl bg-surface shadow-sm lg:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-variant/60 text-xs font-bold tracking-wide text-on-surface-variant uppercase">
          <tr>
            <th className="px-4 py-3">Ticket</th>
            <th className="px-4 py-3">Fault &amp; location</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Next step</th>
            <th className="px-4 py-3">Reported</th>
            <th className="w-10" aria-label="Open" />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50">
          {tickets.map((t) => (
            <tr
              key={t.id}
              onClick={() => navigate(`/tickets?focus=${t.id}`)}
              className={cx(
                'cursor-pointer border-l-4 transition-colors hover:bg-primary-container/30',
                STATUS[t.status]?.accent,
              )}
            >
              <td className="px-4 py-3 font-mono text-xs font-semibold">
                <Link to={`/tickets?focus=${t.id}`} onClick={(e) => e.stopPropagation()}>
                  {ticketRef(t)}
                </Link>
              </td>
              <td className="px-4 py-3">
                <p className="font-bold">{t.faultItem.name}</p>
                <p className="text-xs text-on-surface-variant">{placeLabel(t)}</p>
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <CategoryTile name={t.faultItem.category.name} size="sm" />
                  {t.faultItem.category.name}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusPill status={t.status} />
              </td>
              <td className="px-4 py-3 text-xs">
                {t.status === 'COMPLETED' ? (
                  <span className="font-semibold text-on-tertiary-container">
                    Confirm the repair
                  </span>
                ) : t.nextVisit ? (
                  <>
                    Visit {when(t.nextVisit.scheduledAt)}
                    {t.assignee && (
                      <span className="block text-on-surface-variant">{t.assignee.name}</span>
                    )}
                  </>
                ) : isOpen(t.status) ? (
                  <span className="text-on-surface-variant">
                    {t.assignee ? `With ${t.assignee.name}` : 'Waiting for review'}
                  </span>
                ) : (
                  <span className="text-on-surface-variant">Done</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-on-surface-variant">{ago(t.createdAt)}</td>
              <td className="pr-4 text-outline">
                <ChevronRightIcon size={18} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- detail (PB-010/011) */

const STEPS: { title: string; hint: string; reached: TicketStatus[] }[] = [
  { title: 'Reported', hint: 'Sent from the student app', reached: ['REPORTED'] },
  { title: 'Reviewed by custodian', hint: 'Fault checked and categorised', reached: ['REVIEWED'] },
  {
    title: 'Visit scheduled',
    hint: 'A custodian is assigned and a visit booked',
    reached: ['ASSIGNED', 'SCHEDULED'],
  },
  { title: 'Repair in progress', hint: 'The custodian is working on it', reached: ['IN_PROGRESS'] },
  {
    title: 'Awaiting your confirmation',
    hint: 'Confirm the fix or say it is still a problem',
    reached: ['COMPLETED'],
  },
  { title: 'Completed', hint: 'Ticket closed', reached: ['STUDENT_CONFIRMED', 'CLOSED'] },
];

const currentStep = (status: TicketStatus) =>
  status === 'REOPENED'
    ? 1
    : Math.max(
        0,
        STEPS.findIndex((s) => s.reached.includes(status)),
      );

/** Statuses in which the resident is still waiting for someone to come. */
const AWAITING = ['REPORTED', 'REVIEWED', 'REOPENED', 'ASSIGNED', 'SCHEDULED'];

function TicketView({ id }: { id: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<{ ticket: TicketDetail }>(
    `/tickets/${encodeURIComponent(id)}`,
  );
  const t = data?.ticket;
  const isReporter = !!t && user?.id === t.reporter.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/tickets')}
          className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-sm"
          aria-label="Back to tickets"
        >
          <ArrowLeftIcon size={20} />
        </button>
        <h1 className="text-lg font-bold">
          {t?.status === 'COMPLETED' && isReporter ? 'Confirm repair' : 'Ticket details'}
        </h1>
        {t && (
          <span className="ml-auto rounded-full bg-surface px-3 py-1 font-mono text-xs font-semibold shadow-sm">
            {ticketRef(t)}
          </span>
        )}
      </div>

      {loading && <Spinner />}
      {error && <ErrorText>{friendly(error)}</ErrorText>}

      {t && (
        // Phone: one column in reading order (order-*). Laptop: details left, and the visit and
        // progress in a sticky right column, like the desktop design's two-column pages.
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start">
          <div className="contents lg:col-span-2 lg:block lg:space-y-4">
            <div className="order-1">
              <Summary t={t} />
            </div>
            {t.status === 'COMPLETED' && isReporter && (
              <div className="order-2">
                <ConfirmRepair t={t} onDone={reload} />
              </div>
            )}
            <div className="order-5">
              <Evidence t={t} />
            </div>
            {!(t.status === 'COMPLETED' && isReporter) && t.repairProofs.length > 0 && (
              <div className="order-6">
                <Proof t={t} />
              </div>
            )}
            {t.rating && (
              <Card className="order-7">
                <Eyebrow>Your rating</Eyebrow>
                <div className="mt-2">
                  <Stars value={t.rating.score} />
                </div>
                {t.rating.comment && <p className="mt-2 text-sm">{t.rating.comment}</p>}
              </Card>
            )}
            <div className="order-8">
              <Activity t={t} />
            </div>
          </div>
          <div className="contents lg:sticky lg:top-24 lg:block lg:space-y-4">
            <div className="order-3">
              <UpcomingVisit t={t} canAsk={isReporter} />
            </div>
            <div className="order-4">
              <Progress t={t} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ t }: { t: TicketDetail }) {
  const [now] = useState(() => Date.now());
  const hours = Math.max(0, Math.round((now - new Date(t.createdAt).getTime()) / 3_600_000));
  const responded = t.visits.some((v) => v.arrivedAt) || !AWAITING.includes(t.status);
  const overdue = !!t.dueAt && !responded && new Date(t.dueAt).getTime() < now;

  return (
    <Card>
      <div className="flex items-start gap-2">
        <Eyebrow className="text-primary">
          {t.faultItem.category.name} · {t.faultItem.name}
        </Eyebrow>
        <StatusPill status={t.status} className="ml-auto" />
      </div>
      <h2 className="mt-2 text-2xl leading-tight font-extrabold">{t.faultItem.name}</h2>
      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium">
        <BuildingIcon size={16} className="text-primary" /> {placeLabel(t)}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-on-surface-variant">
        <ClockIcon size={16} /> Reported {when(t.createdAt)} · Age: {hours} hours
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge>{priorityLabel(t.priority)} priority</Badge>
        {t.reopenCount > 0 && (
          <Badge className="bg-error-container text-on-error-container">
            Reopened {t.reopenCount}×
          </Badge>
        )}
      </div>
      {t.dueAt && (
        <div
          className={cx(
            'mt-4 flex items-center gap-3 rounded-2xl px-4 py-3',
            overdue ? 'bg-error-container text-on-error-container' : 'bg-primary-container/60',
          )}
        >
          {overdue ? (
            <AlertIcon size={22} />
          ) : (
            <CheckCircleIcon size={22} className="text-primary" />
          )}
          <div className="flex-1 text-sm">
            <p className="font-bold">Target response by {when(t.dueAt)}</p>
            <p>
              {responded
                ? 'A custodian has responded.'
                : overdue
                  ? 'The response target has passed. The hall team has been alerted.'
                  : 'A custodian should respond by then.'}
            </p>
          </div>
          {responded && (
            <span className="rounded-full bg-success-container px-2 py-0.5 text-xs font-bold text-on-success-container">
              MET
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function UpcomingVisit({ t, canAsk }: { t: TicketDetail; canAsk: boolean }) {
  const [now] = useState(() => Date.now());
  const visit = t.visits.find(
    (v) => !v.missed && !v.arrivedAt && new Date(v.scheduledAt).getTime() > now,
  );
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  if (!visit) return null;

  async function ask(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      await api.post(`/visits/${visit!.id}/change-request`, { message: message.trim() });
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(friendly(err));
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        <h2 className="font-bold">Scheduled repair visit</h2>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-variant/50 p-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-lg font-bold text-on-primary">
          {visit.custodian.name.charAt(0)}
        </span>
        <div>
          <p className="font-bold">{visit.custodian.name}</p>
          <p className="text-sm text-on-surface-variant">Custodian</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 font-semibold">
        <CalendarIcon size={18} className="text-primary" /> {when(visit.scheduledAt)}
      </p>
      {visit.notes && (
        <p className="mt-2 rounded-2xl bg-surface-variant/50 px-3 py-2 text-sm italic">
          “{visit.notes}”
        </p>
      )}
      {canAsk &&
        (state === 'sent' ? (
          <Notice tone="success" className="mt-3" icon={<CheckIcon size={18} />}>
            Request sent. The custodian will pick a new time and you will be notified.
          </Notice>
        ) : asking ? (
          <form onSubmit={ask} className="mt-3 space-y-2">
            <label htmlFor="change" className="text-sm font-semibold">
              When suits you instead?
            </label>
            <Textarea
              id="change"
              rows={2}
              maxLength={300}
              required
              placeholder="e.g. I have lectures until 4 PM. Any time after 5 PM works."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={state === 'sending' || !message.trim()}>
                {state === 'sending' ? 'Sending…' : 'Send request'}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" className="mt-3" onClick={() => setAsking(true)}>
            <CalendarIcon size={18} /> I can’t make it, suggest a new time
          </Button>
        ))}
    </Card>
  );
}

function Progress({ t }: { t: TicketDetail }) {
  const step = currentStep(t.status);
  const reachedAt = (s: (typeof STEPS)[number], i: number) =>
    i === 0
      ? t.createdAt
      : t.timeline.find((e) => e.toStatus && s.reached.includes(e.toStatus))?.createdAt;

  return (
    <Card>
      <div className="flex items-center">
        <h2 className="font-bold">Repair progress</h2>
        <span className="ml-auto text-xs font-semibold text-on-surface-variant">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>
      {t.status === 'REOPENED' && (
        <Notice tone="warning" className="mt-3" icon={<AlertIcon size={18} />}>
          Reopened: the problem came back, so the custodian team is looking at it again.
        </Notice>
      )}
      <ol className="mt-4">
        {STEPS.map((s, i) => {
          const done = i < step || (i === step && i === STEPS.length - 1);
          const current = i === step && !done;
          const at = i <= step ? reachedAt(s, i) : undefined;
          return (
            <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
              {i < STEPS.length - 1 && (
                <span
                  className={cx(
                    'absolute top-7 left-3.5 h-[calc(100%-1.75rem)] w-0.5',
                    i < step ? 'bg-primary' : 'bg-outline-variant',
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cx(
                  'z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                  done && 'bg-primary text-on-primary',
                  current && 'bg-primary-container text-primary ring-2 ring-primary',
                  !done && !current && 'bg-surface-variant text-outline',
                )}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <CheckIcon size={14} /> : i + 1}
              </span>
              <div
                className={cx(
                  'min-w-0 flex-1',
                  current && '-mt-1 rounded-2xl bg-primary-container/50 px-3 py-2',
                )}
              >
                <div className="flex items-baseline gap-2">
                  <p className={cx('font-semibold', !done && !current && 'text-outline')}>
                    {s.title}
                  </p>
                  {at && (
                    <span className="ml-auto shrink-0 text-xs text-on-surface-variant">
                      {when(at)}
                    </span>
                  )}
                </div>
                <p
                  className={cx(
                    'text-sm',
                    !done && !current ? 'text-outline' : 'text-on-surface-variant',
                  )}
                >
                  {s.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function PhotoGrid({ photos, label }: { photos: Photo[]; label: string }) {
  if (!photos.length) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {photos.map((p, i) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="overflow-hidden rounded-2xl bg-surface-variant"
        >
          <img
            src={p.url}
            alt={`${label} ${i + 1}`}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        </a>
      ))}
    </div>
  );
}

function Evidence({ t }: { t: TicketDetail }) {
  if (!t.photos.length && !t.description) return null;
  return (
    <Card>
      <div className="flex items-center">
        <h2 className="font-bold">Reported evidence</h2>
        {t.photos.length > 0 && (
          <span className="ml-auto text-xs font-semibold text-on-surface-variant">
            {t.photos.length} photo{t.photos.length > 1 ? 's' : ''} attached
          </span>
        )}
      </div>
      <PhotoGrid photos={t.photos} label="Fault photo" />
      {t.description && (
        <div className="mt-3 rounded-2xl bg-surface-variant/50 px-4 py-3">
          <Eyebrow className="text-primary">Resident’s description</Eyebrow>
          <p className="mt-1 whitespace-pre-line italic">“{t.description}”</p>
        </div>
      )}
    </Card>
  );
}

function Proof({ t }: { t: TicketDetail }) {
  const proof = t.repairProofs[t.repairProofs.length - 1];
  return (
    <Card>
      <h2 className="font-bold">Proof of repair</h2>
      <p className="text-sm text-on-surface-variant">
        {proof.submittedBy.name} · {when(proof.createdAt)}
      </p>
      <PhotoGrid photos={proof.photos} label="Repair photo" />
      {proof.notes && (
        <div className="mt-3 rounded-2xl bg-surface-variant/50 px-4 py-3">
          <Eyebrow className="text-primary">Custodian work note</Eyebrow>
          <p className="mt-1 italic">“{proof.notes}”</p>
        </div>
      )}
    </Card>
  );
}

function describe(e: TicketDetail['timeline'][number]) {
  if (e.action === 'ticket.response_target_missed') return 'Response target missed';
  if (e.action === 'ticket.auto_closed') return 'Closed automatically after no response';
  if (e.toStatus) return STATUS[e.toStatus]?.label ?? e.toStatus;
  return e.action.replace(/^\w+\./, '').replace(/[._]/g, ' ');
}

function Activity({ t }: { t: TicketDetail }) {
  if (!t.timeline.length) return null;
  return (
    <Card>
      <details>
        <summary className="cursor-pointer font-bold">
          Full activity{' '}
          <span className="font-normal text-on-surface-variant">({t.timeline.length})</span>
        </summary>
        <ol className="mt-3 space-y-3 border-l-2 border-outline-variant pl-4">
          {t.timeline.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="font-medium first-letter:uppercase">{describe(e)}</p>
              <p className="text-on-surface-variant">
                {when(e.createdAt)}
                {e.actor && ` · ${e.actor.name}`}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}

/* ------------------------------------------------- confirm + rate (PB-020 / PB-022 UI) */

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function Stars({ value, onChange }: { value: number; onChange?: (score: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = (
          <StarIcon
            size={onChange ? 32 : 22}
            className={n <= value ? 'fill-current text-primary' : 'text-outline-variant'}
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={value === n}
            className="p-1"
          >
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        );
      })}
      {value > 0 && (
        <span className="ml-2 text-sm font-semibold text-primary">
          {RATING_WORDS[value]} ({value}/5)
        </span>
      )}
    </div>
  );
}

function ConfirmRepair({ t, onDone }: { t: TicketDetail; onDone: () => void }) {
  const proof = t.repairProofs[t.repairProofs.length - 1];
  const [fixed, setFixed] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closesAt = proof
    ? new Date(new Date(proof.createdAt).getTime() + AUTO_CLOSE_HOURS * 3_600_000).toISOString()
    : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (fixed === null) return setError('Tell us whether the problem is fixed.');
    if (!fixed && !comment.trim()) return setError('Tell us what is still wrong.');
    setBusy(true);
    setError('');
    try {
      const note = comment.trim() || undefined;
      // PB-020 (API by Selina): Fixed -> STUDENT_CONFIRMED, Still a problem -> REOPENED.
      await api.post(`/completion/tickets/${t.id}/verify`, { confirmed: fixed, comment: note });
      // PB-022: a rating only goes with a confirmed fix.
      if (fixed && score) {
        await api.post(`/completion/tickets/${t.id}/rating`, { score, comment: note });
      }
      onDone();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3 rounded-3xl bg-success-container p-4 text-on-success-container">
        <CheckCircleIcon size={28} />
        <div>
          <p className="font-bold">Marked as completed</p>
          {proof && (
            <p className="text-sm">
              By {proof.submittedBy.name} · {when(proof.createdAt)}
            </p>
          )}
        </div>
      </div>

      {proof && <Proof t={t} />}

      <Card>
        <h2 className="text-center text-lg font-bold">Has the problem been fixed?</h2>
        <p className="text-center text-sm text-on-surface-variant">
          Your answer keeps hall maintenance accountable.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant={fixed === true ? 'primary' : 'outline'}
            onClick={() => setFixed(true)}
            aria-pressed={fixed === true}
          >
            <CheckCircleIcon size={18} /> Yes, fixed
          </Button>
          <Button
            type="button"
            variant={fixed === false ? 'danger' : 'outline'}
            className={fixed === false ? 'bg-error-container' : ''}
            onClick={() => setFixed(false)}
            aria-pressed={fixed === false}
          >
            <AlertIcon size={18} /> Still a problem
          </Button>
        </div>

        {fixed === true && (
          <div className="mt-4 rounded-2xl bg-surface-variant/50 p-4">
            <p className="text-sm font-semibold">Rate the repair service</p>
            <Stars value={score} onChange={setScore} />
          </div>
        )}

        {fixed !== null && (
          <div className="mt-4">
            <label htmlFor="comment" className="text-sm font-semibold">
              {fixed ? 'Comments (optional)' : 'What is still wrong?'}
            </label>
            <Textarea
              id="comment"
              rows={3}
              maxLength={500}
              className="mt-1"
              placeholder={
                fixed
                  ? 'e.g. Fast response, courteous custodian.'
                  : 'e.g. The tap still drips when it is fully closed.'
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}
      </Card>

      {closesAt && (
        <Notice icon={<ClockIcon size={18} />}>
          <strong>Auto-close notice:</strong> if you do not answer, this ticket closes automatically{' '}
          {when(closesAt)}, {AUTO_CLOSE_HOURS} hours after the repair.
        </Notice>
      )}

      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy || fixed === null}>
        <SendIcon size={18} /> {busy ? 'Sending…' : 'Submit confirmation'}
      </Button>
    </form>
  );
}
