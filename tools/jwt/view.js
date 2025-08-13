// tools/jwt/view.js
import { state, saveState } from '../../app/state.js';
import { decodeJWT } from '../../lib/jwt-utils.js';
import { copy } from '../../app/ui.js';

export async function render(root) {
  root.innerHTML = `
    <section class="section" style="max-width:1200px;margin-inline:auto;">
      <h1 style="text-align:center;margin-bottom:18px;">JWT → JSON</h1>

      <style>
        .jwt-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media (max-width: 980px){.jwt-grid{grid-template-columns:1fr}}
        .jwt-left{display:flex;flex-direction:column;gap:10px}
        .jwt-status{background:#0e332f;border:1px solid var(--stroke);border-radius:10px;padding:10px 12px;color:var(--text)}
        .jwt-status.valid{background:#0e2f1e;border-color:#1b6446}
        .jwt-status.invalid{background:#3a1919;border-color:#6f2c2c}
        .jwt-area{min-height:280px}
        .panel{display:flex;flex-direction:column;gap:10px}
        .panel-head{display:flex;align-items:center;justify-content:space-between}
        .panel-title{color:var(--muted);font-weight:600;letter-spacing:.02em}
        .json-pre{min-height:280px}
        .tabbar{display:flex;gap:8px}
      </style>

      <div class="jwt-grid">
        <div class="jwt-left">
          <div class="panel-head">
            <div class="panel-title">Encoded value (JWT)</div>
            <div class="tabbar">
              <button id="btn-decode" class="btn btn-primary">Decode</button>
              <button id="btn-clear" class="btn btn-ghost">Clear</button>
            </div>
          </div>
          <textarea id="jwt-input" class="textarea jwt-area" placeholder="Paste a JWT here…">${state.jwt.token || ''}</textarea>
          <div id="jwt-status" class="jwt-status">Paste a token to decode.</div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">Decoded header</div>
            <div class="tabbar">
              <button id="copy-header" class="btn btn-ghost">Copy</button>
            </div>
          </div>
          <pre id="out-header" class="kv json-pre empty">{ }</pre>

          <div class="panel-head" style="margin-top:8px;">
            <div class="panel-title">Decoded payload</div>
            <div class="tabbar">
              <button id="copy-payload" class="btn btn-ghost">Copy</button>
            </div>
          </div>
          <pre id="out-payload" class="kv json-pre empty">{ }</pre>
        </div>
      </div>
    </section>
  `;

  // Elements
  const input = root.querySelector('#jwt-input');
  const statusEl = root.querySelector('#jwt-status');
  const outHeader = root.querySelector('#out-header');
  const outPayload = root.querySelector('#out-payload');

  // Persist textarea + auto-decode (debounced)
  let debounceT = null;
  const scheduleDecode = () => {
    clearTimeout(debounceT);
    debounceT = setTimeout(decodeNow, 250); // small delay for smooth typing
  };

  const onInput = (e) => {
    state.jwt.token = e.target.value;
    saveState();
    scheduleDecode();
  };

  input.addEventListener('input', onInput);
  input.addEventListener('paste', () => scheduleDecode());

  // Buttons
  root.querySelector('#btn-clear').addEventListener('click', () => {
    input.value = '';
    state.jwt.token = '';
    saveState();
    setStatus('Paste a token to decode.', 'neutral');
    setJson(outHeader, {});
    setJson(outPayload, {});
  });

  root.querySelector('#btn-decode').addEventListener('click', () => decodeNow());
  root.querySelector('#copy-header').addEventListener('click', () => copy(outHeader.textContent));
  root.querySelector('#copy-payload').addEventListener('click', () => copy(outPayload.textContent));

  // Decode on load if we already have a token
  if ((state.jwt.token || '').trim()) decodeNow();

  // Helpers
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.classList.remove('valid', 'invalid');
    if (kind === 'valid') statusEl.classList.add('valid');
    if (kind === 'invalid') statusEl.classList.add('invalid');
  }

  function setJson(preEl, obj) {
    const pretty = JSON.stringify(obj, null, 2);
    preEl.textContent = pretty;
    preEl.classList.toggle('empty', pretty === '{ }' || pretty === '{}');
  }

  function decodeNow() {
    const token = (input.value || '').trim();
    if (!token) {
      setStatus('Paste a token to decode.', 'neutral');
      setJson(outHeader, {});
      setJson(outPayload, {});
      return;
    }
    try {
      const { header, payload } = decodeJWT(token); // decode (no signature verification)
      setJson(outHeader, header || {});
      setJson(outPayload, payload || {});
      setStatus('Decoded successfully (signature not verified).', 'valid');
    } catch (err) {
      setJson(outHeader, {});
      setJson(outPayload, {});
      setStatus(`Invalid JWT: ${err && err.message ? err.message : String(err)}`, 'invalid');
    }
  }
}
