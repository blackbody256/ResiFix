// OWNER: Amabe / Ayan: PB-005..PB-009. Resident fault reporting.
import { ErrorText } from '../components/ui';
import { useApi } from '../lib/useApi';
import { FeaturePlaceholder, Loading } from './FeaturePlaceholder';

interface CategoriesResponse {
  categories: { id: string; name: string; items: { id: string; name: string }[] }[];
}

export function Reporting() {
  const { data, error, loading } = useApi<CategoriesResponse>('/reporting/fault-categories');
  return (
    <FeaturePlaceholder title="Report a fault" owner="Amabe / Ayan" backlog="PB-005..PB-009">
      {loading && <Loading />}
      <ErrorText>{error?.message}</ErrorText>
      <ul className="space-y-1">
        {data?.categories.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong>: {c.items.map((i) => i.name).join(', ')}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-slate-500">
        TODO: report form with photo upload (POST /api/reporting/tickets/:id/photos).
      </p>
    </FeaturePlaceholder>
  );
}
