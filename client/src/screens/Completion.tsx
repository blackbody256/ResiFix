// OWNER: Selina: PB-019, PB-021, PB-025..PB-029. Confirm/dispute repairs, rate.
import { FeaturePlaceholder } from './FeaturePlaceholder';

export function Completion() {
  return (
    <FeaturePlaceholder
      title="Confirm repairs"
      owner="Selina"
      backlog="PB-019, PB-021, PB-025..PB-029"
    >
      <p className="text-sm text-slate-500">
        TODO: confirm or dispute completed repairs (auto-closes after 48 hours), rate the service.
      </p>
    </FeaturePlaceholder>
  );
}
