// OWNER: Andrew (PB-013..PB-018). Everything a custodian does to one ticket, in one panel:
// a right-hand drawer on a laptop, a full-screen sheet on a phone. The next step is the one big
// action; the rest sit in a short "More" row so the panel stays uncluttered.
//   PB-014 review / change category   PB-013 assign   PB-015 book a visit
//   PB-016 move a visit               PB-017 missed   PB-018 start work
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { api, ApiError } from '../lib/api';
import { cx } from '../lib/cx';
import {
  clockLabel,
  nextSlot,
  type Person,
  type QueueItem,
  type QueueResponse,
  TARGET_TONE,
  toLocalInput,
  type Visit,
} from '../lib/custodian';
import { ago, type Priority, priorityLabel, ticketRef, when } from '../lib/tickets';
import { PriorityBadge, StaffStatusPill, TargetBadge } from './custodian';
import {
  AlertIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  CloseIcon,
  PencilIcon,
  UserIcon,
  UsersIcon,
  WrenchIcon,
} from './icons';
import { CategoryTile } from './tickets';
import { Button, ErrorText, Eyebrow, Input, Notice, Spinner, Textarea } from './ui';

/** Statuses the queue can return, used to look a ticket up by id. */
const QUEUE_STATUSES = 'REPORTED,REVIEWED,REOPENED,ASSIGNED,SCHEDULED,IN_PROGRESS,COMPLETED';
const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

interface Detail {
  description: string | null;
  createdAt: string;
  reporter: { name: string; phone: string };
  photos: { id: string; url: string }[];
  visits: Visit[];
}
interface Catalogue {
  categories: { id: string; name: string; items: { id: string; name: string }[] }[];
}

type Mode = 'none' | 'review' | 'assign' | 'book' | 'move' | 'missed' | 'start';

function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  const fields = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)
    ?.fieldErrors;
  const first = fields && Object.values(fields).flat()[0];
  return first ? `${err.message}: ${first}` : err.message;
}

