// OWNER: Andrew (PB-012..PB-018). Types and helpers for the custodian console, matching
// docs/api-contract.md: GET /custodian/queue, /custodian/staff and the ticket/visit actions.
import { priorityLabel, ticketRef, type Priority, type TicketStatus } from './tickets';

export type TargetState = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

/** PB-012: where a ticket stands against its response target. */
export interface Target {
  /** RESPOND until a custodian acts on it, then RESOLVE until the repair is done. */
  clock: 'RESPOND' | 'RESOLVE';
  dueAt: string;
  respondBy: string;
  resolveBy: string;
  state: TargetState;
  minutesLeft: number;
}

export type NextStep =
  'REVIEW' | 'SCHEDULE' | 'VISIT' | 'RESCHEDULE' | 'COMPLETE' | 'AWAIT_RESIDENT';

export interface Person {
  id: string;
  name: string;
}

/** One row of GET /custodian/queue (PB-013). Rooms, never residents. */
export interface QueueItem {
  id: string;
  reference?: string | null;
  status: TicketStatus;
  priority: Priority;
  description: string | null;
  createdAt: string;
  reopenCount: number;
  room: { id: string; number: string; block: { id: string; name: string } };
  faultItem: { id: string; name: string; category: { id: string; name: string } };
  assignee: Person | null;
  photoCount: number;
  nextVisit: {
    id: string;
    scheduledAt: string;
    custodian: Person;
    /** PB-016: the resident asked for another time. */
    changeRequest: { message: string; requestedAt: string } | null;
  } | null;
  lastMissedVisit: { id: string; scheduledAt: string } | null;
  target: Target | null;
  next: NextStep;
}

export interface QueueResponse {
  tickets: QueueItem[];
  summary: { total: number; overdue: number; dueSoon: number; unassigned: number };
}

export interface Visit {
  id: string;
  scheduledAt: string;
  arrivedAt: string | null;
  missed: boolean;
  notes: string | null;
  custodian: Person;
}

/** GET /custodian/targets (PB-012). `category: null` is the property-wide target. */
export interface ResponseTarget {
  id: string;
  priority: Priority;
  category: { id: string; name: string } | null;
  respondWithinH: number;
  resolveWithinH: number;
}

/**
 * Status names for staff. The resident app words them for residents ("Confirm repair"); a
 * custodian needs to read the same COMPLETED ticket as "Awaiting sign-off".
 */
export const STAFF_STATUS: Record<TicketStatus, { label: string; pill: string }> = {
  REPORTED: { label: 'Under review', pill: 'bg-surface text-console-nav' },
  REVIEWED: { label: 'Reviewed', pill: 'bg-surface text-console-nav' },
  REOPENED: { label: 'Reopened', pill: 'bg-tertiary-container text-console-red' },
  ASSIGNED: { label: 'Assigned', pill: 'bg-surface-variant text-console-nav' },
  SCHEDULED: { label: 'Visit scheduled', pill: 'bg-surface-variant text-console-nav' },
  IN_PROGRESS: { label: 'In progress', pill: 'bg-primary-container text-on-primary-container' },
  COMPLETED: { label: 'Awaiting sign-off', pill: 'bg-console-peach text-console-peach-ink' },
  STUDENT_CONFIRMED: {
    label: 'Fixed',
    pill: 'bg-success-container text-on-success-container',
  },
  CLOSED: { label: 'Closed', pill: 'bg-success-container text-on-success-container' },
};

/** What the next step is called on buttons, and what it means. */
export const NEXT_STEP: Record<NextStep, { action: string; hint: string }> = {
  REVIEW: { action: 'Review', hint: 'Check the report and confirm its category' },
  SCHEDULE: { action: 'Book visit', hint: 'Agree a time to get into the room' },
  VISIT: { action: 'Start work', hint: 'A visit is booked' },
  RESCHEDULE: { action: 'New time', hint: 'The visit needs a new time' },
  COMPLETE: { action: 'Finish', hint: 'Work started: upload proof of repair' },
  AWAIT_RESIDENT: { action: 'View', hint: 'Waiting for the resident to confirm' },
};

