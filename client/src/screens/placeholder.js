import { escapeHtml } from '../router.js';

/** Shared "coming soon" block so every feature screen shows its owner and backlog items. */
export function placeholder({ title, owner, backlog, body = '' }) {
  return `
    <section class="card">
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">Owner: ${escapeHtml(owner)} · Backlog: ${escapeHtml(backlog)}</p>
      ${body}
    </section>`;
}
