// OWNER: Andrew: PB-012 (targets, breach flags), PB-013 (prioritised work queue: search and
// filters). Laid out like the Group J "Complaints & Work Queue" page: a header with breach
// risk, status cards that filter the list, a filter card, the ticket table (cards on phones)
// with paging and CSV export, and three notes on targets, ordering and staff. A ticket opens
// the ticket panel (PB-013..PB-018). Only real data is shown: the design's batch assign,
// walk-in work orders and merged-report counts have no story behind them yet.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  EmptyList,
  Flags,
  IconTile,
  Panel,
  QueueCard,
  StaffStatusPill,
  type TileTone,
} from '../components/custodian';
import {
  ChevronDownIcon,
  DownloadIcon,
  HourglassIcon,
  InboxIcon,
  ListIcon,
  ShieldIcon,
  SlidersIcon,
  UserCheckIcon,
} from '../components/console-icons';
import {
  AlertIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
  WrenchIcon,
} from '../components/icons';
import { TicketPanel } from '../components/TicketPanel';
import { CategoryTile } from '../components/tickets';
import { ErrorText, Spinner } from '../components/ui';
import { cx } from '../lib/cx';
import {
  dayAndTime,
  type Person,
  type QueueItem,
  type QueueResponse,
  queueCsv,
  type ResponseTarget,
  shortWhen,
  span,
  type Target,
  toLocalInput,
} from '../lib/custodian';
import { priorityLabel, ticketRef, type Priority } from '../lib/tickets';
import { useApi } from '../lib/useApi';
import { useTicketParam } from '../lib/useTicketParam';

/** Filters kept in the URL, so a filtered list can be shared or reloaded. */
const FILTER_KEYS = ['status', 'state', 'category', 'block', 'priority', 'assignee'] as const;

const STATUS_OPTIONS: [string, string][] = [
  ['', 'All open'],
  ['REPORTED,REOPENED', 'Needs review'],
  ['REVIEWED', 'Reviewed'],
  ['ASSIGNED', 'Assigned'],
  ['SCHEDULED', 'Visit scheduled'],
  ['IN_PROGRESS', 'In progress'],
  ['COMPLETED', 'Awaiting sign-off'],
];
const STATE_OPTIONS: [string, string][] = [
  ['', 'Any'],
  ['OVERDUE', 'Breached'],
  ['DUE_SOON', 'Due soon'],
];
const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const PAGE_SIZES = [10, 25, 50];
const REFRESH_MS = 60_000;

/** The status cards: each one is a shortcut for a status or target filter. */
interface StatCard {
  key: string;
  label: string;
  status: string;
  state: string;
  icon: ReactNode;
  tile: TileTone;
  number: string;
  /** Card background when not selected (the breached card is pink in the design). */
  card?: string;
}
const CARDS: StatCard[] = [
  {
    key: 'all',
    label: 'All active',
    status: '',
    state: '',
    icon: <InboxIcon size={18} />,
    tile: 'beige',
    number: 'text-console-ink',
  },
  {
    key: 'breached',
    label: 'SLA breached',
    status: '',
    state: 'OVERDUE',
    icon: <AlertIcon size={18} />,
    tile: 'pink',
    number: 'text-console-red',
    card: 'bg-tertiary-container',
  },
  {
    key: 'scheduled',
    label: 'Visit scheduled',
    status: 'SCHEDULED',
    state: '',
    icon: <CalendarIcon size={18} />,
    tile: 'beige',
    number: 'text-console-ink',
  },
  {
    key: 'progress',
    label: 'In progress',
    status: 'IN_PROGRESS',
    state: '',
    icon: <WrenchIcon size={18} />,
    tile: 'lime',
    number: 'text-console-green-ink',
  },
  {
    key: 'signoff',
    label: 'Awaiting sign-off',
    status: 'COMPLETED',
    state: '',
    icon: <CheckCircleIcon size={18} />,
    tile: 'olive',
    number: 'text-secondary',
  },
];

interface Catalogue {
  categories: { id: string; name: string }[];
}
interface Property {
  property: { name: string; blocks: { id: string; name: string }[] };
}

