// tools/jwt/view.js
// JWT → JSON with live decode, single bordered field (no double box), and basic highlighting

import { state, saveState } from '../../app/state.js';
import { decodeJWT } from '../../lib/jwt-utils.js';

// Small HTML escaper
const esc = (s='') => s
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;');

/** Highlight the three JWT parts (header.payload.signature) */
function highlightJWT(token) {
  if (!token) return '';
  const parts = token.split('.');
  const [h = '', p = '', s = ''] = parts;
  const rest = parts.length > 3 ? '.' + parts.slice(3).join('.') : '';
  const seg = (txt, cls) => `<span class="jwt-${cls}">${esc(txt)}</span>`;
  const dot = `<span class="jwt-dot">.</span>`;
  // Only show three segments; if anything else remains, show it plainly (rare, e.g., malformed tokens)
  return [
    seg(h, 'header'),
    p ? dot + seg(p, 'payload') : '',
    s ? dot + seg(s, 'signature') : '',
    rest ? esc(rest) : ''
  ].join('');
}

/** Very lightweight JSON syntax highlighting */
function highlightJSON(obj) {
  if (obj == null) return '';
  const json = JSON.stringify(obj, null, 2);
  const html = esc(json)
    // keys
    .replace(/(^|\n)(\s*)\"([^"]+)\":/g,
      (_, brk, sp, key) => `${brk}${sp}<span class="j-key">"${key}"</span>:`)
    // strings (values)
    .replace(/: \"([^"]*)\"/g,
      (_, val) => `: <span class="j-str">"${esc(val)}"</span>`)
    // numbers
    .replace(/: (-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (_, num) => `: <span class="j-num">${num}</span>`)
    // booleans
    .replace(/: (true|false)/g,
      (_, b) => `: <span class="j-bool">${b}</span>`)
    // null
    .replace(/: null/g, ': <span class="j-null">null</span>');
  return html;
}

/** Render JWT tool */
export async function render(root) {
  root.innerHTML = `
    <section class="section" style="max-width:1300px;margin-inline:auto;">
      <h1 style="text-align:center;font-size:44px;margin:0 0 18px;">JWT → JSON</h1>

      <div class="jwt-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <!-- LEFT: input -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div class="label" style="font-size:18px;">Encoded value (JWT)</div>
            <button id="jwt-clear" class="btn btn-ghost">Clear</button>
          </div>

          <!-- Single bordered wrapper; textarea + overlay are borderless/transparent -->
          <div class="code-field"
               style="position:relative;border:1px solid var(--stroke);background:#08333a;border-radius:12px;">
            <pre id="jwt-hl"
                 aria-hidden="true"
                 style="margin:0;white-space:pre-wrap;word-break:break-word;padding:12px;border:0;background:transparent;color:var(--text);opacity:.95;"></pre>
            <textarea id="jwt-input"
                      spellcheck="false"
                      placeholder="Paste a JWT here…"
                      style="position:absolute;inset:0;resize:vertical;width:100%;height:100%;
                             border:0;outline:none;background:transparent;color:transparent;
                             caret-color:var(--text);padding:12px;font:14px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;"></textarea>
          </div>

          <div id="jwt-status" class="label" style="margin-top:10px;opacity:.8;">
            Paste a token to decode.
          </div>
        </div>

        <!-- RIGHT: output -->
        <div>
          <div style="margin-bottom:12px;">
            <div class="label" style="font-size:16px;margin-bottom:6px;">Decoded header</div>
            <pre id="jwt-header"
                 class="kv"
                 style="min-height:120px;overflow:auto;"></pre>
          </div>
          <div>
            <div class="label" style="font-size:16px;margin-bottom:6px;">Decoded payload</div>
            <pre id="jwt-payload"
                 class="kv"
                 style="min-height:220px;overflow:auto;"></pre>
          </div>
        </div>
      </div>
    </section>
  `;

  const input   = root.querySelector('#jwt-input');
  const overlay = root.querySelector('#jwt-hl');
  const status  = root.querySelector('#jwt-status');
  const outH    = root.querySelector('#jwt-header');
  const outP    = root.querySelector('#jwt-payload');
  const clearBtn= root.querySelector('#jwt-clear');

  // Seed from saved state (keeps user work between reloads)
  if (state?.jwt?.token) {
    input.value = state.jwt.token;
    overlay.innerHTML = highlightJWT(input.value);
  }

  function renderDecode() {
    const raw = input.value.trim();
    state.jwt.token = raw;
    saveState();

    // Update JWT colored overlay
    overlay.innerHTML = highlightJWT(raw);

    if (!raw) {
      status.textContent = 'Paste a token to decode.';
      outH.innerHTML = '';
      outP.innerHTML = '';
      return;
    }

    try {
      const { header, payload } = decodeJWT(raw);
      status.textContent = 'Decoded successfully.';
      outH.innerHTML = highlightJSON(header);
      outP.innerHTML = highlightJSON(payload);
    } catch (e) {
      status.textContent = 'Invalid JWT: ' + (e?.message || e);
      outH.innerHTML = '';
      outP.innerHTML = '';
    }
  }

  // Live decoding and highlighting
  input.addEventListener('input', renderDecode);

  // Keep scroll of overlay and textarea in sync
  input.addEventListener('scroll', () => {
    overlay.scrollTop  = input.scrollTop;
    overlay.scrollLeft = input.scrollLeft;
  });

  // Clear
  clearBtn.addEventListener('click', () => {
    input.value = '';
    renderDecode();
    input.focus();
  });

  // Initial pass
  renderDecode();
}
