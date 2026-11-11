import { useState } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Card, ErrorText, Input, Spinner, StatCard } from '../components/ui';
import { useApi } from '../lib/useApi';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
);

interface Summary {
  sampleSize: number;
  averageMinutes: number | null;
  medianMinutes: number | null;
  withinTarget: number;
  overdue: number;
}

interface StatsResponse {
  range: { from: string | null; to: string | null };
  totals: { reported: number; responded: number; completed: number };
  response: Summary;
  repair: Summary;
  byPriority: {
    priority: string;
    reported: number;
    responded: number;
    completed: number;
    averageResponseMinutes: number | null;
    averageRepairMinutes: number | null;
  }[];
  daily: {
    date: string;
    reported: number;
    responded: number;
    completed: number;
    averageResponseMinutes: number | null;
    averageRepairMinutes: number | null;
  }[];
}

interface FaultCount {
  id: string;
  name: string;
  group: string | null;
  reports: number;
  lastReportedAt: string;
}

interface RoomFaultCount {
  id: string;
  room: string;
  block: string;
  faultItem: string;
  category: string;
  reports: number;
  lastReportedAt: string;
}

interface RecurringFaultResponse {
  totalReports: number;
  byCategory: FaultCount[];
  byItem: FaultCount[];
  byBlock: FaultCount[];
  byRoom: FaultCount[];
  byRoomFault: RoomFaultCount[];
}

const minutes = (value: number | null) => {
  if (value === null) return '—';
  if (value < 60) return `${value} min`;
  return `${(value / 60).toFixed(value % 60 ? 1 : 0)} h`;
};

const queryDate = (value: string, endOfDay = false) =>
  value ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : '';

