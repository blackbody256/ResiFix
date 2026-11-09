// Ticket presentation helpers shared by Home, Tickets, the report flow and confirmation.
export type TicketStatus =
  | 'REPORTED'
  | 'REVIEWED'
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'STUDENT_CONFIRMED'
  | 'CLOSED'
  | 'REOPENED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface StatusMeta {
  label: string;
  /** Pill colours. */
  pill: string;
  /** Left accent on ticket cards. */
  accent: string;
  open: boolean;
}

export const STATUS: Record<TicketStatus, StatusMeta> = {
  REPORTED: {
    label: 'Under review',
    pill: 'bg-surface-variant text-on-surface-variant',
    accent: 'border-l-outline',
    open: true,
  },
  REVIEWED: {
    label: 'Reviewed',
    pill: 'bg-secondary-container text-on-secondary-container',
    accent: 'border-l-secondary',
    open: true,
  },
  ASSIGNED: {
    label: 'Custodian assigned',
    pill: 'bg-secondary-container text-on-secondary-container',
    accent: 'border-l-secondary',
    open: true,
  },
  SCHEDULED: {
    label: 'Visit scheduled',
    pill: 'bg-primary-container text-on-primary-container',
    accent: 'border-l-primary',
    open: true,
  },
  IN_PROGRESS: {
    label: 'In progress',
    pill: 'bg-primary text-on-primary',
    accent: 'border-l-primary',
    open: true,
  },
  COMPLETED: {
    label: 'Confirm repair',
    pill: 'bg-tertiary-container text-on-tertiary-container',
    accent: 'border-l-tertiary',
    open: true,
  },
  REOPENED: {
    label: 'Reopened',
    pill: 'bg-error-container text-on-error-container',
    accent: 'border-l-error',
    open: true,
  },
  STUDENT_CONFIRMED: {
    label: 'Fixed',
    pill: 'bg-success-container text-on-success-container',
    accent: 'border-l-success',
    open: false,
  },
  CLOSED: {
    label: 'Closed',
    pill: 'bg-success-container text-on-success-container',
    accent: 'border-l-on-success-container',
    open: false,
  },
};

export const isOpen = (status: TicketStatus) => STATUS[status]?.open ?? true;

/** Short, readable reference until the API returns its own (e.g. "#K3F9QZ"). */
export const ticketRef = (t: { id: string; reference?: string | null }) =>
  t.reference ?? `#${t.id.slice(-6).toUpperCase()}`;

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayDiff = (d: Date) => {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(d) - start(new Date())) / 86_400_000);
};

/** "Today, 2:00 PM", "Yesterday, 3:40 PM", "Tomorrow, 9:00 AM", "Tue 12 Nov, 4:00 PM". */
export function when(iso: string): string {
  const d = new Date(iso);
  const diff = dayDiff(d);
  if (diff === 0) return `Today, ${time(d)}`;
  if (diff === -1) return `Yesterday, ${time(d)}`;
  if (diff === 1) return `Tomorrow, ${time(d)}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time(d)}`;
}

/** "35m ago", "5h ago", "3 days ago". */
export function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** "in 3 h", "in 25 min", "3 h ago" relative to now, for deadlines and visits. */
export function relative(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  const abs = Math.abs(mins);
  const span = abs < 60 ? `${abs} min` : `${Math.round(abs / 60)} h`;
  return mins >= 0 ? `in ${span}` : `${span} ago`;
}

export const priorityLabel = (p: Priority) => p.charAt(0) + p.slice(1).toLowerCase();

export type CategoryKind =
  'electrical' | 'plumbing' | 'doors' | 'furniture' | 'sanitation' | 'internet' | 'other';

/** Category name -> kind, for icons and safety hints. Unknown names are "other". */
export function categoryKind(name: string): CategoryKind {
  if (/electri|power|light/i.test(name)) return 'electrical';
  if (/plumb|water|drain/i.test(name)) return 'plumbing';
  if (/door|lock|key|carpent/i.test(name)) return 'doors';
  if (/furni|bed|chair|desk/i.test(name)) return 'furniture';
  if (/sanit|pest|clean/i.test(name)) return 'sanitation';
  if (/internet|lan|wifi|network/i.test(name)) return 'internet';
  return 'other';
}

/** One row of GET /tickets. */
export interface TicketSummary {
  id: string;
  reference?: string | null;
  status: TicketStatus;
  priority: Priority;
  description: string | null;
  createdAt: string;
  dueAt: string | null;
  faultItem: { name: string; category: { id: string; name: string } };
  room: { number: string; block: { name: string } };
  assignee: { id: string; name: string } | null;
  nextVisit: { id: string; scheduledAt: string } | null;
}

export const placeLabel = (t: Pick<TicketSummary, 'room'>) =>
  `${t.room.block.name}, Room ${t.room.number}`;
