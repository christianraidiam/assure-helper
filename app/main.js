// app/main.js
// Boot the router and keep header tabs in sync with the current hash.

import { initRouter } from './router.js';

function syncActiveTabs() {
  const hash = location.hash || '#/navigator';
  document.querySelectorAll('.tabs .tab').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Start router (renders current route + handles hash changes)
  initRouter();

  // Highlight active tab initially and on navigation
  syncActiveTabs();
  window.addEventListener('hashchange', syncActiveTabs);
});