/** Colours for each target state (soft = background + text). */
export const TARGET_TONE: Record<TargetState, { text: string; soft: string; label: string }> = {
  OVERDUE: {
    text: 'text-console-red',
    soft: 'bg-tertiary-container text-console-red',
    label: 'Overdue',
  },
  DUE_SOON: {
    text: 'text-console-peach-ink',
    soft: 'bg-console-peach text-console-peach-ink',
    label: 'Due soon',
  },
  ON_TRACK: {
    text: 'text-primary',
    soft: 'bg-primary-container text-on-primary-container',
    label: 'On track',
  },
};

/** Compact duration, as the design writes it: "45m", "1h 15m", "3h", "2d". */
export function span(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h >= 48) return `${Math.round(h / 24)}d`;
  return m % 60 && h < 10 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** "2h 15m left", "Overdue by 3h". */
export function timeLeft(target: Target): string {
  return target.minutesLeft < 0
    ? `Overdue by ${span(target.minutesLeft)}`
    : `${span(target.minutesLeft)} left`;
}

export type PillTone = 'red' | 'darkred' | 'orange' | 'beige' | 'green' | 'cream' | 'pink';

/** The target as the design's status pill: "Breached 3h", "High risk · 1h 15m left", "Due in 45m". */
export function targetPill(target: Target): { tone: PillTone; text: string } {
  if (target.state === 'OVERDUE')
    return { tone: 'red', text: `Breached ${span(target.minutesLeft)}` };
  if (target.state === 'DUE_SOON')
    return { tone: 'orange', text: `High risk · ${span(target.minutesLeft)} left` };
  return { tone: 'beige', text: `Due in ${span(target.minutesLeft)}` };
}

/** Which clock a target is on, in words for the panel. */
export const clockLabel = (t: Target) => (t.clock === 'RESPOND' ? 'to respond' : 'to repair');

/** A Date as the value of an <input type="datetime-local">, in the device's time zone. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Next whole hour from now, at least 30 minutes away: a sensible default visit time. */
export function nextSlot(now = new Date()): Date {
  const d = new Date(now.getTime() + 30 * 60_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** ["Today", "2:00 PM"], ["Yesterday", "9:15 AM"], ["Sat 7 Nov", "10:53 AM"]: for table cells. */
export function dayAndTime(iso: string, now = new Date()): [string, string] {
  const d = new Date(iso);
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  const day =
    days === 0
      ? 'Today'
      : days === -1
        ? 'Yesterday'
        : days === 1
          ? 'Tomorrow'
          : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return [day, clock(d)];
}

/** "2:00 PM" today, otherwise "Tomorrow 9:00 AM", "Sat 7 Nov 10:53 AM": a deadline in a cell. */
export function shortWhen(iso: string, now = new Date()): string {
  const [day, time] = dayAndTime(iso, now);
  return day === 'Today' ? time : `${day} ${time}`;
}

/** Same calendar day on this device. */
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** One CSV cell: quoted when needed, and never read as a formula by a spreadsheet. */
function csvCell(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const localTime = (iso: string | null | undefined) =>
  iso ? toLocalInput(new Date(iso)).replace('T', ' ') : '';

/** The work queue as a CSV file for the estates office (times in the device's time zone). */
export function queueCsv(items: QueueItem[]): string {
  const head = [
    'Ticket',
    'Block',
    'Room',
    'Category',
    'Fault',
    'Description',
    'Priority',
    'Status',
    'Assigned to',
    'Next visit',
    'Target',
    'Due',
    'Reported',
  ];
  const rows = items.map((i) => [
    ticketRef(i),
    i.room.block.name,
    i.room.number,
    i.faultItem.category.name,
    i.faultItem.name,
    i.description ?? '',
    priorityLabel(i.priority),
    STAFF_STATUS[i.status]?.label ?? i.status,
    i.assignee?.name ?? '',
    localTime(i.nextVisit?.scheduledAt),
    i.target ? TARGET_TONE[i.target.state].label : '',
    localTime(i.target?.dueAt),
    localTime(i.createdAt),
  ]);
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
