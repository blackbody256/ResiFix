// Tiny hash router. A route is { screen, roles?, public? }.
// A screen is `async (el, ctx) => void` that renders into `el`. It may return a cleanup function.
import { session } from './session.js';

let routes = {};
let outlet;
let onRender;
let cleanup = null;

export function navigate(path) {
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}

export function startRouter(routeTable, options) {
  routes = routeTable;
  ({ outlet, onRender } = options);
  window.addEventListener('hashchange', render);
  window.addEventListener('resifix:logout', () => navigate('/login'));
  render();
}

async function render() {
  const path = location.hash.slice(1) || '/';
  const route = routes[path] ?? routes['*'];
  const user = session.user;

  if (!route.public && !session.isLoggedIn()) return navigate('/login');
  if (route.roles && !route.roles.includes(user?.role)) return navigate('/');

  if (typeof cleanup === 'function') cleanup();
  outlet.replaceChildren();
  onRender?.(path, user);
  try {
    cleanup = await route.screen(outlet, { path, user, navigate });
  } catch (err) {
    console.error(err);
    outlet.innerHTML = `<p class="error">Something went wrong: ${escapeHtml(err.message)}</p>`;
  }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
