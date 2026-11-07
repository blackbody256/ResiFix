// OWNER: Amabe: PB-003, PB-004. Property, blocks, rooms, occupancy.
import { ErrorText } from '../components/ui';
import { useApi } from '../lib/useApi';
import { FeaturePlaceholder, Loading } from './FeaturePlaceholder';

interface PropertyResponse {
  property: {
    name: string;
    blocks: { id: string; name: string; rooms: { id: string; number: string }[] }[];
  };
}

export function Properties() {
  const { data, error, loading } = useApi<PropertyResponse>('/properties/mine');
  return (
    <FeaturePlaceholder
      title={data?.property.name ?? 'Property'}
      owner="Amabe"
      backlog="PB-003, PB-004"
    >
      {loading && <Loading />}
      <ErrorText>{error?.message}</ErrorText>
      <ul className="space-y-1">
        {data?.property.blocks.map((b) => (
          <li key={b.id}>
            <strong>{b.name}</strong>: {b.rooms.map((r) => r.number).join(', ')}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-slate-500">TODO: add/edit blocks, rooms and occupancy.</p>
    </FeaturePlaceholder>
  );
}
