import { escapeHtml } from '../router.js';
import { navItems } from '../routes.js';

export async function homeScreen(el, { user }) {
  const links = navItems
    .filter((i) => i.path !== '/' && (!i.roles || i.roles.includes(user.role)))
    .map((i) => `<li><a href="#${i.path}">${escapeHtml(i.label)}</a></li>`)
    .join('');
  el.innerHTML = `
    <section class="card">
      <h1>Hello, ${escapeHtml(user.name)}</h1>
      <p class="muted">Signed in as ${escapeHtml(user.role.toLowerCase())} · ${escapeHtml(user.phone)}</p>
      <ul class="links">${links}</ul>
    </section>`;
}
