// OWNER: Ayan (student app home, PWA shell). Residents: greeting, report a fault, what needs
// them now (repairs to confirm, the next visit) and their open tickets. Staff: shortcuts.
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import {
  ArrowRightIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  PlusCircleIcon,
  TicketIcon,
  WrenchIcon,
} from '../components/icons';
import { CategoryTile, TicketCard } from '../components/tickets';
import { Card, ErrorText, Eyebrow, Spinner } from '../components/ui';
import { isOpen, relative, ticketRef, when, type TicketSummary } from '../lib/tickets';
import { useApi } from '../lib/useApi';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

interface Categories {
  categories: { id: string; name: string; items: { id: string }[] }[];
}

export function Home() {
  const { user } = useAuth();
  if (!user) return null;
  const first = user.name.split(/\s+/)[0];
  return user.role === 'RESIDENT' ? <ResidentHome first={first} /> : <StaffHome first={first} />;
}

function Hello({ first }: { first: string }) {
  const property = useApi<{ property: { name: string } }>('/properties/mine');
  return (
    <div>
      <h1 className="text-3xl leading-tight font-extrabold">
        {greeting()},
        <br />
        {first}!
      </h1>
      {property.data && (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-on-secondary-container">
          <BuildingIcon size={16} /> {property.data.property.name}
        </p>
      )}
    </div>
  );
}

function ResidentHome({ first }: { first: string }) {
  const tickets = useApi<{ tickets: TicketSummary[] }>('/tickets');
  const catalogue = useApi<Categories>('/reporting/fault-categories');

  const all = tickets.data?.tickets ?? [];
  const toConfirm = all.filter((t) => t.status === 'COMPLETED');
  const open = all.filter((t) => isOpen(t.status) && t.status !== 'COMPLETED');
  const nextVisit = open
    .filter((t) => t.nextVisit)
    .sort((a, b) => a.nextVisit!.scheduledAt.localeCompare(b.nextVisit!.scheduledAt))[0];

  return (
    <div className="space-y-5">
      <Hello first={first} />

      <section className="rounded-3xl bg-primary p-5 text-on-primary shadow-md">
        <Link to="/report" className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
            <WrenchIcon size={24} />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-bold">Report a Fault</span>
            <span className="text-sm opacity-85">Takes less than 1 minute</span>
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-on-primary text-primary">
            <PlusCircleIcon size={24} />
          </span>
        </Link>
        {catalogue.data && catalogue.data.categories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {catalogue.data.categories.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                to={`/report?category=${c.id}`}
                className="flex items-center gap-1.5 rounded-full bg-white/15 py-1 pr-3 pl-1 text-sm font-semibold hover:bg-white/25"
              >
                <CategoryTile name={c.name} size="sm" plain className="rounded-full bg-white/20" />
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {tickets.loading && <Spinner />}
      {tickets.error && <ErrorText>{tickets.error.message}</ErrorText>}

      {toConfirm.map((t) => (
        <Link
          key={t.id}
          to={`/tickets?focus=${t.id}`}
          className="flex items-center gap-3 rounded-3xl bg-tertiary-container p-4 text-on-tertiary-container shadow-sm"
        >
          <CheckCircleIcon size={28} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold tracking-wide uppercase">Action required</span>
            <span className="block font-bold">Is the {t.faultItem.name.toLowerCase()} fixed?</span>
            <span className="text-sm">Confirm the repair or tell us it is still a problem.</span>
          </span>
          <ArrowRightIcon size={20} />
        </Link>
      ))}

      {nextVisit && (
        <Card>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            <Eyebrow>Upcoming scheduled visit</Eyebrow>
            <span className="ml-auto rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-semibold text-on-primary-container">
              {relative(nextVisit.nextVisit!.scheduledAt)}
            </span>
          </div>
          <p className="mt-3 text-lg font-bold">{nextVisit.assignee?.name ?? 'Your custodian'}</p>
          <p className="text-sm text-on-surface-variant">
            {nextVisit.faultItem.name} ({ticketRef(nextVisit)})
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
            <CalendarIcon size={16} /> {when(nextVisit.nextVisit!.scheduledAt)}
          </p>
          <Link
            to={`/tickets?focus=${nextVisit.id}`}
            className="mt-3 flex items-center justify-between rounded-2xl bg-surface-variant/60 px-3 py-2 text-sm"
          >
            Not in your room then? Ask for another time.
            <span className="font-semibold text-primary">Details</span>
          </Link>
        </Card>
      )}

      {tickets.data && (
        <section>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-xl font-bold">My open tickets</h2>
            <Link to="/tickets" className="text-sm font-semibold text-primary">
              See all
            </Link>
          </div>
          {open.length === 0 ? (
            <Card className="text-center">
              <TicketIcon size={28} className="mx-auto text-primary" />
              <p className="mt-2 font-semibold">Nothing open right now</p>
              <p className="text-sm text-on-surface-variant">
                If something breaks, report it and we will keep you posted.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {open.slice(0, 3).map((t) => (
                <TicketCard key={t.id} ticket={t} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StaffHome({ first }: { first: string }) {
  const tickets = useApi<{ tickets: TicketSummary[] }>('/tickets');
  const all = tickets.data?.tickets ?? [];
  const count = (pred: (t: TicketSummary) => boolean) => all.filter(pred).length;
  const stats = [
    { label: 'New reports', value: count((t) => t.status === 'REPORTED') },
    { label: 'Open', value: count((t) => isOpen(t.status)) },
    { label: 'Awaiting resident', value: count((t) => t.status === 'COMPLETED') },
  ];
  return (
    <div className="space-y-5">
      <Hello first={first} />
      {tickets.error && <ErrorText>{tickets.error.message}</ErrorText>}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 text-center">
            <p className="text-2xl font-extrabold text-primary">{tickets.data ? s.value : '–'}</p>
            <p className="text-xs font-semibold text-on-surface-variant">{s.label}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/custodian"
          className="flex items-center gap-3 rounded-3xl bg-primary p-5 text-on-primary"
        >
          <WrenchIcon size={24} />
          <span className="flex-1 font-bold">Work queue</span>
          <ArrowRightIcon size={20} />
        </Link>
        <Link
          to="/tickets"
          className="flex items-center gap-3 rounded-3xl bg-surface p-5 shadow-sm"
        >
          <TicketIcon size={24} className="text-primary" />
          <span className="flex-1 font-bold">All tickets</span>
          <ArrowRightIcon size={20} />
        </Link>
      </div>
    </div>
  );
}
