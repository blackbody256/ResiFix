// OWNER: Andrew: PB-015 (scheduled visits), PB-016 (requests to move), PB-017 (missed visits),
// PB-018 (work in progress). "Repair progress & scheduling" from the design, as one list grouped
// by what needs doing: new times first, then today, then later, then work under way.
import { EmptyList, QueueCard } from '../components/custodian';
import { CalendarIcon } from '../components/icons';
import { TicketPanel } from '../components/TicketPanel';
import { ErrorText, Spinner } from '../components/ui';
import { type QueueItem, type QueueResponse, sameDay } from '../lib/custodian';
import { when } from '../lib/tickets';
import { useApi } from '../lib/useApi';
import { useTicketParam } from '../lib/useTicketParam';

interface Group {
  key: string;
  title: string;
  hint: string;
  items: QueueItem[];
  footer: (item: QueueItem) => string;
}

function group(items: QueueItem[]): Group[] {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const at = (i: QueueItem) => new Date(i.nextVisit!.scheduledAt);
  const byTime = (a: QueueItem, b: QueueItem) => at(a).getTime() - at(b).getTime();
  const booked = items.filter((i) => i.nextVisit && i.next !== 'RESCHEDULE');
  const visitLine = (i: QueueItem) =>
    `${when(i.nextVisit!.scheduledAt)} · ${i.nextVisit!.custodian.name}`;

  const groups: Group[] = [
    {
      key: 'new-time',
      title: 'Needs a new time',
      hint: 'A visit was missed, or the resident asked to move it.',
      items: items.filter((i) => i.next === 'RESCHEDULE'),
      footer: (i) =>
        i.nextVisit?.changeRequest
          ? `They wrote: “${i.nextVisit.changeRequest.message}”`
          : `Missed ${i.lastMissedVisit ? when(i.lastMissedVisit.scheduledAt) : 'visit'}`,
    },
    {
      key: 'late',
      title: 'Past their time',
      hint: 'Start the work, or record the visit as missed.',
      items: booked.filter((i) => at(i) < now).sort(byTime),
      footer: visitLine,
    },
    {
      key: 'today',
      title: 'Later today',
      hint: '',
      items: booked.filter((i) => at(i) >= now && sameDay(at(i), now)).sort(byTime),
      footer: visitLine,
    },
    {
      key: 'later',
      title: 'Coming up',
      hint: '',
      items: booked.filter((i) => at(i) >= tomorrow).sort(byTime),
      footer: visitLine,
    },
    {
      key: 'to-book',
      title: 'Assigned, no visit yet',
      hint: 'Book a time with the resident.',
      items: items.filter((i) => i.status === 'ASSIGNED' && !i.nextVisit),
      footer: (i) => `Assigned to ${i.assignee?.name ?? 'nobody'}`,
    },
    {
      key: 'on-site',
      title: 'Work in progress',
      hint: 'Finish with proof of repair.',
      items: items.filter((i) => i.status === 'IN_PROGRESS' && !i.nextVisit),
      footer: (i) => `${i.assignee?.name ?? 'Custodian'} on the job`,
    },
  ];
  return groups.filter((g) => g.items.length);
}

export function Visits() {
  const queue = useApi<QueueResponse>(
    '/custodian/queue?status=ASSIGNED,SCHEDULED,IN_PROGRESS&limit=200',
  );
  const { ticketId, open, close } = useTicketParam();
  const groups = group(queue.data?.tickets ?? []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-console-ink">
          Repair Progress &amp; Scheduling
        </h1>
        <p className="text-sm text-on-surface-variant">
          Booked repair visits and work under way, what needs you first at the top.
        </p>
      </div>

      {queue.loading && !queue.data && <Spinner />}
      <ErrorText>{queue.error?.message}</ErrorText>

      {queue.data && groups.length === 0 && (
        <EmptyList
          icon={<CalendarIcon size={24} />}
          title="No visits booked"
          hint="Book one from a ticket in the work queue."
        />
      )}

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {groups.map((g) => (
          <section key={g.key} className="space-y-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                {g.title}
                <span className="rounded-full bg-console-card px-2 text-sm">{g.items.length}</span>
              </h2>
              {g.hint && <p className="text-sm text-on-surface-variant">{g.hint}</p>}
            </div>
            {g.items.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                onOpen={(i) => open(i.id)}
                footer={g.footer(item)}
              />
            ))}
          </section>
        ))}
      </div>

      {ticketId && (
        <TicketPanel
          key={ticketId}
          ticketId={ticketId}
          initial={queue.data?.tickets.find((i) => i.id === ticketId)}
          onClose={close}
          onChanged={queue.reload}
        />
      )}
    </div>
  );
}