export function Analytics() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedRange, setAppliedRange] = useState({ from: '', to: '' });
  const query = new URLSearchParams();
  if (appliedRange.from) query.set('from', queryDate(appliedRange.from));
  if (appliedRange.to) query.set('to', queryDate(appliedRange.to, true));
  const path = `/completion/stats${query.size ? `?${query.toString()}` : ''}`;
  const { data, error, loading } = useApi<StatsResponse>(path);
  const recurringPath = `/completion/recurring-faults${query.size ? `?${query.toString()}` : ''}`;
  const {
    data: recurring,
    error: recurringError,
    loading: recurringLoading,
  } = useApi<RecurringFaultResponse>(recurringPath);
  const rangeError = from && to && from > to ? 'Choose a start date before the end date.' : '';

  const trendLabels = data?.daily.map((day) => day.date.slice(5)) ?? [];
  const trendData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Reported',
        data: data?.daily.map((day) => day.reported) ?? [],
        borderColor: '#0f766e',
        backgroundColor: '#0f766e',
        tension: 0.3,
      },
      {
        label: 'Completed',
        data: data?.daily.map((day) => day.completed) ?? [],
        borderColor: '#d97706',
        backgroundColor: '#d97706',
        tension: 0.3,
      },
    ],
  };
  const priorityData = {
    labels: data?.byPriority.map((item) => item.priority) ?? [],
    datasets: [
      {
        label: 'Average response (minutes)',
        data: data?.byPriority.map((item) => item.averageResponseMinutes) ?? [],
        backgroundColor: '#0f766e',
      },
      {
        label: 'Average repair (minutes)',
        data: data?.byPriority.map((item) => item.averageRepairMinutes) ?? [],
        backgroundColor: '#d97706',
      },
    ],
  };
  const recurringItemData = {
    labels:
      recurring?.byItem
        .slice(0, 8)
        .map((item) => (item.group ? `${item.name} · ${item.group}` : item.name)) ?? [],
    datasets: [
      {
        label: 'Reports',
        data: recurring?.byItem.slice(0, 8).map((item) => item.reports) ?? [],
        backgroundColor: '#0f766e',
      },
    ],
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-primary">Response and repair performance</h1>
        <p className="mt-1 text-on-surface-variant">
          Track how quickly faults are answered and resolved.
        </p>
      </div>

      <Card as="div">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rangeError) setAppliedRange({ from, to });
          }}
        >
          <label className="text-sm font-semibold">
            From
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1"
            />
          </label>
          <label className="text-sm font-semibold">
            To
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1"
            />
          </label>
          <button
            type="submit"
            disabled={Boolean(rangeError) || loading}
            className="rounded-2xl bg-primary px-4 py-3 font-semibold text-on-primary hover:bg-brand-600 disabled:opacity-60"
          >
            Apply range
          </button>
          <button
            type="button"
            className="rounded-2xl border border-outline-variant px-4 py-3 font-semibold text-primary hover:bg-surface-variant"
            onClick={() => {
              setFrom('');
              setTo('');
              setAppliedRange({ from: '', to: '' });
            }}
          >
            Reset range
          </button>
        </form>
        {rangeError && <p className="mt-2 text-sm font-medium text-error">{rangeError}</p>}
      </Card>

      {loading && <Spinner label="Loading performance data…" />}
      <ErrorText>{error?.message}</ErrorText>
      {recurringLoading && <Spinner label="Loading recurring-fault data…" />}
      <ErrorText>{recurringError?.message}</ErrorText>

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Reported" value={data.totals.reported} hint="Tickets in range" />
            <StatCard
              label="Avg response"
              value={minutes(data.response.averageMinutes)}
              hint={`${data.response.withinTarget} within target`}
              tone={data.response.overdue ? 'alert' : 'good'}
            />
            <StatCard
              label="Avg repair"
              value={minutes(data.repair.averageMinutes)}
              hint={`${data.repair.withinTarget} within target`}
              tone={data.repair.overdue ? 'alert' : 'good'}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="text-lg font-bold">Ticket volume</h2>
              <p className="mb-4 text-sm text-on-surface-variant">
                Reports received and repairs completed each day.
              </p>
              <div className="relative h-64">
                <Line
                  data={trendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                      x: { title: { display: true, text: 'Date' } },
                      y: { beginAtZero: true, title: { display: true, text: 'Tickets' } },
                    },
                  }}
                />
              </div>
            </Card>
            <Card>
              <h2 className="text-lg font-bold">Time by priority</h2>
              <p className="mb-4 text-sm text-on-surface-variant">
                Average minutes from report to arrival and completion.
              </p>
              <div className="relative h-64">
                <Bar
                  data={priorityData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                      x: { title: { display: true, text: 'Priority' } },
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Average time (minutes)' },
                      },
                    },
                  }}
                />
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Target performance</h2>
              <span className="text-sm text-on-surface-variant">
                {data.response.overdue + data.repair.overdue} overdue measurements
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-140 text-left text-sm">
                <thead className="border-b border-outline-variant text-xs tracking-wide text-on-surface-variant uppercase">
                  <tr>
                    <th className="pb-2">Priority</th>
                    <th className="pb-2">Reported</th>
                    <th className="pb-2">Responded</th>
                    <th className="pb-2">Completed</th>
                    <th className="pb-2">Avg response</th>
                    <th className="pb-2">Avg repair</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPriority.map((item) => (
                    <tr
                      key={item.priority}
                      className="border-b border-outline-variant/50 last:border-0"
                    >
                      <td className="py-3 font-semibold">{item.priority}</td>
                      <td className="py-3">{item.reported}</td>
                      <td className="py-3">{item.responded}</td>
                      <td className="py-3">{item.completed}</td>
                      <td className="py-3">{minutes(item.averageResponseMinutes)}</td>
                      <td className="py-3">{minutes(item.averageRepairMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {recurring && (
            <Card>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Recurring faults</h2>
                  <p className="text-sm text-on-surface-variant">
                    {recurring.totalReports} reports grouped by fault item and location. A repeated
                    item has more than one report in this range.
                  </p>
                </div>
                <span className="rounded-full bg-surface-variant px-3 py-1 text-xs font-bold text-on-surface-variant">
                  {recurring.byItem.filter((item) => item.reports > 1).length} repeated items
                </span>
              </div>
              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="relative h-64">
                  <Bar
                    data={recurringItemData}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      maintainAspectRatio: false,
                      animation: false,
                      scales: {
                        x: {
                          beginAtZero: true,
                          title: { display: true, text: 'Number of reports' },
                        },
                        y: { title: { display: true, text: 'Fault item · category' } },
                      },
                    }}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <FaultBreakdown title="Fault categories" items={recurring.byCategory} />
                  <FaultBreakdown title="Blocks with reports" items={recurring.byBlock} />
                </div>
              </div>
              <RoomFaultTable items={recurring.byRoomFault} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function FaultBreakdown({ title, items }: { title: string; items: FaultCount[] }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-on-surface-variant">{title}</h3>
      {items.length ? (
        <ul className="space-y-1 text-sm">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="truncate">
                {item.name}
                {item.group && <span className="text-on-surface-variant"> · {item.group}</span>}
              </span>
              <span className="shrink-0 font-bold">
                {item.reports} {item.reports === 1 ? 'report' : 'reports'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">No reports in this range.</p>
      )}
    </div>
  );
}

function RoomFaultTable({ items }: { items: RoomFaultCount[] }) {
  return (
    <div className="mt-5 border-t border-outline-variant/60 pt-4">
      <h3 className="text-sm font-bold text-on-surface-variant">
        Rooms and their recurring faults
      </h3>
      <p className="mb-3 text-sm text-on-surface-variant">
        Each row identifies the exact room, block, and fault item being reported.
      </p>
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="border-b border-outline-variant text-xs tracking-wide text-on-surface-variant uppercase">
              <tr>
                <th className="pb-2">Room</th>
                <th className="pb-2">Block</th>
                <th className="pb-2">Fault item</th>
                <th className="pb-2">Category</th>
                <th className="pb-2">Reports</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-outline-variant/50 last:border-0">
                  <td className="py-3 font-semibold">{item.room}</td>
                  <td className="py-3">{item.block}</td>
                  <td className="py-3">{item.faultItem}</td>
                  <td className="py-3">{item.category}</td>
                  <td className="py-3 font-bold">{item.reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">No room-level reports in this range.</p>
      )}
    </div>
  );
}
