// OWNER: Amabe (API) / Ayan (UI): PB-005..PB-009. Resident fault reporting, 3 steps as in the
// Group J design (pages 5-7):
//   1. Location & category   2. Details & photos   3. Availability & review -> submit
//
// Submitting creates the ticket (POST /reporting/tickets, Amabe), then uploads each photo to
// POST /reporting/tickets/:id/photos. A failed photo upload never loses the ticket. Until the
// API exists the form shows "not switched on yet" (501).
// PB-007 (UI): up to two photos, downscaled and re-encoded on the phone (lib/photos.ts).
// PB-008 (UI): availability is collected and sent as `availability`; the API does not store it
//   yet, so the custodian cannot see it until PB-008's backend lands.
//
// TODO(PB-005): offline queue (save the report and send it when the connection is back).
// TODO(PB-006): shared-facility faults (needs a schema change: Ticket.roomId is required).
// TODO(PB-009): offer to follow a matching open fault instead of reporting a duplicate.
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircleIcon,
  CheckIcon,
  LightbulbIcon,
  MoonIcon,
  PencilIcon,
  SendIcon,
  SunIcon,
  SunriseIcon,
  TrashIcon,
  UsersIcon,
} from '../components/icons';
import { CategoryTile } from '../components/tickets';
import {
  Button,
  Card,
  ErrorText,
  Eyebrow,
  Notice,
  Spinner,
  StepBar,
  Textarea,
} from '../components/ui';
import { api, ApiError } from '../lib/api';
import { cx } from '../lib/cx';
import { MAX_PHOTOS, PHOTO_ACCEPT, preparePhoto } from '../lib/photos';
import { categoryKind, type Priority } from '../lib/tickets';
import { rememberRoom, useMyRoom } from '../lib/myRoom';
import { useApi } from '../lib/useApi';

const MAX_DESCRIPTION = 500;
const MIN_DESCRIPTION = 10;
const MAX_ACCESS_NOTE = 120;

interface FaultItem {
  id: string;
  name: string;
  defaultPriority: Priority;
}
interface Category {
  id: string;
  name: string;
  items: FaultItem[];
}

type TimeWindow = 'MORNING' | 'AFTERNOON' | 'EVENING';
const WINDOWS: { id: TimeWindow; label: string; hours: string; icon: ReactNode }[] = [
  { id: 'MORNING', label: 'Morning', hours: '9:00 AM – 12:00 PM', icon: <SunriseIcon size={20} /> },
  { id: 'AFTERNOON', label: 'Afternoon', hours: '2:00 PM – 5:00 PM', icon: <SunIcon size={20} /> },
  { id: 'EVENING', label: 'Evening', hours: '5:00 PM – 7:00 PM', icon: <MoonIcon size={20} /> },
];

/**
 * PB-005 API (Amabe): POST /reporting/tickets { roomId, faultItemId, description? } -> { ticket }.
 * The server rejects a room the resident does not currently live in (404).
 * PB-008: there is nowhere to store availability yet (see docs/amabe-pb006-pb008-pb009-proposal.md),
 * so it is added to the end of the description, where the custodian sees it on the ticket.
 */
interface CreateTicketResponse {
  ticket: { id: string; reference?: string; status: string };
}

interface PickedPhoto {
  file: File;
  preview: string;
}

type Result = { ticketId: string; reference?: string; photoErrors: string[] };

function friendlyError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (err.code) {
    case 'NOT_IMPLEMENTED':
      return 'Reporting is not switched on yet. Please try again later.';
    case 'PAYLOAD_TOO_LARGE':
      return 'The photo is too large (5 MB maximum).';
    default:
      return err.message;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today and the next two days, as the design's day chips. */
function nextDays(count = 3) {
  const base = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Tomorrow'
          : d.toLocaleDateString(undefined, { weekday: 'long' });
    return { iso, label, weekday };
  });
}

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function Reporting() {
  const { data, error, loading } = useApi<{ categories: Category[] }>(
    '/reporting/fault-categories',
  );
  const [result, setResult] = useState<Result | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (result) {
    return (
      <Submitted
        result={result}
        onAnother={() => {
          setResult(null);
          setFormKey((k) => k + 1);
        }}
      />
    );
  }
  return (
    <>
      {loading && <Spinner />}
      {error && <ErrorText>{friendlyError(error)}</ErrorText>}
      {data &&
        (data.categories.length === 0 ? (
          <Card>
            No fault types are set up for your hall yet. Please contact the custodian desk.
          </Card>
        ) : (
          <ReportFlow key={formKey} categories={data.categories} onDone={setResult} />
        ))}
    </>
  );
}

