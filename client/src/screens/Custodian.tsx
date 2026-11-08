// OWNER: Andrew: PB-012..PB-018, PB-024. Work queue, review, visits.
import { FeaturePlaceholder } from './FeaturePlaceholder';

export function Custodian() {
  return (
    <FeaturePlaceholder title="Work queue" owner="Andrew" backlog="PB-012..PB-018, PB-024">
      <p className="text-sm text-slate-500">
        TODO: assigned tickets, schedule visits, mark missed, upload repair proof.
      </p>
    </FeaturePlaceholder>
  );
}
