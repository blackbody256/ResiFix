// OWNER: Andrew — PB-012..PB-018, PB-024. Work queue, visits, repair proof.
import { placeholder } from './placeholder.js';

export async function custodianScreen(el) {
  el.innerHTML = placeholder({
    title: 'Work queue',
    owner: 'Andrew',
    backlog: 'PB-012..PB-018, PB-024',
    body: '<p class="muted">TODO: assigned tickets, schedule visits, mark missed, upload proof.</p>',
  });
}
