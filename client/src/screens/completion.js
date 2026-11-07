// OWNER: Selina — PB-019, PB-021, PB-025..PB-029. Confirm/dispute repairs, rate, notifications.
import { placeholder } from './placeholder.js';

export async function completionScreen(el) {
  el.innerHTML = placeholder({
    title: 'Confirm repairs',
    owner: 'Selina',
    backlog: 'PB-019, PB-021, PB-025..PB-029',
    body: '<p class="muted">TODO: confirm or dispute completed repairs, rate the service.</p>',
  });
}
