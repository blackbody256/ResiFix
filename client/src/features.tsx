// One route per feature area. Add your screen here; keep one file per area under screens/.
// `icon` + `nav` put it in the bottom tab bar (Home is always first, Account always last).
import type { ReactElement } from 'react';
import {
  BuildingIcon,
  CalendarIcon,
  PlusCircleIcon,
  TicketIcon,
  WrenchIcon,
  ChartIcon,
} from './components/icons';
import type { Role } from './lib/session';
import { Account } from './screens/Account';
import { Analytics } from './screens/Analytics';
import { Completion } from './screens/Completion';
import { Custodian } from './screens/Custodian';
import { Notifications } from './screens/Notifications';
import { Properties } from './screens/Properties';
import { Reporting } from './screens/Reporting';
import { Tickets } from './screens/Tickets';
import { Visits } from './screens/Visits';

export interface Feature {
  path: string;
  label: string;
  roles?: Role[];
  element: ReactElement;
  /** Shown in the bottom tab bar when true. */
  nav?: boolean;
  icon?: typeof TicketIcon;
}

export const features: Feature[] = [
  // OWNER: Amabe / Ayan: PB-005..PB-009
  {
    path: '/report',
    label: 'Report',
    roles: ['RESIDENT'],
    element: <Reporting />,
    nav: true,
    icon: PlusCircleIcon,
  },
  // OWNER: Andrew: PB-012..PB-018, PB-024
  {
    path: '/custodian',
    label: 'Work queue',
    roles: ['CUSTODIAN', 'ADMIN'],
    element: <Custodian />,
    nav: true,
    icon: WrenchIcon,
  },
  // OWNER: Andrew: PB-015..PB-018. Booked visits and work under way.
  {
    path: '/visits',
    label: 'Visits',
    roles: ['CUSTODIAN', 'ADMIN'],
    element: <Visits />,
    nav: true,
    icon: CalendarIcon,
  },
  // OWNER: Ayan: PB-010, PB-011, PB-020, PB-022, PB-023
  { path: '/tickets', label: 'Tickets', element: <Tickets />, nav: true, icon: TicketIcon },
  // OWNER: Amabe: PB-003, PB-004
  {
    path: '/properties',
    label: 'Property',
    roles: ['ADMIN'],
    element: <Properties />,
    nav: true,
    icon: BuildingIcon,
  },
  {
    path: '/analytics',
    label: 'Analytics',
    roles: ['ADMIN'],
    element: <Analytics />,
    nav: true,
    icon: ChartIcon,
  },
  // OWNER: Ayan: PB-023. Opened from the bell in the top bar.
  { path: '/notifications', label: 'Updates', element: <Notifications /> },
  // OWNER: Ayan: PWA shell. Profile, notification settings, sign out.
  { path: '/account', label: 'Account', element: <Account /> },
  // OWNER: Selina: PB-019, PB-020 (API), PB-021, PB-026..PB-029. Residents confirm a repair
  // from the ticket itself (Tickets, PB-020 UI), so this is no longer in the tab bar.
  { path: '/completion', label: 'Confirm', roles: ['RESIDENT'], element: <Completion /> },
];
