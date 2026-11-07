// One route per feature area. Add your screen here; keep one file per area under screens/.
import type { ReactElement } from 'react';
import type { Role } from './lib/session';
import { Completion } from './screens/Completion';
import { Custodian } from './screens/Custodian';
import { Properties } from './screens/Properties';
import { Reporting } from './screens/Reporting';
import { Tickets } from './screens/Tickets';

export interface Feature {
  path: string;
  label: string;
  roles?: Role[];
  element: ReactElement;
}

export const features: Feature[] = [
  // OWNER: Amabe / Ayan: PB-005..PB-009
  { path: '/report', label: 'Report', roles: ['RESIDENT'], element: <Reporting /> },
  // OWNER: Ayan: PB-010, PB-011, PB-020, PB-022, PB-023
  { path: '/tickets', label: 'Tickets', element: <Tickets /> },
  // OWNER: Andrew: PB-012..PB-018, PB-024
  {
    path: '/custodian',
    label: 'Work queue',
    roles: ['CUSTODIAN', 'ADMIN'],
    element: <Custodian />,
  },
  // OWNER: Selina: PB-019, PB-021, PB-025..PB-029
  { path: '/completion', label: 'Confirm', roles: ['RESIDENT'], element: <Completion /> },
  // OWNER: Amabe: PB-003, PB-004
  { path: '/properties', label: 'Property', roles: ['ADMIN'], element: <Properties /> },
];