function ReportFlow({
  categories,
  onDone,
}: {
  categories: Category[];
  onDone: (result: Result) => void;
}) {
  const [params] = useSearchParams();
  const preset = categories.find((c) => c.id === params.get('category'));
  const myRoom = useMyRoom();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [categoryId, setCategoryId] = useState(preset?.id ?? '');
  const [faultItemId, setFaultItemId] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [windows, setWindows] = useState<TimeWindow[]>([]);
  const [accessNote, setAccessNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'photos' | 'sending'>('');
  const [dayOptions] = useState(() => nextDays());

  // Release preview object URLs when the flow goes away.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);
  // Each step starts at the top on a phone.
  // Braces matter: newer browsers return a Promise from scrollTo, and an effect may only
  // return a cleanup function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const category = categories.find((c) => c.id === categoryId);
  const item = category?.items.find((i) => i.id === faultItemId);
  const electrical = !!category && categoryKind(category.name) === 'electrical';
  const flagged = !!item && (item.defaultPriority === 'URGENT' || item.defaultPriority === 'HIGH');

  function go(next: 1 | 2 | 3) {
    setError('');
    if (next >= 2 && !myRoom.roomId) return setError('Choose your room.');
    if (next >= 2 && !item) return setError('Choose what is broken.');
    if (next === 3 && description.trim().length < MIN_DESCRIPTION) {
      return setError(`Describe the problem in at least ${MIN_DESCRIPTION} characters.`);
    }
    setStep(next);
  }

  async function addPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow picking the same file again after removing it
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    const problems: string[] = [];
    if (files.length > room) problems.push(`You can add up to ${MAX_PHOTOS} photos.`);
    setBusy('photos');
    const added: PickedPhoto[] = [];
    for (const file of files.slice(0, room)) {
      try {
        const prepared = await preparePhoto(file);
        added.push({ file: prepared, preview: URL.createObjectURL(prepared) });
      } catch (err) {
        problems.push((err as Error).message);
      }
    }
    setBusy('');
    setPhotos((current) => [...current, ...added]);
    setError(problems.join(' '));
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].preview);
    setPhotos(photos.filter((_, i) => i !== index));
    setError(''); // e.g. "up to 2 photos" no longer applies once there is room again
  }

  /** "Available: Tue 11 Nov, Wed 12 Nov · Morning, Evening. Access: roommate is in." */
  function availabilityText() {
    const note = accessNote.trim();
    if (!days.length && !windows.length && !note) return '';
    const when = [
      dayOptions
        .filter((d) => days.includes(d.iso))
        .map((d) => `${d.weekday} ${d.iso.slice(8)}`)
        .join(', '),
      WINDOWS.filter((w) => windows.includes(w.id))
        .map((w) => `${w.label} (${w.hours})`)
        .join(', '),
    ].filter(Boolean);
    return [when.length && `Available: ${when.join(' · ')}.`, note && `Access: ${note}`]
      .filter(Boolean)
      .join(' ');
  }

  async function submit() {
    if (!item || !myRoom.roomId) return setStep(1);
    setBusy('sending');
    setError('');
    let ticketId: string;
    let reference: string | undefined;
    try {
      const { ticket } = await api.post<CreateTicketResponse>('/reporting/tickets', {
        roomId: myRoom.roomId,
        faultItemId: item.id,
        description: [description.trim(), availabilityText()].filter(Boolean).join('\n\n'),
      });
      rememberRoom(myRoom.roomId);
      ticketId = ticket.id;
      reference = ticket.reference;
    } catch (err) {
      setBusy('');
      setError(friendlyError(err));
      return;
    }

    // The ticket exists now: report photo failures but never lose the report.
    const photoErrors: string[] = [];
    for (const { file } of photos) {
      const form = new FormData();
      form.append('photo', file);
      try {
        await api.upload(`/reporting/tickets/${ticketId}/photos`, form);
      } catch (err) {
        photoErrors.push(`${file.name}: ${friendlyError(err)}`);
      }
    }
    setBusy('');
    onDone({ ticketId, reference, photoErrors });
  }

  const header = (title: string, extra?: ReactNode) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-bold tracking-wide text-on-secondary-container uppercase">
        <span>Step {step} of 3</span>
        {extra}
      </div>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <StepBar step={step} total={3} />
    </div>
  );

  const safety = electrical && (
    <Notice tone="warning" icon={<AlertIcon size={18} />}>
      <strong>Electrical safety:</strong> if you see sparks or smell burning, switch off at the main
      switch and do not touch the fitting. For a fire or shock, call the porter desk now.
    </Notice>
  );

  /** Laptop: the step on the left, a sticky "Your report" panel on the right. */
  const frame = (content: ReactNode) => (
    <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
      <div className="lg:col-span-2">{content}</div>
      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Your report</h2>
          <ol className="space-y-2 text-sm">
            {['Location & category', 'Details & photos', 'Availability & review'].map(
              (label, i) => (
                <li key={label} className="flex items-center gap-2">
                  <span
                    className={cx(
                      'grid h-6 w-6 place-items-center rounded-full text-xs font-bold',
                      i + 1 < step && 'bg-primary text-on-primary',
                      i + 1 === step && 'bg-primary-container text-primary ring-2 ring-primary',
                      i + 1 > step && 'bg-surface-variant text-outline',
                    )}
                  >
                    {i + 1 < step ? <CheckIcon size={12} /> : i + 1}
                  </span>
                  <span className={cx(i + 1 === step ? 'font-bold' : 'text-on-surface-variant')}>
                    {label}
                  </span>
                </li>
              ),
            )}
          </ol>
          <dl className="space-y-3 border-t border-outline-variant/60 pt-4 text-sm">
            <div>
              <dt className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
                Room
              </dt>
              <dd className="font-semibold">{myRoom.room?.label ?? 'Not chosen yet'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
                Fault
              </dt>
              <dd className="flex items-center gap-2 font-semibold">
                {category && <CategoryTile name={category.name} size="sm" />}
                {item ? `${category?.name} › ${item.name}` : 'Not chosen yet'}
              </dd>
              {flagged && (
                <dd className="mt-1 inline-block rounded-full bg-tertiary-container px-2 py-0.5 text-xs font-bold text-on-tertiary-container">
                  {item?.defaultPriority === 'URGENT' ? 'Urgent' : 'High priority'}
                </dd>
              )}
            </div>
            {description.trim() && (
              <div>
                <dt className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
                  Description
                </dt>
                <dd className="line-clamp-3">{description.trim()}</dd>
              </div>
            )}
            {photos.length > 0 && (
              <div>
                <dt className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
                  Photos
                </dt>
                <dd className="mt-1 flex gap-2">
                  {photos.map((p, i) => (
                    <img
                      key={p.preview}
                      src={p.preview}
                      alt={`Photo ${i + 1}`}
                      className="h-14 w-14 rounded-xl object-cover"
                    />
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </Card>
        <Notice icon={<LightbulbIcon size={18} />}>
          <strong className="block">What happens next</strong>A custodian reviews your report and
          books a visit. You get an update at each step, and you confirm the fix at the end.
        </Notice>
      </aside>
    </div>
  );

  /* ---------------------------------------------------------------- step 1 */
  if (step === 1) {
    return frame(
      <div className="space-y-5">
        {header('Fault location & category')}

        <section className="space-y-2">
          <Eyebrow>Incident location *</Eyebrow>
          <div className="flex items-center gap-3 rounded-3xl border-2 border-primary bg-surface p-4">
            <CheckCircleIcon size={24} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <label htmlFor="room" className="flex items-center gap-2 font-bold">
                My room
                {myRoom.room && (
                  <span className="rounded-full bg-primary-container px-2 py-0.5 text-xs font-semibold text-on-primary-container">
                    {myRoom.room.label}
                  </span>
                )}
              </label>
              <select
                id="room"
                value={myRoom.roomId}
                onChange={(e) => {
                  myRoom.setRoomId(e.target.value);
                  setError('');
                }}
                disabled={myRoom.loading}
                className="mt-2 w-full rounded-2xl border border-outline-variant bg-surface px-3 py-2.5 text-sm"
              >
                <option value="">{myRoom.loading ? 'Loading rooms…' : 'Choose your room'}</option>
                {[...new Set(myRoom.rooms.map((r) => r.block))].map((block) => (
                  <optgroup key={block} label={block}>
                    {myRoom.rooms
                      .filter((r) => r.block === block)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div
            className="flex items-center gap-3 rounded-3xl bg-primary-container/50 p-4 opacity-70"
            aria-disabled
          >
            <UsersIcon size={22} className="shrink-0 text-primary" />
            <div>
              <p className="flex items-center gap-2 font-bold">
                Shared hall facility
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold">
                  Coming soon
                </span>
              </p>
              <p className="text-sm text-on-surface-variant">
                Corridors, washrooms, kitchenette, stairs or grounds.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <Eyebrow>Select category *</Eyebrow>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {categories.map((c) => {
              const active = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setCategoryId(c.id);
                    setFaultItemId('');
                    setError('');
                  }}
                  className={cx(
                    'relative rounded-3xl border-2 bg-surface p-4 text-left shadow-sm transition',
                    active ? 'border-primary' : 'border-transparent hover:border-outline-variant',
                  )}
                >
                  <CategoryTile name={c.name} active={active} />
                  {active && (
                    <span className="absolute top-3 right-3 grid h-6 w-6 place-items-center rounded-full bg-primary text-on-primary">
                      <CheckIcon size={14} />
                    </span>
                  )}
                  <p className="mt-3 font-bold">{c.name}</p>
                  <p className="line-clamp-1 text-xs text-on-surface-variant">
                    {c.items.map((i) => i.name).join(', ')}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {category && (
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="font-bold">What is broken?</h2>
              <span className="ml-auto text-xs font-semibold text-primary">Select one</span>
            </div>
            {category.items.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No faults listed under {category.name}.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Fault">
                {category.items.map((i) => {
                  const active = i.id === faultItemId;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setFaultItemId(i.id);
                        setError('');
                      }}
                      className={cx(
                        'flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold',
                        active
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant bg-surface hover:border-primary',
                      )}
                    >
                      <span
                        className={cx(
                          'grid h-4 w-4 place-items-center rounded-full border-2',
                          active ? 'border-on-primary' : 'border-outline',
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-on-primary" />}
                      </span>
                      {i.name}
                      {i.defaultPriority === 'URGENT' && (
                        <span
                          className={cx(
                            'text-xs font-bold',
                            active ? 'text-tertiary-container' : 'text-tertiary',
                          )}
                        >
                          Urgent
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {safety}
          </Card>
        )}

        <ErrorText>{error}</ErrorText>
        <Button onClick={() => go(2)} disabled={!item || !myRoom.roomId}>
          Continue to details <ArrowRightIcon size={18} />
        </Button>
      </div>,
    );
  }

  /* ---------------------------------------------------------------- step 2 */
  if (step === 2) {
    return frame(
      <div className="space-y-5">
        {header(
          'Problem details & photos',
          flagged && (
            <span className="rounded-full bg-tertiary-container px-2.5 py-0.5 text-on-tertiary-container normal-case">
              Priority flag
            </span>
          ),
        )}

        <Card className="flex items-center gap-3">
          {category && <CategoryTile name={category.name} active />}
          <div className="min-w-0 flex-1">
            <Eyebrow>Your report</Eyebrow>
            <p className="font-bold">
              {category?.name} › {item?.name}
            </p>
            <p className="flex items-center gap-1 text-sm text-on-surface-variant">
              <BuildingIcon size={14} /> {myRoom.room?.label ?? 'My room'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="grid h-10 w-10 place-items-center rounded-full text-primary hover:bg-primary-container"
            aria-label="Change category or fault"
          >
            <PencilIcon size={18} />
          </button>
        </Card>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="description" className="font-bold">
              Detailed description <span className="text-tertiary">*</span>
            </label>
            <span className="text-xs text-on-surface-variant">
              {description.length} / {MAX_DESCRIPTION}
            </span>
          </div>
          <Textarea
            id="description"
            rows={5}
            maxLength={MAX_DESCRIPTION}
            placeholder="What happened, where exactly, and since when? e.g. The tap in the washroom drips all night."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {description && (
            <button
              type="button"
              onClick={() => setDescription('')}
              className="mt-1 text-xs font-semibold text-on-surface-variant underline"
            >
              Clear
            </button>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">
              Attach photographs{' '}
              <span className="font-normal text-on-surface-variant">(max {MAX_PHOTOS})</span>
            </p>
            {photos.length > 0 && (
              <span className="rounded-full bg-success-container px-2.5 py-0.5 text-xs font-semibold text-on-success-container">
                {photos.length} of {MAX_PHOTOS} added
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <div key={p.preview} className="overflow-hidden rounded-3xl bg-surface shadow-sm">
                <div className="relative">
                  <img
                    src={p.preview}
                    alt={`Photo ${i + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-on-surface/70 text-surface"
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
                <p className="truncate px-3 py-2 text-xs">
                  {p.file.name} · {(p.file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-outline-variant bg-surface p-3 text-center hover:border-primary">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-variant text-primary">
                  <CameraIcon size={24} />
                </span>
                <span className="font-bold">
                  {busy === 'photos' ? 'Adding…' : `Add photo ${photos.length + 1}`}
                </span>
                <span className="text-xs text-on-surface-variant">
                  Tap to snap or upload ({MAX_PHOTOS - photos.length} remaining)
                </span>
                <input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  multiple
                  onChange={addPhotos}
                  disabled={busy !== ''}
                  className="sr-only"
                />
              </label>
            )}
          </div>
        </section>

        <Notice tone="tip" icon={<LightbulbIcon size={18} />}>
          <strong className="block text-xs tracking-wide uppercase">Custodian tip</strong>
          Step back a little so the custodian can see the broken item and where it is in the room.
        </Notice>
        {safety}

        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <Button variant="outline" className="px-5" onClick={() => go(1)}>
            <ArrowLeftIcon size={18} /> Back
          </Button>
          <Button onClick={() => go(3)} disabled={busy === 'photos'}>
            Continue to availability <ArrowRightIcon size={18} />
          </Button>
        </div>
      </div>,
    );
  }

  /* ---------------------------------------------------------------- step 3 */
  return frame(
    <div className="space-y-5">
      {header('Access availability & review')}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">When can the custodian visit?</h2>
          <p className="text-sm text-on-surface-variant">
            Pick the days and times you or a roommate can let them in. Optional, but it helps avoid
            a missed visit.
          </p>
        </div>
        <Eyebrow>Preferred day(s)</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {dayOptions.map((d) => {
            const active = days.includes(d.iso);
            return (
              <button
                key={d.iso}
                type="button"
                aria-pressed={active}
                onClick={() => setDays(toggle(days, d.iso))}
                className={cx(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
                  active ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface',
                )}
              >
                {active ? <CheckCircleIcon size={16} /> : <CalendarIcon size={16} />}
                <span className="text-left leading-tight">
                  {d.label}
                  {d.label.length < 9 && (
                    <span className="block text-xs font-normal opacity-80">({d.weekday})</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <Eyebrow>Preferred time windows</Eyebrow>
        <div className="space-y-2">
          {WINDOWS.map((w) => {
            const active = windows.includes(w.id);
            return (
              <label
                key={w.id}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-3xl border-2 bg-surface p-4',
                  active ? 'border-primary' : 'border-transparent',
                )}
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-variant text-on-surface-variant">
                  {w.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-bold">{w.label} window</span>
                  <span className="text-sm text-on-surface-variant">{w.hours}</span>
                </span>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => setWindows(toggle(windows, w.id))}
                  className="h-5 w-5 accent-primary"
                />
              </label>
            );
          })}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="access" className="text-sm font-bold">
              Room access note{' '}
              <span className="font-normal text-on-surface-variant">(optional)</span>
            </label>
            <span className="text-xs text-on-surface-variant">
              {accessNote.length}/{MAX_ACCESS_NOTE}
            </span>
          </div>
          <Textarea
            id="access"
            rows={2}
            maxLength={MAX_ACCESS_NOTE}
            placeholder="e.g. My roommate is in if I am at lectures."
            value={accessNote}
            onChange={(e) => setAccessNote(e.target.value)}
          />
        </div>
      </section>

      <Card className="space-y-3">
        <div className="flex items-center">
          <h2 className="text-lg font-bold">Ticket summary</h2>
          {flagged && (
            <span className="ml-auto rounded-full bg-tertiary-container px-2.5 py-0.5 text-xs font-bold text-on-tertiary-container">
              {item?.defaultPriority === 'URGENT' ? 'Urgent' : 'High priority'}
            </span>
          )}
        </div>
        <SummaryRow icon={<BuildingIcon size={18} />} label="Location" onEdit={() => setStep(1)}>
          {myRoom.room?.label ?? 'My room'}
        </SummaryRow>
        <SummaryRow
          icon={
            category && (
              <CategoryTile name={category.name} size="sm" plain className="text-primary" />
            )
          }
          label="Classification"
          onEdit={() => setStep(1)}
        >
          {category?.name} · {item?.name}
        </SummaryRow>
        <div className="rounded-2xl bg-surface-variant/50 px-4 py-3">
          <Eyebrow className="text-primary">What you reported</Eyebrow>
          <p className="mt-1 line-clamp-3 text-sm">{description.trim()}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-surface-variant/50 px-3 py-2">
            <p className="font-bold">
              {photos.length} photo{photos.length === 1 ? '' : 's'}
            </p>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs font-semibold text-primary"
            >
              {photos.length ? 'Change' : 'Add photos'}
            </button>
          </div>
          <div className="rounded-2xl bg-surface-variant/50 px-3 py-2">
            <p className="font-bold">
              {days.length
                ? dayOptions
                    .filter((d) => days.includes(d.iso))
                    .map((d) => d.weekday)
                    .join(' / ')
                : 'Any day'}
            </p>
            <p className="text-xs text-on-surface-variant">
              {windows.length
                ? WINDOWS.filter((w) => windows.includes(w.id))
                    .map((w) => w.label)
                    .join(' & ')
                : 'Any time'}
            </p>
          </div>
        </div>
      </Card>

      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <Button variant="outline" className="px-5" onClick={() => go(2)} disabled={busy !== ''}>
          <ArrowLeftIcon size={18} /> Back
        </Button>
        <Button onClick={() => void submit()} disabled={busy !== ''}>
          {busy === 'sending' ? 'Sending report…' : 'Submit request'} <SendIcon size={18} />
        </Button>
      </div>
    </div>,
  );
}

function SummaryRow({
  icon,
  label,
  children,
  onEdit,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-container text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <Eyebrow>{label}</Eyebrow>
        <p className="font-bold">{children}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-1 text-sm font-semibold text-primary"
      >
        <PencilIcon size={14} /> Edit
      </button>
    </div>
  );
}

function Submitted({ result, onAnother }: { result: Result; onAnother: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-container text-on-success-container">
          <CheckIcon size={32} />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold">Fault reported</h1>
        {result.reference && (
          <p className="mt-1 text-sm">
            Reference: <strong className="font-mono">{result.reference}</strong>
          </p>
        )}
        <p className="mt-2 text-on-surface-variant">
          Your report has been sent. We will let you know when it is reviewed and a visit is booked.
        </p>
      </Card>
      {result.photoErrors.length > 0 && (
        <Notice tone="warning" icon={<AlertIcon size={18} />}>
          <p className="font-semibold">Some photos did not upload:</p>
          <ul className="list-disc pl-5">
            {result.photoErrors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </Notice>
      )}
      <Link
        to={`/tickets?focus=${result.ticketId}`}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 font-semibold text-on-primary"
      >
        View this ticket <ArrowRightIcon size={18} />
      </Link>
      <Button variant="outline" onClick={onAnother}>
        Report another fault
      </Button>
    </div>
  );
}
