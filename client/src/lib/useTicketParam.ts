// OWNER: Andrew. The ticket panel's open ticket lives in the URL (?ticket=<id>), so the phone's
// back button closes it and a link can open a ticket directly.
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export function useTicketParam() {
  const [params, setParams] = useSearchParams();
  const ticketId = params.get('ticket');
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('ticket', id);
        return next;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete('ticket');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { ticketId, open, close };
}