export function TicketPanel({
  ticketId,
  initial,
  onClose,
  onChanged,
}: {
  ticketId: string;
  initial?: QueueItem;
  onClose: () => void;
  /** Called with the updated ticket after every action, so lists can refresh. */
  onChanged: (item: QueueItem) => void;
}) {
  const { user } = useAuth();
  const [item, setItem] = useState<QueueItem | null>(initial ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [mode, setMode] = useState<Mode>('none');
  const [done, setDone] = useState('');
  const [loadError, setLoadError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  const loadDetail = useCallback(() => {
    api
      .get<{ ticket: Detail }>(`/tickets/${ticketId}`)
      .then((r) => setDetail(r.ticket))
      .catch(() => setDetail(null));
  }, [ticketId]);

  useEffect(() => {
    if (!initial) {
      api
        .get<QueueResponse>(
          `/custodian/queue?status=${QUEUE_STATUSES}&q=${encodeURIComponent(ticketId)}`,
        )
        .then((r) =>
          r.tickets[0] ? setItem(r.tickets[0]) : setLoadError('This ticket is not open any more.'),
        )
        .catch((e) => setLoadError(errorText(e)));
    }
    loadDetail();
  }, [ticketId, initial, loadDetail]);

  // Close on Escape; keep the page behind from scrolling on phones.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  function applied(next: QueueItem, message: string) {
    setItem(next);
    setMode('none');
    setDone(message);
    loadDetail();
    onChanged(next);
  }

  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 hidden bg-on-surface/30 lg:block"
      />
      <aside className="absolute inset-0 flex flex-col bg-secondary-container lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[30rem] lg:bg-surface lg:shadow-2xl">
        <header className="flex items-center gap-2 bg-surface px-4 py-3 shadow-sm">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-variant"
            aria-label="Back to the list"
          >
            <ArrowLeftIcon size={22} className="lg:hidden" />
            <CloseIcon size={22} className="hidden lg:block" />
          </button>
          <span className="font-mono text-sm font-semibold text-on-surface-variant">
            {item ? ticketRef(item) : ''}
          </span>
          {item && <StaffStatusPill status={item.status} className="ml-auto" />}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!item && !loadError && <Spinner />}
          {loadError && <ErrorText>{loadError}</ErrorText>}
          {item && (
            <>
              <section>
                <div className="flex items-start gap-3">
                  <CategoryTile name={item.faultItem.category.name} active />
                  <div className="min-w-0 flex-1">
                    <h2 id="panel-title" className="text-xl leading-snug font-extrabold">
                      {item.faultItem.name}
                    </h2>
                    <p className="text-sm text-on-surface-variant">
                      {item.room.block.name}, Room {item.room.number} ·{' '}
                      {item.faultItem.category.name}
                    </p>
                  </div>
                  <PriorityBadge priority={item.priority} />
                </div>
                {item.target && (
                  <p
                    className={cx(
                      'mt-3 flex flex-wrap items-center gap-2 rounded-console px-3 py-2 text-sm',
                      TARGET_TONE[item.target.state].soft,
                    )}
                  >
                    <TargetBadge target={item.target} className="bg-surface/70" />
                    <span>
                      {clockLabel(item.target)}, by {when(item.target.dueAt)}
                    </span>
                  </p>
                )}
              </section>

              {done && (
                <Notice tone="success" icon={<CheckCircleIcon size={18} />}>
                  {done}
                </Notice>
              )}

              <NextStep
                item={item}
                mode={mode}
                setMode={(m) => {
                  setDone('');
                  setMode(m);
                }}
                isCustodian={user?.role === 'CUSTODIAN'}
                onApplied={applied}
              />

              <Details item={item} detail={detail} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** The one big action for the ticket's next step, plus the secondary actions. */
function NextStep({
  item,
  mode,
  setMode,
  isCustodian,
  onApplied,
}: {
  item: QueueItem;
  mode: Mode;
  setMode: (m: Mode) => void;
  isCustodian: boolean;
  onApplied: (item: QueueItem, message: string) => void;
}) {
  const visit = item.nextVisit;
  const reviewed = !['REPORTED', 'REOPENED'].includes(item.status);
  const canAssign = ['REVIEWED', 'REOPENED', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'].includes(
    item.status,
  );
  const open = item.status !== 'COMPLETED';
  const cancel = () => setMode('none');

  let primary: { title: string; hint: ReactNode; button: string; mode: Mode; icon: ReactNode };
  switch (item.next) {
    case 'REVIEW':
      primary = {
        title: item.status === 'REOPENED' ? 'Reopened: review it again' : 'New report: review it',
        hint: 'Check the description and photos, then confirm or correct the fault and priority.',
        button: 'Review report',
        mode: 'review',
        icon: <PencilIcon size={18} />,
      };
      break;
    case 'SCHEDULE':
      primary = {
        title: 'Book a repair visit',
        hint: 'Agree a time with the resident so someone is in to open the room.',
        button: 'Book visit',
        mode: 'book',
        icon: <CalendarIcon size={18} />,
      };
      break;
    case 'RESCHEDULE':
      primary = visit
        ? {
            title: 'The resident asked for another time',
            hint: <ChangeRequest visit={visit} />,
            button: 'Move the visit',
            mode: 'move',
            icon: <CalendarIcon size={18} />,
          }
        : {
            title: 'The last visit was missed',
            hint: 'Book a new time. The resident has been told the ticket stays open.',
            button: 'Book a new visit',
            mode: 'book',
            icon: <CalendarIcon size={18} />,
          };
      break;
    case 'VISIT':
      primary = {
        title: `Visit ${when(visit!.scheduledAt)}`,
        hint: `${visit!.custodian.name}. When you are at the room, start the work.`,
        button: 'Start work',
        mode: 'start',
        icon: <WrenchIcon size={18} />,
      };
      break;
    case 'COMPLETE':
      primary = {
        title: 'Work in progress',
        hint: 'When the repair is done, upload proof of repair (PB-019).',
        button: '',
        mode: 'none',
        icon: null,
      };
      break;
    default:
      primary = {
        title: 'Waiting for the resident',
        hint: 'They confirm the repair or reopen it. It closes by itself after 48 hours.',
        button: '',
        mode: 'none',
        icon: null,
      };
  }

  const forms: Partial<Record<Mode, ReactNode>> = {
    review: <ReviewForm item={item} onCancel={cancel} onApplied={onApplied} />,
    assign: <AssignForm item={item} onCancel={cancel} onApplied={onApplied} />,
    book: (
      <ScheduleForm item={item} isCustodian={isCustodian} onCancel={cancel} onApplied={onApplied} />
    ),
    move: visit && <MoveForm item={item} visit={visit} onCancel={cancel} onApplied={onApplied} />,
    missed: visit && (
      <MissedForm item={item} visitId={visit.id} onCancel={cancel} onApplied={onApplied} />
    ),
    start: <StartForm item={item} onCancel={cancel} onApplied={onApplied} />,
  };

  const secondary: { label: string; mode: Mode; show: boolean }[] = [
    { label: 'Move visit', mode: 'move', show: Boolean(visit) && item.next !== 'RESCHEDULE' },
    { label: 'Mark missed', mode: 'missed', show: Boolean(visit) },
    { label: 'Change category', mode: 'review', show: reviewed && open },
    { label: item.assignee ? 'Reassign' : 'Assign', mode: 'assign', show: canAssign },
    { label: 'Book visit', mode: 'book', show: item.status === 'IN_PROGRESS' && !visit },
  ];
  const more = secondary.filter((m) => m.show && m.mode !== primary.mode);

  return (
    <section className="space-y-3">
      <div className="rounded-console bg-console-card p-4">
        <Eyebrow>Next step</Eyebrow>
        <p className="mt-1 text-lg font-bold">{primary.title}</p>
        <div className="mt-1 text-sm text-on-surface-variant">{primary.hint}</div>
        {mode !== 'none' ? (
          <div className="mt-4">{forms[mode]}</div>
        ) : (
          primary.button && (
            <Button className="mt-4 rounded-console!" onClick={() => setMode(primary.mode)}>
              {primary.icon}
              {primary.button}
            </Button>
          )
        )}
      </div>
      {mode === 'none' && more.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {more.map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => setMode(m.mode)}
              className="rounded-console border border-outline-variant bg-console-card px-3.5 py-2 text-sm font-semibold text-console-ink hover:bg-surface"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ChangeRequest({ visit }: { visit: NonNullable<QueueItem['nextVisit']> }) {
  if (!visit.changeRequest) return null;
  return (
    <span className="block">
      Booked for {when(visit.scheduledAt)}. They wrote:
      <span className="mt-1 block rounded-console bg-surface-variant/60 px-3 py-2 italic text-on-surface">
        “{visit.changeRequest.message}”
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Forms. Each posts one action and hands the updated ticket back.
// ---------------------------------------------------------------------------------------------

type FormProps = {
  item: QueueItem;
  onCancel: () => void;
  onApplied: (item: QueueItem, message: string) => void;
};

function useSubmit(onApplied: FormProps['onApplied']) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (send: () => Promise<{ ticket: QueueItem }>, message: string) => {
    setBusy(true);
    setError('');
    try {
      const { ticket } = await send();
      onApplied(ticket, message);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function Actions({
  busy,
  label,
  onCancel,
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="rounded-console!"
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button type="submit" className="rounded-console!" disabled={busy}>
        {busy ? 'Saving…' : label}
      </Button>
    </div>
  );
}

const SELECT =
  'w-full rounded-console border border-outline-variant bg-console-card px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

/** PB-014: confirm the report, or correct the fault and priority. */
function ReviewForm({ item, onCancel, onApplied }: FormProps) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [faultItemId, setFaultItemId] = useState(item.faultItem.id);
  const [priority, setPriority] = useState<Priority | ''>('');
  const [note, setNote] = useState('');
  const { busy, error, submit } = useSubmit(onApplied);
  const firstReview = ['REPORTED', 'REOPENED'].includes(item.status);

  useEffect(() => {
    api
      .get<Catalogue>('/reporting/fault-categories')
      .then(setCatalogue)
      .catch(() => undefined);
  }, []);

  function send(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...(faultItemId !== item.faultItem.id && { faultItemId }),
      ...(priority && { priority }),
      ...(note.trim() && { note: note.trim() }),
    };
    void submit(
      () => api.post(`/custodian/tickets/${item.id}/review`, body),
      firstReview
        ? 'Reviewed. The respond clock now uses the confirmed category.'
        : 'Category updated.',
    );
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <Field label="Fault" htmlFor="fault">
        <select
          id="fault"
          className={SELECT}
          value={faultItemId}
          onChange={(e) => setFaultItemId(e.target.value)}
        >
          {!catalogue && <option value={item.faultItem.id}>{item.faultItem.name}</option>}
          {catalogue?.categories.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {c.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Priority" htmlFor="priority">
        <select
          id="priority"
          className={SELECT}
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | '')}
        >
          <option value="">
            {faultItemId === item.faultItem.id
              ? `Keep ${priorityLabel(item.priority).toLowerCase()}`
              : "The fault's usual priority"}
          </option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityLabel(p)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What you found (optional, kept with the report)" htmlFor="note">
        <Textarea
          className="rounded-console!"
          id="note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Actions busy={busy} label={firstReview ? 'Confirm review' : 'Save'} onCancel={onCancel} />
    </form>
  );
}

function useStaff() {
  const [staff, setStaff] = useState<Person[]>([]);
  useEffect(() => {
    api
      .get<{ staff: Person[] }>('/custodian/staff')
      .then((r) => setStaff(r.staff))
      .catch(() => undefined);
  }, []);
  return staff;
}

/** PB-013: give the ticket to a custodian. */
function AssignForm({ item, onCancel, onApplied }: FormProps) {
  const staff = useStaff();
  const [assigneeId, setAssigneeId] = useState(item.assignee?.id ?? '');
  const { busy, error, submit } = useSubmit(onApplied);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const who = staff.find((s) => s.id === assigneeId)?.name ?? 'them';
        void submit(
          () => api.post(`/custodian/tickets/${item.id}/assign`, { assigneeId }),
          `Assigned to ${who}.`,
        );
      }}
      className="space-y-3"
    >
      <Field label="Custodian" htmlFor="assignee">
        <select
          id="assignee"
          className={SELECT}
          value={assigneeId}
          required
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="" disabled>
            Choose a custodian
          </option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <ErrorText>{error}</ErrorText>
      <Actions busy={busy} label="Assign" onCancel={onCancel} />
    </form>
  );
}

/** PB-015: book a visit; the resident is told the time. */
function ScheduleForm({
  item,
  isCustodian,
  onCancel,
  onApplied,
}: FormProps & { isCustodian: boolean }) {
  const staff = useStaff();
  const [at, setAt] = useState(() => toLocalInput(nextSlot()));
  const [custodianId, setCustodianId] = useState(item.assignee?.id ?? '');
  const [notes, setNotes] = useState('');
  const { busy, error, submit } = useSubmit(onApplied);
  const needsVisitor = !item.assignee && !isCustodian;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const scheduledAt = new Date(at);
        void submit(
          () =>
            api.post(`/custodian/tickets/${item.id}/visits`, {
              scheduledAt: scheduledAt.toISOString(),
              ...(custodianId && { custodianId }),
              ...(notes.trim() && { notes: notes.trim() }),
            }),
          `Visit booked for ${when(scheduledAt.toISOString())}. The resident has been told.`,
        );
      }}
      className="space-y-3"
    >
      <Field label="When" htmlFor="at">
        <Input
          className="rounded-console!"
          id="at"
          type="datetime-local"
          required
          value={at}
          min={toLocalInput(new Date())}
          onChange={(e) => setAt(e.target.value)}
        />
      </Field>
      <Field label="Who visits" htmlFor="visitor">
        <select
          id="visitor"
          className={SELECT}
          value={custodianId}
          required={needsVisitor}
          onChange={(e) => setCustodianId(e.target.value)}
        >
          <option value="">
            {item.assignee
              ? `${item.assignee.name} (assigned)`
              : isCustodian
                ? 'Me'
                : 'Choose a custodian'}
          </option>
          {staff
            .filter((s) => s.id !== item.assignee?.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Note for the resident (optional)" htmlFor="visit-notes">
        <Input
          className="rounded-console!"
          id="visit-notes"
          maxLength={300}
          placeholder="e.g. Please leave the bathroom clear"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Actions busy={busy} label="Book visit" onCancel={onCancel} />
    </form>
  );
}

/** PB-016: move the booked visit, e.g. after the resident asked for another time. */
function MoveForm({
  item,
  visit,
  onCancel,
  onApplied,
}: FormProps & { visit: NonNullable<QueueItem['nextVisit']> }) {
  const current = new Date(visit.scheduledAt);
  const [at, setAt] = useState(() => toLocalInput(current > new Date() ? current : nextSlot()));
  const { busy, error, submit } = useSubmit(onApplied);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const scheduledAt = new Date(at);
        void submit(
          () =>
            api.patch(`/custodian/visits/${visit.id}`, { scheduledAt: scheduledAt.toISOString() }),
          `Visit moved to ${when(scheduledAt.toISOString())}. The resident has been told.`,
        );
      }}
      className="space-y-3"
    >
      {visit.changeRequest && item.next !== 'RESCHEDULE' && (
        <Notice tone="warning" icon={<AlertIcon size={18} />}>
          The resident wrote: “{visit.changeRequest.message}”
        </Notice>
      )}
      <Field label="New time" htmlFor="move-at">
        <Input
          className="rounded-console!"
          id="move-at"
          type="datetime-local"
          required
          value={at}
          min={toLocalInput(new Date())}
          onChange={(e) => setAt(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Actions busy={busy} label="Move visit" onCancel={onCancel} />
    </form>
  );
}

const MISSED_REASONS = [
  { value: 'RESIDENT_ABSENT', label: 'Nobody was in to open the room' },
  { value: 'NO_ACCESS', label: 'I could not get to the fault' },
  { value: 'CUSTODIAN_UNAVAILABLE', label: 'I could not make it' },
  { value: 'OTHER', label: 'Something else' },
] as const;

/** PB-017: the visit did not happen; the ticket stays open for a new time. */
function MissedForm({ item, visitId, onCancel, onApplied }: FormProps & { visitId: string }) {
  const visit = item.nextVisit!;
  const [reason, setReason] = useState<(typeof MISSED_REASONS)[number]['value']>('RESIDENT_ABSENT');
  const [notes, setNotes] = useState('');
  const { busy, error, submit } = useSubmit(onApplied);
  const [now] = useState(() => Date.now());
  const notDue = new Date(visit.scheduledAt).getTime() > now + 5 * 60_000;
  if (notDue) {
    return (
      <div className="space-y-3">
        <Notice icon={<CalendarIcon size={18} />}>
          This visit is booked for {when(visit.scheduledAt)}. You can record it as missed once that
          time has come; to change it now, move it instead.
        </Notice>
        <Button variant="outline" className="rounded-console!" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(
          () =>
            api.post(`/custodian/visits/${visitId}/missed`, {
              reason,
              ...(notes.trim() && { notes: notes.trim() }),
            }),
          'Recorded as missed. The resident has been told the ticket stays open; book a new time.',
        );
      }}
      className="space-y-3"
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">What happened?</legend>
        {MISSED_REASONS.map((r) => (
          <label
            key={r.value}
            className={cx(
              'flex cursor-pointer items-center gap-3 rounded-console border px-3 py-2.5 text-sm',
              reason === r.value
                ? 'border-primary bg-primary-container/50'
                : 'border-outline-variant bg-surface',
            )}
          >
            <input
              type="radio"
              name="reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="accent-primary"
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <Field
        label={
          reason === 'OTHER'
            ? 'What happened (shared with the resident)'
            : 'Note (optional, shared with the resident)'
        }
        htmlFor="missed-notes"
      >
        <Textarea
          className="rounded-console!"
          id="missed-notes"
          rows={2}
          maxLength={300}
          required={reason === 'OTHER'}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Actions busy={busy} label="Record missed" onCancel={onCancel} />
    </form>
  );
}

/** PB-018: the custodian is at the room. Arrival is what meets the response target. */
function StartForm({ item, onCancel, onApplied }: FormProps) {
  const { busy, error, submit } = useSubmit(onApplied);
  const visit = item.nextVisit;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(
          () => api.post(`/custodian/tickets/${item.id}/start`, visit ? { visitId: visit.id } : {}),
          'Work started. The resident has been told.',
        );
      }}
      className="space-y-3"
    >
      <p className="text-sm">
        {visit
          ? `Records your arrival for the visit booked ${when(visit.scheduledAt)}.`
          : 'No visit is booked, so this records a walk-in visit now.'}
      </p>
      <ErrorText>{error}</ErrorText>
      <Actions busy={busy} label="Start work now" onCancel={onCancel} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

/** Context under the actions: the report, the photos, who reported it, the visits so far. */
function Details({ item, detail }: { item: QueueItem; detail: Detail | null }) {
  const past = (detail?.visits ?? []).filter((v) => v.arrivedAt || v.missed);
  return (
    <section className="space-y-3 rounded-console bg-console-card p-4">
      <Eyebrow>The report</Eyebrow>
      {item.description && <p className="whitespace-pre-line">{item.description}</p>}
      {detail?.photos.length ? (
        <div className="grid grid-cols-2 gap-2">
          {detail.photos.slice(0, 2).map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
              <img
                src={p.url}
                alt="Photo of the fault"
                loading="lazy"
                className="aspect-square w-full rounded-console object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-on-surface-variant">Reported</dt>
          <dd className="font-semibold">{ago(item.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">Assigned to</dt>
          <dd className="flex items-center gap-1 font-semibold">
            <UsersIcon size={14} /> {item.assignee?.name ?? 'Nobody yet'}
          </dd>
        </div>
      </dl>
      {detail && (
        <div className="flex items-center gap-3 rounded-console bg-surface-variant/50 px-3 py-2 text-sm">
          <UserIcon size={18} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            Reported by <span className="font-semibold">{detail.reporter.name}</span>
          </span>
          <a
            href={`tel:${detail.reporter.phone}`}
            className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-on-primary"
          >
            Call
          </a>
        </div>
      )}
      {past.length > 0 && (
        <div className="space-y-1.5">
          <Eyebrow>Earlier visits</Eyebrow>
          {past.map((v) => (
            <p key={v.id} className="flex items-center gap-2 text-sm">
              <span
                className={cx('h-2 w-2 rounded-full', v.missed ? 'bg-tertiary' : 'bg-success')}
                aria-hidden
              />
              {when(v.scheduledAt)} · {v.custodian.name}
              <span
                className={cx(
                  'ml-auto text-xs font-semibold',
                  v.missed ? 'text-tertiary' : 'text-primary',
                )}
              >
                {v.missed ? 'Missed' : 'Arrived'}
              </span>
            </p>
          ))}
        </div>
      )}
      <Link to={`/tickets?focus=${item.id}`} className="block text-sm font-semibold text-primary">
        Full ticket history
      </Link>
    </section>
  );
}