export function Custodian() {
  const [params, setParams] = useSearchParams();
  const { ticketId, open, close } = useTicketParam();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<
    (typeof FILTER_KEYS)[number],
    string
  >;
  const q = params.get('q') ?? '';

  /** Set (or clear, with '') some URL params at once; closes any open ticket. */
  const setFilters = useCallback(
    (changes: Record<string, string>) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        next.delete('ticket');
        return next;
      }),
    [setParams],
  );

  const path = useMemo(() => {
    const qs = new URLSearchParams();
    if (filters.status) qs.set('status', filters.status);
    if (filters.state) qs.set('state', filters.state);
    if (filters.category) qs.set('categoryId', filters.category);
    if (filters.block) qs.set('blockId', filters.block);
    if (filters.priority) qs.set('priority', filters.priority);
    if (filters.assignee) qs.set('assignee', filters.assignee);
    if (q) qs.set('q', q);
    qs.set('limit', '200');
    return `/custodian/queue?${qs}`;
  }, [
    filters.status,
    filters.state,
    filters.category,
    filters.block,
    filters.priority,
    filters.assignee,
    q,
  ]);

  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const queue = useApi<QueueResponse>(path);
  // Counts for the header and the status cards: `limit=1` returns the summary and one row.
  const all = useApi<QueueResponse>('/custodian/queue?limit=1');
  const scheduled = useApi<QueueResponse>('/custodian/queue?status=SCHEDULED&limit=1');
  const progress = useApi<QueueResponse>('/custodian/queue?status=IN_PROGRESS&limit=1');
  const signoff = useApi<QueueResponse>('/custodian/queue?status=COMPLETED&limit=1');
  const property = useApi<Property>('/properties/mine');
  const staff = useApi<{ staff: Person[] }>('/custodian/staff');

  const reloadQueue = queue.reload;
  const reloadAll = all.reload;
  const reloadScheduled = scheduled.reload;
  const reloadProgress = progress.reload;
  const reloadSignoff = signoff.reload;
  const refresh = useCallback(() => {
    reloadQueue();
    reloadAll();
    reloadScheduled();
    reloadProgress();
    reloadSignoff();
  }, [reloadQueue, reloadAll, reloadScheduled, reloadProgress, reloadSignoff]);

  // Keep the list current while the page is on screen.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const items = queue.data?.tickets ?? [];
  const selected = items.find((i) => i.id === ticketId);
  const summary = all.data?.summary;
  const counts: Record<string, number | undefined> = {
    all: summary?.total,
    breached: summary?.overdue,
    scheduled: scheduled.data?.summary.total,
    progress: progress.data?.summary.total,
    signoff: signoff.data?.summary.total,
  };
  const others = FILTER_KEYS.filter((k) => k !== 'status' && k !== 'state').some((k) => filters[k]);
  const activeCard = CARDS.find(
    (c) => c.status === filters.status && c.state === filters.state,
  )?.key;
  const filtered = Boolean(q || others || filters.status || filters.state);

  return (
    <div className="space-y-4">
      <Header propertyName={property.data?.property.name} summary={summary} />

      {/* Status cards: scroll sideways on a phone. */}
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
        <div className="flex w-max gap-3 lg:grid lg:w-full lg:grid-cols-5" role="tablist">
          {CARDS.map((c) => {
            const on = activeCard === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilters({ status: c.status, state: c.state })}
                className={cx(
                  'flex w-40 items-start justify-between gap-2 rounded-console p-4 text-left transition-colors lg:w-auto',
                  on
                    ? c.key === 'breached'
                      ? 'bg-console-red text-on-tertiary'
                      : 'bg-primary text-on-primary'
                    : cx(c.card ?? 'bg-console-card', 'hover:brightness-[0.98]'),
                )}
              >
                <span className="min-w-0">
                  <span
                    className={cx(
                      'flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase',
                      on
                        ? 'opacity-80'
                        : c.key === 'breached'
                          ? 'text-console-red'
                          : 'text-console-muted',
                    )}
                  >
                    {c.key === 'breached' && (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    )}
                    {c.label}
                  </span>
                  <span
                    className={cx(
                      'mt-1 block text-2xl leading-none font-extrabold',
                      on ? 'text-current' : c.number,
                    )}
                  >
                    {counts[c.key] ?? '–'}
                  </span>
                </span>
                <IconTile
                  tone={c.tile}
                  size="sm"
                  className={cx(
                    on && 'bg-on-primary/15! text-current!',
                    !on && c.key === 'breached' && 'bg-transparent!',
                  )}
                >
                  {c.icon}
                </IconTile>
              </button>
            );
          })}
        </div>
      </div>

      <FilterCard
        q={q}
        filters={filters}
        blocks={property.data?.property.blocks ?? []}
        staff={staff.data?.staff ?? []}
        onChange={setFilters}
      />

      {queue.loading && !queue.data && <Spinner label="Loading the queue…" />}
      {queue.error && <ErrorText>{queue.error.message}</ErrorText>}

      {queue.data &&
        (items.length === 0 ? (
          <EmptyList
            icon={<CheckCircleIcon size={24} />}
            title={filtered ? 'No tickets match' : 'Nothing open'}
            hint={
              filtered
                ? 'Try another card or clear the filters.'
                : 'New reports will appear here as soon as residents send them.'
            }
          />
        ) : (
          <Results
            key={path}
            items={items}
            total={queue.data.summary.total}
            perPage={perPage}
            onPerPage={setPerPage}
            onOpen={(i) => open(i.id)}
          />
        ))}

      <Notes propertyName={property.data?.property.name} staff={staff.data?.staff} />

      {ticketId && (
        <TicketPanel
          key={ticketId}
          ticketId={ticketId}
          initial={selected}
          onClose={close}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

/** "12.5%", "0%", "33.3%". */
const percent = (part: number, whole: number) => {
  const value = whole ? (part / whole) * 100 : 0;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
};

function Header({
  propertyName,
  summary,
}: {
  propertyName?: string;
  summary?: QueueResponse['summary'];
}) {
  return (
    <Panel className="flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-wider text-console-muted uppercase">
          Estates operations <span aria-hidden>•</span>{' '}
          <span className="text-console-green-ink">Triage &amp; dispatch</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl leading-tight font-extrabold text-console-ink lg:text-[1.75rem]">
            Complaints &amp; Work Queue
          </h1>
          {propertyName && (
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-console-muted">
              {propertyName}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-console-body">
          Every open maintenance ticket, the most pressing first, with the time left on its response
          target.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:flex">
        <Metric
          label="Breach risk"
          value={summary ? percent(summary.overdue, summary.total) : '–'}
          valueClass="text-console-red"
          icon={<AlertIcon size={18} />}
          iconClass="bg-tertiary-container text-console-red"
          title="Share of open tickets past their response target"
        />
        <Metric
          label="Unassigned"
          value={summary ? String(summary.unassigned) : '–'}
          valueClass="text-console-green-ink"
          icon={<UserCheckIcon size={18} />}
          iconClass="bg-primary-container text-on-primary-container"
          title="Open tickets with no custodian yet"
        />
      </div>
    </Panel>
  );
}

function Metric({
  label,
  value,
  valueClass,
  icon,
  iconClass,
  title,
}: {
  label: string;
  value: string;
  valueClass: string;
  icon: ReactNode;
  iconClass: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-console bg-surface px-4 py-3" title={title}>
      <div className="min-w-0 flex-1 lg:text-right">
        <p className="text-[11px] font-bold tracking-wide text-console-muted uppercase">{label}</p>
        <p className={cx('text-xl leading-tight font-extrabold', valueClass)}>{value}</p>
      </div>
      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full', iconClass)}>
        {icon}
      </span>
    </div>
  );
}

function FilterCard({
  q,
  filters,
  blocks,
  staff,
  onChange,
}: {
  q: string;
  filters: Record<(typeof FILTER_KEYS)[number], string>;
  blocks: { id: string; name: string }[];
  staff: Person[];
  onChange: (changes: Record<string, string>) => void;
}) {
  const [text, setText] = useState(q);
  const [shown, setShown] = useState(false);
  const catalogue = useApi<Catalogue>('/reporting/fault-categories');
  const active = FILTER_KEYS.filter((k) => filters[k]).length;

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const timer = setTimeout(() => text.trim() !== q && onChange({ q: text.trim() }), 350);
    return () => clearTimeout(timer);
  }, [text, q, onChange]);

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search tickets</span>
          <SearchIcon
            size={18}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-console-muted"
          />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search ticket, room, fault or description"
            className="h-11 w-full rounded-console bg-surface pr-10 pl-10 text-sm text-console-ink outline-none placeholder:text-console-faint focus:ring-2 focus:ring-primary/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {text && (
            <button
              type="button"
              onClick={() => setText('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-console text-console-muted hover:bg-surface-variant"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-expanded={shown}
          className="inline-flex items-center gap-2 rounded-console bg-surface-variant px-4 text-sm font-semibold text-console-ink lg:hidden"
        >
          <SlidersIcon size={16} />
          Filters{active ? ` (${active})` : ''}
        </button>
        {active > 0 && (
          <button
            type="button"
            onClick={() => onChange(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}
            className="hidden items-center gap-2 rounded-console bg-surface-variant px-4 text-sm font-semibold text-console-ink hover:brightness-95 lg:inline-flex"
          >
            <SlidersIcon size={16} />
            Clear filters ({active})
          </button>
        )}
      </div>
      <div
        className={cx(
          'grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6',
          shown ? 'grid' : 'hidden lg:grid',
        )}
      >
        <Field
          label="Status"
          value={filters.status}
          onChange={(v) => onChange({ status: v })}
          options={STATUS_OPTIONS}
        />
        <Field
          label="Category"
          value={filters.category}
          onChange={(v) => onChange({ category: v })}
          options={[
            ['', 'All categories'],
            ...(catalogue.data?.categories.map((c): [string, string] => [c.id, c.name]) ?? []),
          ]}
        />
        <Field
          label="Block"
          value={filters.block}
          onChange={(v) => onChange({ block: v })}
          options={[['', 'All blocks'], ...blocks.map((b): [string, string] => [b.id, b.name])]}
        />
        <Field
          label="Urgency"
          value={filters.priority}
          onChange={(v) => onChange({ priority: v })}
          options={[
            ['', 'All priorities'],
            ...PRIORITIES.map((p): [string, string] => [p, priorityLabel(p)]),
          ]}
        />
        <Field
          label="Response target"
          value={filters.state}
          onChange={(v) => onChange({ state: v })}
          options={STATE_OPTIONS}
        />
        <Field
          label="Assigned to"
          value={filters.assignee}
          onChange={(v) => onChange({ assignee: v })}
          options={[
            ['', 'Anyone'],
            ['me', 'Me'],
            ['unassigned', 'Nobody yet'],
            ...staff.map((s): [string, string] => [s.id, s.name]),
          ]}
        />
        {active > 0 && (
          <button
            type="button"
            onClick={() => onChange(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}
            className="col-span-full text-left text-sm font-semibold text-primary lg:hidden"
          >
            Clear filters
          </button>
        )}
      </div>
    </Panel>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-console-muted">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none truncate rounded-console bg-surface pr-8 pl-3 text-sm font-semibold text-console-ink outline-none focus:ring-2 focus:ring-primary/30"
        >
          {options.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={16}
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-console-muted"
        />
      </span>
    </label>
  );
}

/** Page numbers to show: all of them up to five, otherwise the ends and around the current. */
function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  return shown.flatMap((p, i) => (i && p - shown[i - 1] > 1 ? ['…' as const, p] : [p]));
}

function downloadCsv(items: QueueItem[]) {
  const blob = new Blob(['﻿' + queueCsv(items)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `work-queue-${toLocalInput(new Date()).slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The matching tickets: table on laptops, cards on phones, both paged. */
function Results({
  items,
  total,
  perPage,
  onPerPage,
  onOpen,
}: {
  items: QueueItem[];
  total: number;
  perPage: number;
  onPerPage: (n: number) => void;
  onOpen: (item: QueueItem) => void;
}) {
  const [wanted, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.min(wanted, pages); // the list can shrink on refresh
  const from = (page - 1) * perPage;
  const rows = items.slice(from, from + perPage);

  return (
    <section className="overflow-hidden rounded-console lg:bg-console-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-console bg-surface px-4 py-2.5 text-xs text-console-muted lg:rounded-none lg:px-5">
        <ListIcon size={14} className="text-console-green-ink" />
        <span className="font-bold text-console-ink">
          {total} ticket{total === 1 ? '' : 's'}
        </span>
        <span aria-hidden>•</span>
        <span>Most pressing first, refreshed every minute</span>
        <button
          type="button"
          onClick={() => downloadCsv(items)}
          className="ml-auto inline-flex items-center gap-1.5 font-bold text-console-green-ink hover:underline"
        >
          <DownloadIcon size={14} />
          Export CSV
        </button>
      </div>

      {/* Phone */}
      <div className="space-y-3 pt-3 lg:hidden">
        {rows.map((item) => (
          <QueueCard key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>

      {/* Laptop */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-variant text-[11px] font-bold tracking-wide text-console-nav uppercase">
            <tr>
              <th className="hidden px-3 py-3 xl:table-cell">Ticket</th>
              <th className="px-3 py-3">Room / location</th>
              <th className="hidden px-3 py-3 xl:table-cell">Category</th>
              <th className="px-3 py-3">Issue</th>
              <th className="px-3 py-3">Urgency</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Time left</th>
              <th className="hidden px-3 py-3 xl:table-cell">Reported</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-variant/60">
            {rows.map((item) => (
              <Row key={item.id} item={item} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-console bg-console-card px-4 py-3 text-xs text-console-muted lg:mt-0 lg:rounded-none lg:px-5">
        <span>
          Showing{' '}
          <b className="text-console-ink">
            {from + 1}–{from + rows.length}
          </b>{' '}
          of <b className="text-console-ink">{items.length}</b>
          {total > items.length && ` (the ${items.length} most pressing of ${total})`}
        </span>
        <label className="flex items-center gap-2">
          Rows per page
          <select
            value={perPage}
            onChange={(e) => {
              onPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-console bg-surface px-2 py-1.5 font-semibold text-console-ink outline-none focus:ring-2 focus:ring-primary/30"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {pages > 1 && (
          <nav aria-label="Pages" className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="h-8 rounded-console bg-surface px-3 font-semibold text-console-ink disabled:text-console-faint disabled:opacity-60"
            >
              ‹ Previous
            </button>
            <span className="px-1 font-semibold sm:hidden">
              {page} / {pages}
            </span>
            {pageList(page, pages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="hidden px-1 sm:inline">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={cx(
                    'hidden h-8 min-w-8 rounded-console px-2 font-bold sm:inline-block',
                    p === page ? 'bg-primary text-on-primary' : 'bg-surface text-console-ink',
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={page === pages}
              onClick={() => setPage(page + 1)}
              className="h-8 rounded-console bg-surface px-3 font-semibold text-console-ink disabled:text-console-faint disabled:opacity-60"
            >
              Next ›
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}

const URGENCY: Record<Priority, string> = {
  URGENT: 'bg-error text-on-error',
  HIGH: 'bg-console-peach text-console-peach-ink',
  MEDIUM: 'bg-surface text-console-muted',
  LOW: 'bg-surface text-console-muted',
};

function Row({ item, onOpen }: { item: QueueItem; onOpen: (item: QueueItem) => void }) {
  const visit = item.nextVisit;
  return (
    <tr
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      tabIndex={0}
      aria-label={`${item.faultItem.name}, ${item.room.block.name} room ${item.room.number}`}
      className="cursor-pointer align-top transition-colors hover:bg-surface/70 focus-visible:bg-surface"
    >
      <td className="hidden px-3 py-3.5 xl:table-cell">
        <span className="font-mono text-xs font-bold whitespace-nowrap text-console-ink">
          {ticketRef(item)}
        </span>
      </td>
      <td className="px-3 py-3.5">
        <p className="font-bold text-console-ink">{item.room.block.name}</p>
        <p className="text-xs text-console-faint">Room {item.room.number}</p>
        <div className="mt-1.5">
          <Flags item={item} />
        </div>
      </td>
      <td className="hidden px-3 py-3.5 xl:table-cell">
        <span className="inline-flex items-center gap-1 rounded-console bg-surface-variant py-0.5 pr-2.5 pl-1 text-xs font-semibold whitespace-nowrap text-console-nav">
          <CategoryTile name={item.faultItem.category.name} size="sm" plain />
          {item.faultItem.category.name}
        </span>
      </td>
      <td className="max-w-48 px-3 py-3.5 xl:max-w-56">
        <p className="font-mono text-[11px] font-bold text-console-muted xl:hidden">
          {ticketRef(item)}
        </p>
        <p className="leading-snug font-bold text-console-body">{item.faultItem.name}</p>
        {item.description && (
          <p className="mt-0.5 truncate text-xs text-console-faint">{item.description}</p>
        )}
      </td>
      <td className="px-3 py-3.5">
        <span
          className={cx(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap',
            URGENCY[item.priority],
          )}
        >
          {item.priority === 'URGENT' && <AlertIcon size={12} />}
          {priorityLabel(item.priority)}
        </span>
      </td>
      <td className="px-3 py-3.5">
        <StaffStatusPill
          status={item.status}
          icon={
            item.status === 'SCHEDULED' ? (
              <CalendarIcon size={12} />
            ) : item.status === 'COMPLETED' ? (
              <CheckCircleIcon size={12} />
            ) : undefined
          }
        />
        {visit ? (
          <p className="mt-1 flex items-start gap-1 text-xs text-console-faint">
            <UserIcon size={12} className="mt-0.5 shrink-0" />
            <span>
              {visit.custodian.name} · {shortWhen(visit.scheduledAt)}
            </span>
          </p>
        ) : item.assignee ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-console-faint">
            <UserIcon size={12} className="shrink-0" />
            {item.assignee.name}
          </p>
        ) : item.status === 'COMPLETED' ? (
          <p className="mt-1 text-xs font-semibold text-console-green-ink">Resident to confirm</p>
        ) : null}
      </td>
      <td className="px-3 py-3.5">
        <TimeLeft target={item.target} />
      </td>
      <td className="hidden px-3 py-3.5 text-xs whitespace-nowrap text-console-faint xl:table-cell">
        <Reported iso={item.createdAt} />
      </td>
    </tr>
  );
}

/** PB-012: time left on the response (or repair) target, as the design's last column. */
function TimeLeft({ target }: { target: Target | null }) {
  if (!target) return <span className="text-xs text-console-faint">No target</span>;
  const overdue = target.state === 'OVERDUE';
  const soon = target.state === 'DUE_SOON';
  const Icon = overdue ? AlertIcon : soon ? HourglassIcon : ClockIcon;
  return (
    <div>
      <p
        className={cx(
          'flex items-center gap-1.5 font-bold whitespace-nowrap',
          overdue ? 'text-console-red' : soon ? 'text-console-amber' : 'text-console-green-ink',
        )}
      >
        <Icon size={15} />
        {overdue ? `-${span(target.minutesLeft)}` : `${span(target.minutesLeft)} left`}
      </p>
      <p className="mt-0.5 text-xs text-console-faint">
        {target.clock === 'RESPOND' ? 'Respond' : 'Repair'} by {shortWhen(target.dueAt)}
      </p>
    </div>
  );
}

/** Report time as the design's last column: the day, then the time. */
function Reported({ iso }: { iso: string }) {
  const [day, time] = dayAndTime(iso);
  return (
    <>
      <p className="font-semibold text-console-body">{day}</p>
      <p>{time}</p>
    </>
  );
}

/** "2 h", "24 h", "2 days", "7 days". */
const hours = (h: number) => (h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} h`);
const RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** The design's three notes, filled from the API: targets, ordering, and who can take tickets. */
function Notes({ propertyName, staff }: { propertyName?: string; staff?: Person[] }) {
  const targets = useApi<{ targets: ResponseTarget[] }>('/custodian/targets');
  const general = (targets.data?.targets ?? [])
    .filter((t) => !t.category)
    .sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  const ownTargets = new Set(
    (targets.data?.targets ?? []).flatMap((t) => (t.category ? [t.category.id] : [])),
  ).size;

  return (
    <div className="hidden gap-4 md:grid md:grid-cols-3">
      <Note
        icon={<ShieldIcon size={18} />}
        tone="lime"
        title={`Response targets${propertyName ? ` (${propertyName})` : ''}`}
      >
        {general.length ? (
          <ul className="space-y-0.5">
            {general.map((t) => (
              <li key={t.id}>
                <b className="text-console-ink">{priorityLabel(t.priority)}</b>: respond in{' '}
                {hours(t.respondWithinH)} · repair in {hours(t.resolveWithinH)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No targets set yet.</p>
        )}
        {ownTargets > 0 && (
          <p className="mt-1">
            {ownTargets} categor{ownTargets === 1 ? 'y has' : 'ies have'} their own targets.
          </p>
        )}
      </Note>
      <Note icon={<SlidersIcon size={18} />} tone="beige" title="How this list is ordered">
        <p>
          Breached tickets first, then the nearest deadline, then priority, then the oldest report.
          A ticket turns high risk in the last quarter of its time, and the list refreshes every
          minute.
        </p>
      </Note>
      <Note
        icon={<UsersIcon size={18} />}
        tone="sage"
        title={`Custodians${propertyName ? ` at ${propertyName}` : ''}`}
      >
        {staff === undefined ? null : staff.length ? (
          <p>
            {staff.length} custodian{staff.length === 1 ? '' : 's'} can take tickets:{' '}
            {staff.map((s) => s.name).join(', ')}. Assign one from a ticket&apos;s panel.
          </p>
        ) : (
          <p>No active custodians: new reports go to the hall administrators.</p>
        )}
      </Note>
    </div>
  );
}

function Note({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode;
  tone: TileTone;
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel className="flex items-start gap-3">
      <IconTile tone={tone}>{icon}</IconTile>
      <div className="min-w-0 text-xs leading-relaxed text-console-body">
        <h2 className="mb-1 text-sm leading-snug font-bold text-console-ink">{title}</h2>
        {children}
      </div>
    </Panel>
  );
}
