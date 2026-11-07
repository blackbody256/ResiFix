// OWNER: Ayan: PB-010, PB-011, PB-020, PB-022, PB-023. Ticket list, detail, review.
import { Badge, ErrorText } from '../components/ui';
import { useApi } from '../lib/useApi';
import { FeaturePlaceholder, Loading } from './FeaturePlaceholder';

interface TicketsResponse {
  tickets: {
    id: string;
    status: string;
    faultItem: { name: string };
    room: { number: string; block: { name: string } };
  }[];
}

export function Tickets() {
  const { data, error, loading } = useApi<TicketsResponse>('/tickets');
  return (
    <FeaturePlaceholder
      title="Tickets"
      owner="Ayan"
      backlog="PB-010, PB-011, PB-020, PB-022, PB-023"
    >
      {loading && <Loading />}
      <ErrorText>{error?.message}</ErrorText>
      {data && data.tickets.length === 0 && <p>No tickets yet.</p>}
      <ul className="space-y-2">
        {data?.tickets.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2">
            {t.faultItem.name} · {t.room.block.name} {t.room.number} <Badge>{t.status}</Badge>
          </li>
        ))}
      </ul>
    </FeaturePlaceholder>
  );
}
