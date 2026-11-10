// OWNER: Andrew: PB-012 (targets, overdue flags), PB-013 (prioritised work queue: search and
// filters). Tapping a ticket opens the ticket panel (PB-013..PB-018). Laptop: a table; phone:
// cards. Kept deliberately lighter than the first design (feedback: too congested): one row of
// tabs, one search box, filters behind a button, one action per ticket.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyList, Flags, PriorityBadge, QueueCard, TargetBadge } from '../components/custodian';
import { CheckCircleIcon, ChevronRightIcon, SearchIcon } from '../components/icons';
import { TicketPanel } from '../components/TicketPanel';
import { CategoryTile, StatusPill } from '../components/tickets';
import { ErrorText, Input, Spinner } from '../components/ui';
import { cx } from '../lib/cx';
import { NEXT_STEP, type QueueItem, type QueueResponse } from '../lib/custodian';
import { priorityLabel, ticketRef, when, type Priority } from '../lib/tickets';
import { useApi } from '../lib/useApi';
import { useTicketParam } from '../lib/useTicketParam';

/** Tabs: each is a fixed filter on the queue. */
const VIEWS = [
  { key: 'all', label: 'All open', query: '' },
  { key: 'overdue', label: 'Overdue', query: 'state=OVERDUE' },
  { key: 'soon', label: 'Due soon', query: 'state=DUE_SOON' },
  { key: 'review', label: 'To review', query: 'status=REPORTED,REOPENED' },
  { key: 'mine', label: 'Mine', query: 'assignee=me' },
  { key: 'resident', label: 'Awaiting resident', query: 'status=COMPLETED' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const SELECT =
  'w-full rounded-console border border-outline-variant bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

interface Catalogue {
  categories: { id: string; name: string }[];
}
interface Property {
  property: { blocks: { id: string; name: string }[] };
}

export function Custodian() {
  const [params, setParams] = useSearchParams();
  const { ticketId, open, close } = useTicketParam();
  const view = (params.get('view') ?? 'all') as ViewKey;
  const category = params.get('category') ?? '';
  const block = params.get('block') ?? '';
  const priority = params.get('priority') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('ticket');
      return next;
    });

  const path = useMemo(() => {
    const qs = new URLSearchParams(VIEWS.find((v) => v.key === view)?.query ?? '');
    if (category) qs.set('categoryId', category);
    if (block) qs.set('blockId', block);
    if (priority) qs.set('priority', priority);
    if (q) qs.set('q', q);
    qs.set('limit', '200');
    return `/custodian/queue?${qs}`;
  }, [view, category, block, priority, q]);

  const queue = useApi<QueueResponse>(path);
  const counts = useApi<QueueResponse>('/custodian/queue?limit=1');
  const reload = () => {
    queue.reload();
    counts.reload();
  };
  const items = queue.data?.tickets ?? [];
  const selected = items.find((i) => i.id === ticketId);

  const count: Partial<Record<ViewKey, number>> = counts.data
    ? {
        all: counts.data.summary.total,
        overdue: counts.data.summary.overdue,
        soon: counts.data.summary.dueSoon,
      }
    : {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-console-ink">Complaints &amp; Work Queue</h1>
        <p className="text-sm text-on-surface-variant">
          Open tickets in your property, the most pressing first.
        </p>
      </div>

      {/* Tabs: scroll sideways on a phone. */}
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div className="flex w-max gap-2" role="tablist" aria-label="Which tickets">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setParam('view', v.key === 'all' ? '' : v.key)}
              className={cx(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                view === v.key
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-console-card text-console-nav hover:bg-surface',
              )}
            >
              {v.label}
              {count[v.key] !== undefined && (
                <span
                  className={cx(
                    'rounded-full px-2 text-xs font-bold',
                    view === v.key
                      ? 'bg-on-primary/20'
                      : v.key === 'overdue' && count[v.key]
                        ? 'bg-tertiary text-on-tertiary'
                        : 'bg-surface-variant',
                  )}
                >
                  {count[v.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <Filters q={q} category={category} block={block} priority={priority} onChange={setParam} />

      {queue.loading && !queue.data && <Spinner label="Loading the queue…" />}
      <ErrorText>{queue.error?.message}</ErrorText>

      {queue.data &&
        (items.length === 0 ? (
          <EmptyList
            icon={<CheckCircleIcon size={24} />}
            title={
              view === 'all' && !q && !category && !block && !priority
                ? 'Nothing open'
                : 'No tickets match'
            }
            hint={
              view === 'all' && !q
                ? 'New reports will appear here as soon as residents send them.'
                : 'Try another tab or clear the filters.'
            }
          />
        ) : (
          <>
            {/* Phone */}
            <div className="space-y-3 lg:hidden">
              {items.map((item) => (
                <QueueCard key={item.id} item={item} onOpen={(i) => open(i.id)} />
              ))}
            </div>
            {/* Laptop */}
            <QueueTable items={items} onOpen={(i) => open(i.id)} />
            <p className="text-center text-xs text-on-surface-variant">
              {items.length === queue.data.summary.total
                ? `${items.length} ticket${items.length === 1 ? '' : 's'}`
                : `Showing ${items.length} of ${queue.data.summary.total}`}
            </p>
          </>
        ))}

      {ticketId && (
        <TicketPanel
          key={ticketId}
          ticketId={ticketId}
          initial={selected}
          onClose={close}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function Filters({
  q,
  category,
  block,
  priority,
  onChange,
}: {
  q: string;
  category: string;
  block: string;
  priority: string;
  onChange: (key: string, value: string) => void;
}) {
  const [text, setText] = useState(q);
  const [shown, setShown] = useState(Boolean(category || block || priority));
  const catalogue = useApi<Catalogue>('/reporting/fault-categories');
  const property = useApi<Property>('/properties/mine');
  const active = [category, block, priority].filter(Boolean).length;

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const timer = setTimeout(() => text !== q && onChange('q', text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search tickets</span>
          <SearchIcon
            size={18}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-on-surface-variant"
          />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search room, fault or ticket number"
            className="rounded-console! bg-console-card py-2.5 pl-11"
          />
        </label>
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-expanded={shown}
          className={cx(
            'rounded-console border px-4 text-sm font-semibold',
            shown || active
              ? 'border-primary bg-primary-container text-on-primary-container'
              : 'border-outline-variant bg-surface',
          )}
        >
          Filters{active ? ` (${active})` : ''}
        </button>
      </div>
      {shown && (
        <div className="grid gap-2 rounded-console bg-console-card p-3 sm:grid-cols-3">
          <select
            aria-label="Category"
            className={SELECT}
            value={category}
            onChange={(e) => onChange('category', e.target.value)}
          >
            <option value="">All categories</option>
            {catalogue.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Block"
            className={SELECT}
            value={block}
            onChange={(e) => onChange('block', e.target.value)}
          >
            <option value="">All blocks</option>
            {property.data?.property.blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Priority"
            className={SELECT}
            value={priority}
            onChange={(e) => onChange('priority', e.target.value)}
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
          {active > 0 && (
            <button
              type="button"
              className="text-left text-sm font-semibold text-primary sm:col-span-3"
              onClick={() => {
                onChange('category', '');
                onChange('block', '');
                onChange('priority', '');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Laptop table: four columns and one action. */
function QueueTable({ items, onOpen }: { items: QueueItem[]; onOpen: (item: QueueItem) => void }) {
  return (
    <div className="hidden overflow-hidden rounded-console bg-console-card lg:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-variant/60 text-xs font-bold tracking-wide text-on-surface-variant uppercase">
          <tr>
            <th className="px-4 py-3">Fault</th>
            <th className="px-4 py-3">Room</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Time left</th>
            <th className="px-4 py-3">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50">
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onOpen(item)}
              className="cursor-pointer align-top hover:bg-surface-variant/40"
            >
              <td className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <CategoryTile name={item.faultItem.category.name} />
                  <div className="min-w-0">
                    <p className="font-bold">{item.faultItem.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-mono">{ticketRef(item)}</span>
                      {item.priority !== 'MEDIUM' && (
                        <span className="ml-2 inline-block align-middle">
                          <PriorityBadge priority={item.priority} />
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <p className="font-semibold">Room {item.room.number}</p>
                <p className="text-xs text-on-surface-variant">{item.room.block.name}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1.5">
                  <StatusPill status={item.status} />
                  {item.nextVisit && (
                    <span className="text-xs text-on-surface-variant">
                      Visit {when(item.nextVisit.scheduledAt)}
                    </span>
                  )}
                  <Flags item={item} />
                </div>
              </td>
              <td className="px-4 py-3">
                <TargetBadge target={item.target} />
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(item);
                  }}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap',
                    item.next === 'AWAIT_RESIDENT' || item.next === 'COMPLETE'
                      ? 'bg-surface-variant text-on-surface'
                      : 'bg-primary text-on-primary',
                  )}
                >
                  {NEXT_STEP[item.next].action}
                  <ChevronRightIcon size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
