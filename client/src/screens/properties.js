// OWNER: Amabe — PB-003, PB-004. Property, blocks, rooms, occupancy.
import { api } from '../api.js';
import { escapeHtml } from '../router.js';
import { placeholder } from './placeholder.js';

export async function propertiesScreen(el) {
  const { property } = await api.get('/properties/mine');
  const blocks = property.blocks
    .map(
      (b) =>
        `<li><strong>${escapeHtml(b.name)}</strong>: ${b.rooms.map((r) => escapeHtml(r.number)).join(', ')}</li>`,
    )
    .join('');
  el.innerHTML = placeholder({
    title: property.name,
    owner: 'Amabe',
    backlog: 'PB-003, PB-004',
    body: `<ul>${blocks}</ul><p class="muted">TODO: add/edit blocks, rooms and occupancy.</p>`,
  });
}
