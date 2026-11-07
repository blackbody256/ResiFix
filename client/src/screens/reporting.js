// OWNER: Amabe / Ayan — PB-005..PB-009. Resident fault reporting.
import { api } from '../api.js';
import { escapeHtml } from '../router.js';
import { placeholder } from './placeholder.js';

export async function reportingScreen(el) {
  const { categories } = await api.get('/reporting/fault-categories');
  const list = categories
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.name)}</strong>: ${c.items.map((i) => escapeHtml(i.name)).join(', ')}</li>`,
    )
    .join('');
  el.innerHTML = placeholder({
    title: 'Report a fault',
    owner: 'Amabe / Ayan',
    backlog: 'PB-005..PB-009',
    body: `<ul>${list}</ul><p class="muted">TODO: report form with photo upload.</p>`,
  });
}
