// OWNER: Ayan: PB-010, PB-011, PB-020, PB-022, PB-023. Ticket list, detail, timeline.
// The detail view lives at /tickets?focus=<id>: the same link Web Push notifications open.
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge, Card, ErrorText } from '../components/ui';
import { useApi } from '../lib/useApi';
import { Loading } from './FeaturePlaceholder';

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
interface TicketSummary {
  id: string;
  status: string;
  priority: string;
  createdAt: string;
  faultItem: { name: string };
  room: { number: string; block: { name: string } };
}
interface TicketDetail extends TicketSummary {
  description: string | null;
  dueAt: string | null;
  closedAt: string | null;
  reopenCount: number;
  faultItem: { name: string; category: { name: string } };
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
  /** Only sent to the resident who reported the ticket; staff see rating totals only. */
  rating?: { score: number; comment: string | null } | null;
  timeline: {
    id: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    actor: Person | null;
    createdAt: string;
  }[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const label = (status: string) => status.replace(/_/g, ' ').toLowerCase();

export function Tickets() {
  const [params] = useSearchParams();
  const focus = params.get('focus');
  return focus ? <TicketView id={focus} /> : <TicketList />;
}

function TicketList() {
  const { data, error, loading } = useApi<{ tickets: TicketSummary[] }>('/tickets');
  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">Tickets</h1>
      {loading && <Loading />}
      <ErrorText>{error?.message}</ErrorText>
      {data && data.tickets.length === 0 && <p>No tickets yet.</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {data?.tickets.map((t) => (
          <li key={t.id}>
            <Link
              to={`/tickets?focus=${t.id}`}
              className="flex flex-wrap items-center gap-2 py-3 hover:text-brand-700"
            >
              <span className="font-medium">{t.faultItem.name}</span>
              <span className="text-sm text-slate-500">
                {t.room.block.name} {t.room.number} · {when(t.createdAt)}
              </span>
              <span className="ml-auto">
                <Badge>{label(t.status)}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TicketView({ id }: { id: string }) {
  const { data, error, loading } = useApi<{ ticket: TicketDetail }>(
    `/tickets/${encodeURIComponent(id)}`,
  );
  const t = data?.ticket;

  return (
    <div className="space-y-4">
      <Link to="/tickets" className="text-sm text-brand-700 underline dark:text-brand-500">
        ← All tickets
      </Link>
      {loading && <Loading />}
      <ErrorText>{error?.message}</ErrorText>
      {t && (
        <>
          <Card>
            <div className="flex flex-wrap items-start gap-2">
              <div>
                <h1 className="text-xl font-semibold">{t.faultItem.name}</h1>
                <p className="text-sm text-slate-500">
                  {t.faultItem.category.name} · {t.room.block.name}, room {t.room.number}
                </p>
              </div>
              <span className="ml-auto">
                <Badge>{label(t.status)}</Badge>
              </span>
            </div>
            {t.description && <p className="mt-3 whitespace-pre-line">{t.description}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Fact term="Priority">{label(t.priority)}</Fact>
              <Fact term="Reported">{when(t.createdAt)}</Fact>
              <Fact term="Reported by">{t.reporter.name}</Fact>
              <Fact term="Assigned to">{t.assignee?.name ?? 'Not yet assigned'}</Fact>
              {t.dueAt && <Fact term="Response due">{when(t.dueAt)}</Fact>}
              {t.closedAt && <Fact term="Closed">{when(t.closedAt)}</Fact>}
              {t.reopenCount > 0 && <Fact term="Reopened">{t.reopenCount}×</Fact>}
              {t.rating && <Fact term="Rating">{t.rating.score} / 5</Fact>}
            </dl>
            <Photos photos={t.photos} />
          </Card>

          {t.visits.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">Visits</h2>
              <ul className="space-y-2 text-sm">
                {t.visits.map((v) => (
                  <li key={v.id}>
                    {when(v.scheduledAt)} · {v.custodian.name}{' '}
                    {v.missed ? (
                      <Badge>missed</Badge>
                    ) : (
                      v.arrivedAt && <Badge>arrived {when(v.arrivedAt)}</Badge>
                    )}
                    {v.notes && <p className="text-slate-500">{v.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {t.repairProofs.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">Repair proof</h2>
              {t.repairProofs.map((p) => (
                <div key={p.id} className="text-sm">
                  <p className="text-slate-500">
                    {p.submittedBy.name} · {when(p.createdAt)}
                  </p>
                  {p.notes && <p>{p.notes}</p>}
                  <Photos photos={p.photos} />
                </div>
              ))}
            </Card>
          )}

          <Card>
            <h2 className="mb-2 font-semibold">Timeline</h2>
            {t.timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
                {t.timeline.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p>{describe(e)}</p>
                    <p className="text-slate-500">
                      {when(e.createdAt)}
                      {e.actor && ` · ${e.actor.name}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{term}</dt>
      <dd className="first-letter:uppercase">{children}</dd>
    </div>
  );
}

function Photos({ photos }: { photos: Photo[] }) {
  if (!photos.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {photos.map((p, i) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
          <img
            src={p.url}
            alt={`${p.kind === 'PROOF' ? 'Repair' : 'Fault'} photo ${i + 1}`}
            loading="lazy"
            className="h-24 w-24 rounded-lg border border-slate-300 object-cover dark:border-slate-700"
          />
        </a>
      ))}
    </div>
  );
}

function describe(e: TicketDetail['timeline'][number]) {
  if (e.action === 'ticket.response_target_missed') return 'Response target missed';
  if (e.action === 'ticket.auto_closed') return 'Closed automatically after no response';
  if (e.fromStatus && e.toStatus) return `Status: ${label(e.fromStatus)} → ${label(e.toStatus)}`;
  if (e.toStatus) return `Status: ${label(e.toStatus)}`;
  return e.action.replace(/^ticket\./, '').replace(/[._]/g, ' ');
}
