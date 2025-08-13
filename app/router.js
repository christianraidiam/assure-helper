// app/router.js
// Hash router that works with <a href="#/..."> tabs. No data-route needed.

const moduleCache = new Map();

/** Map route -> dynamic import path */
const ROUTES = {
  navigator: () => import('../tools/navigator/view.js'),
  jwt:       () => import('../tools/jwt/view.js'),
  json:      () => import('../tools/json-viewer/view.js'),
  openapi:   () => import('../tools/openapi/view.js'),
};

/** Parse current hash (#/route) -> route key */
function currentRoute() {
  const raw = (location.hash || '').replace(/^#\/?/, '').trim();
  if (!raw) return 'navigator';
  const first = raw.split('/')[0].toLowerCase();
  return ROUTES[first] ? first : 'navigator';
}

/** Highlight active header tab by matching href */
function setActiveTab() {
  const hash = location.hash || '#/navigator';
  document.querySelectorAll('.tabs .tab').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });
}

/** Render route into #app */
async function render(route) {
  const outlet = document.getElementById('app');
  if (!outlet) {
    console.error('[router] #app outlet not found in DOM.');
    return;
  }

  // lightweight loading state
  outlet.innerHTML = `
    <div style="padding:16px; color:var(--accent,#00e38c); opacity:.9;">
      Loading…
    </div>
  `;

  try {
    let mod;
    if (moduleCache.has(route)) {
      mod = moduleCache.get(route);
    } else {
      console.debug('[router] importing module for route:', route);
      mod = await ROUTES[route]();
      moduleCache.set(route, mod);
    }

    outlet.innerHTML = '';

    if (mod && typeof mod.render === 'function') {
      await mod.render(outlet);
    } else {
      console.warn(`[router] Module for "${route}" did not export render(outlet).`, mod);
      outlet.innerHTML = `
        <div style="padding:16px; line-height:1.5">
          <div style="color:#ff6b6b; font-weight:600; margin-bottom:8px;">Tool not available</div>
          <div>This tool didn’t provide a <code>render(outlet)</code> function.</div>
          <div style="margin-top:8px; opacity:.8">Route: <code>${route}</code></div>
        </div>
      `;
    }
  } catch (err) {
    console.error(`[router] Failed to load route "${route}":`, err);
    const msg = (err && err.message) ? err.message : String(err);
    outlet.innerHTML = `
      <div style="padding:16px; line-height:1.5">
        <div style="color:#ff6b6b; font-weight:600; margin-bottom:8px;">Failed to load this tool</div>
        <div style="opacity:.9">${msg}</div>
        <div style="margin-top:8px; opacity:.7">Check that the file exists and the import path is correct.</div>
      </div>
    `;
  }
}

/** Navigate (programmable) */
export function navigate(to) {
  const normalized = ROUTES[to] ? to : 'navigator';
  if (currentRoute() !== normalized) {
    location.hash = `#/${normalized}`;
  } else {
    render(normalized);
  }
}

/** Initialize router */
export function initRouter() {
  // Force default route if none
  if (!location.hash) {
    location.replace('#/navigator');
  }

  // Render on hash change
  window.addEventListener('hashchange', () => {
    setActiveTab();
    render(currentRoute());
  });

  // Initial render
  setActiveTab();
  render(currentRoute());
}

// Auto-init safeguard
if (!window.__assureRouterBooted) {
  window.__assureRouterBooted = true;
  window.addEventListener('DOMContentLoaded', () => {
    // Ensure #app is present before init
    if (document.getElementById('app')) {
      initRouter();
    } else {
      console.error('[router] #app outlet not found in DOM on DOMContentLoaded.');
    }
  });
}
