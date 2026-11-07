// Route table. Add your screen here; keep one file per feature area under screens/.
import { loginScreen } from './screens/login.js';
import { homeScreen } from './screens/home.js';
import { propertiesScreen } from './screens/properties.js';
import { reportingScreen } from './screens/reporting.js';
import { ticketsScreen } from './screens/tickets.js';
import { custodianScreen } from './screens/custodian.js';
import { completionScreen } from './screens/completion.js';
import { notFoundScreen } from './screens/notFound.js';

const ALL = ['RESIDENT', 'CUSTODIAN', 'ADMIN'];

export const routes = {
  '/login': { screen: loginScreen, public: true },
  '/': { screen: homeScreen },
  '/properties': { screen: propertiesScreen, roles: ['ADMIN'] }, // Amabe
  '/report': { screen: reportingScreen, roles: ['RESIDENT'] }, // Amabe / Ayan
  '/tickets': { screen: ticketsScreen, roles: ALL }, // Ayan
  '/custodian': { screen: custodianScreen, roles: ['CUSTODIAN', 'ADMIN'] }, // Andrew
  '/completion': { screen: completionScreen, roles: ['RESIDENT'] }, // Selina
  '*': { screen: notFoundScreen, public: true },
};

export const navItems = [
  { path: '/', label: 'Home' },
  { path: '/report', label: 'Report', roles: ['RESIDENT'] },
  { path: '/tickets', label: 'Tickets' },
  { path: '/custodian', label: 'Work queue', roles: ['CUSTODIAN', 'ADMIN'] },
  { path: '/completion', label: 'Confirm', roles: ['RESIDENT'] },
  { path: '/properties', label: 'Property', roles: ['ADMIN'] },
];
