// OWNER: Amabe (API) / Ayan (UI): PB-005..PB-009. Resident fault reporting.
//
// PB-005 (UI): report a room fault. Pick a category and fault -> optional details -> optional
//   photos -> submit. Submitting creates the ticket (POST /reporting/tickets, Amabe), then
//   uploads each photo to POST /reporting/tickets/:id/photos. A failed photo upload never
//   loses the ticket. Until the API exists the form shows "not switched on yet" (501).
// PB-007 (UI): up to two photos, downscaled and re-encoded on the phone (lib/photos.ts).
//
// TODO(PB-005): offline queue (save the report and send it when the connection is back).
// TODO(PB-006): shared-facility faults (needs a schema change: Ticket.roomId is required).
// TODO(PB-008): availability (when the resident is in for a visit; not stored yet).
// TODO(PB-009): offer to follow a matching open fault instead of reporting a duplicate.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, ErrorText, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { MAX_PHOTOS, PHOTO_ACCEPT, preparePhoto } from '../lib/photos';
import { useApi } from '../lib/useApi';
import { Loading } from './FeaturePlaceholder';

const MAX_DESCRIPTION = 500;

interface FaultItem {
  id: string;
  name: string;
  defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}
interface CategoriesResponse {
  categories: { id: string; name: string; items: FaultItem[] }[];
}
/**
 * Proposed PB-005 contract (to agree with Amabe):
 *   POST /reporting/tickets { faultItemId, description? } -> 201 { ticket: { id, reference, status } }
 * The room comes from the resident's current occupancy on the server, never from the client.
 */
interface CreateTicketResponse {
  ticket: { id: string; reference?: string; status: string };
}

interface PickedPhoto {
  file: File;
  preview: string;
}

type Result = { ticketId: string; reference?: string; photoErrors: string[] };

export function Reporting() {
  const { data, error, loading } = useApi<CategoriesResponse>('/reporting/fault-categories');
  const [result, setResult] = useState<Result | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <Card>
      {result ? (
        <Submitted
          result={result}
          onAnother={() => {
            setResult(null);
            setFormKey((k) => k + 1);
          }}
        />
      ) : (
        <>
          <h1 className="text-xl font-semibold">Report a fault</h1>
          <p className="mb-4 text-sm text-slate-500">
            Tell us what is broken in your room. You can add photos.
          </p>
          {loading && <Loading />}
          <ErrorText>{error && friendlyError(error)}</ErrorText>
          {data &&
            (data.categories.length === 0 ? (
              <p className="text-sm">No fault types are set up for your hostel yet.</p>
            ) : (
              <ReportForm key={formKey} categories={data.categories} onDone={setResult} />
            ))}
        </>
      )}
    </Card>
  );
}

function ReportForm({
  categories,
  onDone,
}: {
  categories: CategoriesResponse['categories'];
  onDone: (result: Result) => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [faultItemId, setFaultItemId] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'photos' | 'sending'>('');

  // Release preview object URLs when the form goes away.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

  async function addPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow picking the same file again after removing it
    if (!files.length) return;

    const room = MAX_PHOTOS - photos.length;
    const take = files.slice(0, room);
    const problems: string[] = [];
    if (files.length > room) problems.push(`You can add up to ${MAX_PHOTOS} photos.`);

    setBusy('photos');
    const added: PickedPhoto[] = [];
    for (const file of take) {
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!faultItemId) {
      setError('Choose what is broken.');
      return;
    }
    setBusy('sending');
    setError('');

    let ticketId: string;
    let reference: string | undefined;
    try {
      const trimmed = description.trim();
      const { ticket } = await api.post<CreateTicketResponse>('/reporting/tickets', {
        faultItemId,
        ...(trimmed && { description: trimmed }),
      });
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

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Type of fault</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === category.id}
              onClick={() => {
                setCategoryId(c.id);
                setFaultItemId('');
              }}
              className={`rounded-full border px-4 py-2 text-sm ${
                c.id === category.id
                  ? 'border-brand-700 bg-brand-700 font-semibold text-white'
                  : 'border-slate-300 hover:border-brand-600 dark:border-slate-700'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">What is broken?</legend>
        {category.items.length === 0 ? (
          <p className="text-sm text-slate-500">No faults listed under {category.name}.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {category.items.map((item) => (
              <label
                key={item.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 ${
                  item.id === faultItemId
                    ? 'border-brand-700 bg-brand-50 dark:bg-slate-800'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="faultItem"
                  value={item.id}
                  checked={item.id === faultItemId}
                  onChange={() => setFaultItemId(item.id)}
                  className="accent-brand-700"
                />
                <span>{item.name}</span>
                {item.defaultPriority === 'URGENT' && (
                  <span className="ml-auto text-xs font-semibold text-red-700 dark:text-red-400">
                    Urgent
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor="description" className="mb-2 block text-sm font-semibold">
          Details <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <Textarea
          id="description"
          rows={3}
          maxLength={MAX_DESCRIPTION}
          placeholder="e.g. The tap in the bathroom drips all night."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="text-right text-xs text-slate-500">
          {description.length}/{MAX_DESCRIPTION}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">
          Photos <span className="font-normal text-slate-500">(optional, up to {MAX_PHOTOS})</span>
        </p>
        <div className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <div key={p.preview} className="relative">
              <img
                src={p.preview}
                alt={`Photo ${i + 1}`}
                className="h-24 w-24 rounded-lg border border-slate-300 object-cover dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-slate-800 text-sm text-white"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-brand-600 dark:border-slate-700">
              {busy === 'photos' ? 'Adding…' : '+ Add'}
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
      </div>

      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy !== ''}>
        {busy === 'sending' ? 'Sending report…' : 'Send report'}
      </Button>
    </form>
  );
}

function Submitted({ result, onAnother }: { result: Result; onAnother: () => void }) {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Fault reported</h1>
      {result.reference && (
        <p className="text-sm">
          Reference: <strong className="font-mono">{result.reference}</strong>
        </p>
      )}
      <p>
        Your report has been sent. We will let you know when it is reviewed and a visit is
        scheduled.
      </p>
      {result.photoErrors.length > 0 && (
        <div role="alert" className="text-sm text-red-700 dark:text-red-400">
          <p>Some photos did not upload:</p>
          <ul className="list-disc pl-5">
            {result.photoErrors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          to={`/tickets?focus=${result.ticketId}`}
          className="rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-600"
        >
          View this ticket
        </Link>
        <button
          type="button"
          onClick={onAnother}
          className="rounded-lg border border-slate-300 px-4 py-3 font-semibold dark:border-slate-700"
        >
          Report another fault
        </button>
      </div>
    </div>
  );
}

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
