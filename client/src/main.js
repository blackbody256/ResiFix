import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { startRouter, navigate } from './router.js';
import { session } from './session.js';
import { routes, navItems } from './routes.js';

registerSW({ immediate: true });

const nav = document.getElementById('nav');

function renderNav(path, user) {
  if (!user || path === '/login') {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  nav.replaceChildren(
    ...navItems
      .filter((item) => !item.roles || item.roles.includes(user.role))
      .map((item) => {
        const a = document.createElement('a');
        a.href = `#${item.path}`;
        a.textContent = item.label;
        if (item.path === path) a.setAttribute('aria-current', 'page');
        return a;
      }),
  );
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'link';
  logout.textContent = 'Log out';
  logout.onclick = () => {
    session.clear();
    navigate('/login');
  };
  nav.append(logout);
}

startRouter(routes, { outlet: document.getElementById('app'), onRender: renderNav });
