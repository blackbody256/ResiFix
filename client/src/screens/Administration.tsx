import { useState, type SelectHTMLAttributes } from 'react';
import { Card, ErrorText, Input, Notice, Spinner } from '../components/ui';
import { CheckCircleIcon } from '../components/icons';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';

type Priority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

interface Item {
  id: string;
  name: string;
  defaultPriority: Priority;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  items: Item[];
}

interface Target {
  id: string;
  priority: Priority;
  category: { id: string; name: string } | null;
  categoryId: string | null;
  respondWithinH: number;
  resolveWithinH: number;
}

interface CatalogueResponse {
  categories: Category[];
  responseTargets: Target[];
}

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

export function Administration() {
  const { data, error, loading, reload } = useApi<CatalogueResponse>('/properties/catalogue');
  const [categoryName, setCategoryName] = useState('');
  const [target, setTarget] = useState({
    categoryId: '',
    priority: 'MEDIUM' as Priority,
    respondWithinH: '24',
    resolveWithinH: '72',
  });
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setActionError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
      reload();
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The change could not be saved.');
      return false;
    }
  };

  const createCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const success = await run(
      () => api.post('/properties/fault-categories', { name: categoryName }),
      'Category created.',
    );
    if (success) setCategoryName('');
  };

  const createTarget = async (event: React.FormEvent) => {
    event.preventDefault();
    await run(
      () =>
        api.post('/properties/response-targets', {
          categoryId: target.categoryId || null,
          priority: target.priority,
          respondWithinH: Number(target.respondWithinH),
          resolveWithinH: Number(target.resolveWithinH),
        }),
      'Response target created.',
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-primary">Faults &amp; response rules</h1>
        <p className="mt-1 text-on-surface-variant">
          Manage the fault catalogue and the response windows used by the work queue.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-bold">Add fault category</h2>
        <form className="mt-3 flex flex-col gap-3 sm:flex-row" onSubmit={createCategory}>
          <Input
            className="w-full sm:max-w-sm"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            placeholder="e.g. Security"
            required
          />
          <button
            type="submit"
            className="rounded-2xl bg-primary px-5 py-3 font-semibold text-on-primary"
          >
            Add category
          </button>
        </form>
      </Card>

      {loading && <Spinner label="Loading service setup…" />}
      <ErrorText>{error?.message || actionError}</ErrorText>
      {message && (
        <Notice tone="success" icon={<CheckCircleIcon size={18} />}>
          {message}
        </Notice>
      )}

      {data && (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-xl font-bold">Fault catalogue</h2>
              <p className="text-sm text-on-surface-variant">
                Each category contains the fault items residents can report.
              </p>
            </div>
            {data.categories.map((category, index) => (
              <CategoryEditor
                key={category.id}
                category={category}
                defaultOpen={index === 0}
                run={run}
              />
            ))}
          </section>

          <Card>
            <h2 className="text-lg font-bold">Response targets</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Set the allowed hours from report to first response and completed repair.
            </p>
            <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={createTarget}>
              <Select
                value={target.categoryId}
                onChange={(event) => setTarget({ ...target, categoryId: event.target.value })}
              >
                <option value="">All categories</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Select
                value={target.priority}
                onChange={(event) =>
                  setTarget({ ...target, priority: event.target.value as Priority })
                }
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </Select>
              <Input
                type="number"
                min="1"
                value={target.respondWithinH}
                onChange={(event) => setTarget({ ...target, respondWithinH: event.target.value })}
                aria-label="Response hours"
              />
              <Input
                type="number"
                min="1"
                value={target.resolveWithinH}
                onChange={(event) => setTarget({ ...target, resolveWithinH: event.target.value })}
                aria-label="Resolution hours"
              />
              <button
                type="submit"
                className="rounded-2xl bg-primary px-4 py-3 font-semibold text-on-primary"
              >
                Add target
              </button>
            </form>
            <div className="mt-5 space-y-4">
              {groupTargets(data.responseTargets).map((group) => (
                <TargetGroup
                  key={group.key}
                  label={group.label}
                  targets={group.targets}
                  run={run}
                />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function CategoryEditor({
  category,
  defaultOpen,
  run,
}: {
  category: Category;
  defaultOpen: boolean;
  run: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState(category.name);
  const [itemName, setItemName] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  return (
    <details
      className="group rounded-3xl border border-outline-variant/60 bg-surface shadow-sm"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 pr-6 [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-container font-bold text-on-primary-container">
          {category.items.length}
        </span>
        <span className="flex-1 font-bold">{category.name}</span>
        <span className="text-sm text-on-surface-variant">fault items</span>
        <span className="ml-auto shrink-0 rounded-full bg-surface-variant px-2 py-1 text-on-surface-variant transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="border-t border-outline-variant/50 px-5 pt-4 pb-5">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => api.patch(`/properties/fault-categories/${category.id}`, { name }),
              'Category renamed.',
            );
          }}
        >
          <Input
            className="min-w-0 flex-1 sm:max-w-md"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={`Rename ${category.name}`}
          />
          <button
            type="submit"
            className="rounded-2xl border border-outline-variant px-4 py-2 font-semibold text-primary"
          >
            Rename
          </button>
          <button
            type="button"
            className="rounded-2xl border border-error/40 px-4 py-2 font-semibold text-error hover:bg-error-container"
            onClick={() => {
              if (window.confirm(`Delete the empty category "${category.name}"?`)) {
                void run(
                  () => api.delete(`/properties/fault-categories/${category.id}`),
                  'Category deleted.',
                );
              }
            }}
          >
            Delete
          </button>
        </form>
        <div className="mt-4 divide-y divide-outline-variant/50">
          {category.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3 text-sm">
              <span className={`flex-1 ${item.isActive ? '' : 'text-outline line-through'}`}>
                {item.name}
              </span>
              <span className="rounded-full bg-surface-variant px-2 py-1 text-xs font-bold text-on-surface-variant">
                {item.defaultPriority}
              </span>
              <button
                type="button"
                className="rounded-xl border border-outline-variant px-3 py-1 font-semibold text-primary"
                onClick={() =>
                  void run(
                    () =>
                      api.patch(`/properties/fault-items/${item.id}`, { isActive: !item.isActive }),
                    item.isActive ? 'Item deactivated.' : 'Item activated.',
                  )
                }
              >
                {item.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
        <form
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                api.post(`/properties/fault-categories/${category.id}/items`, {
                  name: itemName,
                  defaultPriority: priority,
                }),
              'Item created.',
            ).then((success) => {
              if (success) setItemName('');
            });
          }}
        >
          <Input
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            placeholder="Add a fault item"
            required
          />
          <Select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            aria-label="New item priority"
          >
            {PRIORITIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          <button
            type="submit"
            className="rounded-2xl bg-primary px-4 py-3 font-semibold text-on-primary"
          >
            Add item
          </button>
        </form>
      </div>
    </details>
  );
}

function groupTargets(targets: Target[]) {
  const groups = new Map<string, { key: string; label: string; targets: Target[] }>();
  for (const target of targets) {
    const key = target.categoryId ?? 'all';
    const group = groups.get(key) ?? {
      key,
      label: target.category?.name ?? 'All categories',
      targets: [],
    };
    group.targets.push(target);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function TargetGroup({
  label,
  targets,
  run,
}: {
  label: string;
  targets: Target[];
  run: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/50 bg-surface-variant/30 p-4">
      <h3 className="mb-2 font-bold">{label}</h3>
      <div className="space-y-2">
        {targets.map((target) => (
          <TargetEditor key={target.id} target={target} run={run} />
        ))}
      </div>
    </div>
  );
}

function TargetEditor({
  target,
  run,
}: {
  target: Target;
  run: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [respond, setRespond] = useState(String(target.respondWithinH));
  const [resolve, setResolve] = useState(String(target.resolveWithinH));
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const success = await run(
      () =>
        api.patch(`/properties/response-targets/${target.id}`, {
          categoryId: target.categoryId,
          priority: target.priority,
          respondWithinH: Number(respond),
          resolveWithinH: Number(resolve),
        }),
      'Response target updated.',
    );
    setSaving(false);
    setSaved(success);
    if (success) setEditing(false);
  };
  return (
    <div className="grid items-center gap-3 border-t border-outline-variant/50 pt-3 text-sm sm:grid-cols-[minmax(100px,0.8fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto]">
      <span className="w-fit rounded-full bg-surface px-3 py-2 font-bold text-primary">
        {target.priority}
      </span>
      {editing ? (
        <label className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
          Respond within
          <Input
            className="mt-1"
            type="number"
            min="1"
            value={respond}
            onChange={(event) => setRespond(event.target.value)}
            aria-label={`${target.priority} response hours`}
          />
        </label>
      ) : (
        <div className="rounded-xl border border-outline-variant/60 bg-surface px-3 py-2">
          <p className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
            Respond within
          </p>
          <p className="mt-1 text-base font-bold text-primary">
            {target.respondWithinH} <span className="text-sm font-medium">h</span>
          </p>
        </div>
      )}
      {editing ? (
        <label className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
          Resolve within
          <Input
            className="mt-1"
            type="number"
            min="1"
            value={resolve}
            onChange={(event) => setResolve(event.target.value)}
            aria-label={`${target.priority} resolution hours`}
          />
        </label>
      ) : (
        <div className="rounded-xl border border-outline-variant/60 bg-surface px-3 py-2">
          <p className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
            Resolve within
          </p>
          <p className="mt-1 text-base font-bold text-primary">
            {target.resolveWithinH} <span className="text-sm font-medium">h</span>
          </p>
        </div>
      )}
      {editing ? (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-primary px-3 py-2 font-semibold text-on-primary"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="rounded-xl border border-outline-variant px-3 py-2 font-semibold text-primary"
            onClick={() => {
              setRespond(String(target.respondWithinH));
              setResolve(String(target.resolveWithinH));
              setEditing(false);
            }}
          >
            Cancel
          </button>
          {saved && (
            <span className="text-xs font-semibold text-success" aria-live="polite">
              Saved
            </span>
          )}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-outline-variant px-3 py-2 font-semibold text-primary"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            Edit
          </button>
          {saved && (
            <span className="text-xs font-semibold text-success" aria-live="polite">
              Saved
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        {...props}
        className={`w-full appearance-none rounded-2xl border border-outline-variant bg-surface px-4 py-3 pr-10 ${className}`}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-on-surface-variant"
        aria-hidden="true"
      >
        ⌄
      </span>
    </span>
  );
}
