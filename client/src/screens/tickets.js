// OWNER: Ayan — PB-010, PB-011, PB-020, PB-022, PB-023. Ticket list, detail, review.
import { api } from '../api.js';
import { escapeHtml } from '../router.js';
import { placeholder } from './placeholder.js';

export async function ticketsScreen(el) {
  const { tickets } = await api.get('/tickets');
  const rows = tickets.length
    ? `<ul>${tickets
        .map(
          (t) =>
            `<li>${escapeHtml(t.faultItem.name)} · ${escapeHtml(t.room.block.name)} ${escapeHtml(t.room.number)} · <span class="badge">${escapeHtml(t.status)}</span></li>`,
        )
        .join('')}</ul>`
    : '<p>No tickets yet.</p>';
  el.innerHTML = placeholder({
    title: 'Tickets',
    owner: 'Ayan',
    backlog: 'PB-010, PB-011, PB-020, PB-022, PB-023',
    body: rows,
  });
}
